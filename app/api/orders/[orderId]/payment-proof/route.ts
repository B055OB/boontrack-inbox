import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendPaymentProofAlertToSeller } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/[orderId]/payment-proof
 * Menerima bukti transfer dari pembeli dan menyetel status order ke 'WAITING_CONFIRMATION'
 * (STRICT: JANGAN auto-paid tanpa verifikasi seller!)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId?: string }> }
) {
  try {
    const resolvedParams = await params;
    const orderId = String(resolvedParams?.orderId || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Parameter orderId wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Koneksi database tidak tersedia.' },
        { status: 500 }
      );
    }

    // 1. Ambil body payload (mendukung JSON atau FormData)
    let proofUrl = '';
    let notes = '';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      notes = String(formData.get('notes') || '');

      if (file && file.size > 0) {
        // Upload ke Supabase Storage bucket 'payment-proofs' atau fallback ke data URI
        const fileExt = file.name.split('.').pop() || 'png';
        const fileName = `proof_${orderId}_${Date.now()}.${fileExt}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('payment-proofs')
          .upload(fileName, buffer, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          });

        if (!uploadErr && uploadData?.path) {
          const { data: publicUrlData } = supabase.storage
            .from('payment-proofs')
            .getPublicUrl(uploadData.path);
          proofUrl = publicUrlData?.publicUrl || '';
        } else {
          // Jika bucket belum dibuat di storage, fallback ke base64 data URI aman
          const base64Str = buffer.toString('base64');
          proofUrl = `data:${file.type || 'image/jpeg'};base64,${base64Str}`;
        }
      }
    } else {
      const body = await req.json().catch(() => ({}));
      proofUrl = String(body.proof_url || body.payment_proof_url || '').trim();
      notes = String(body.notes || '').trim();

      // Jika mengirimkan base64 image data
      if (!proofUrl && body.proof_base64) {
        try {
          const base64Content = body.proof_base64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Content, 'base64');
          const fileName = `proof_${orderId}_${Date.now()}.png`;

          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('payment-proofs')
            .upload(fileName, buffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (!uploadErr && uploadData?.path) {
            const { data: publicUrlData } = supabase.storage
              .from('payment-proofs')
              .getPublicUrl(uploadData.path);
            proofUrl = publicUrlData?.publicUrl || '';
          } else {
            proofUrl = body.proof_base64;
          }
        } catch (bErr) {
          console.warn('[Payment Proof API] Base64 upload fallback note:', bErr);
          proofUrl = body.proof_base64;
        }
      }
    }

    if (!proofUrl) {
      return NextResponse.json(
        { success: false, error: 'Bukti transfer (URL gambar atau file) wajib disertakan.' },
        { status: 400 }
      );
    }

    // 2. Cari order yang sesuai
    let { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      const { data: altOrder } = await supabase
        .from('orders')
        .select('*')
        .or(`id.eq.${orderId},order_id.eq.${orderId},invoice_no.eq.${orderId}`)
        .maybeSingle();
      if (altOrder) order = altOrder;
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: `Order #${orderId} tidak ditemukan.` },
        { status: 404 }
      );
    }

    // Guard: Jika order sudah PAID, jangan ubah kembali ke waiting
    const currentStatus = String(order.status || order.payment_status || '').toUpperCase();
    if (['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(currentStatus)) {
      return NextResponse.json(
        {
          success: true,
          status: 'PAID',
          message: 'Order ini telah berstatus LUNAS (PAID) sebelumnya.',
        },
        { status: 200 }
      );
    }

    // 3. Update status order ke 'WAITING_CONFIRMATION' (STRICT: JANGAN auto-paid!)
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: 'WAITING_CONFIRMATION',
      payment_status: 'WAITING_CONFIRMATION',
      order_status: 'WAITING_CONFIRMATION',
      payment_proof_url: proofUrl,
      updated_at: nowIso,
    };

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order.id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[Payment Proof API] Database update error:', updateErr);
      return NextResponse.json(
        { success: false, error: 'Gagal memperbarui status verifikasi pesanan.' },
        { status: 500 }
      );
    }

    const tenantSlug = order.tenant_slug || order.tenant_id || 'platform';
    const customerName = order.customer_name || 'Pelanggan';
    const grossAmount = Number(order.gross_amount || order.total_amount || 0);

    // 4. Kirim sinyal PWA alert / notifikasi sistem ke CS Inbox
    try {
      const alertMsg = `🔔 BUKTI TRANSFER MASUK: ${customerName} telah mengunggah bukti transfer untuk Order #${orderId} (Rp ${grossAmount.toLocaleString('id-ID')}). Segera verifikasi mutasi rekening Anda.`;

      // Cari conversation bila ada
      let convId: string | null = null;
      if (order.customer_phone) {
        const cleanPhone = order.customer_phone.replace(/\D/g, '');
        const { data: convData } = await supabase
          .from('conversations')
          .select('id')
          .or(`customer_phone.eq.${cleanPhone},user_identifier.eq.${cleanPhone}`)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (convData?.id) {
          convId = convData.id;
        }
      }

      await supabase.from('messages').insert({
        ...(convId ? { conversation_id: convId } : {}),
        tenant_slug: tenantSlug,
        tenant_id: order.tenant_id || tenantSlug,
        sender_type: 'system',
        sender: 'system',
        message_body: alertMsg,
        text: alertMsg,
        channel: 'whatsapp',
        user_name: 'Sistem BoonTrack',
        payload: {
          is_payment_proof: true,
          order_id: orderId,
          proof_url: proofUrl,
          notes,
          status: 'WAITING_CONFIRMATION',
        },
        created_at: nowIso,
      });

      if (convId) {
        await supabase
          .from('conversations')
          .update({
            last_message: `Bukti transfer diunggah (#${orderId})`,
            last_message_at: nowIso,
          })
          .eq('id', convId);
      }
    } catch (msgErr) {
      console.warn('[Payment Proof API] Inbox alert note:', msgErr);
    }

    // 5. Kirim email alert ke seller via Resend
    sendPaymentProofAlertToSeller({
      orderId: String(orderId),
      tenantSlug,
      tenantId: order.tenant_id,
      customerName,
      customerPhone: order.customer_phone || undefined,
      customerEmail: order.customer_email || undefined,
      productTitle: order.product_title || 'Pesanan Produk',
      grossAmount,
      uniqueCode: Number(order.unique_code || 0),
      paymentProofUrl: proofUrl,
      notes,
    }).catch((emailErr) => {
      console.warn('[Payment Proof API] Seller email dispatch warning:', emailErr);
    });

    return NextResponse.json(
      {
        success: true,
        status: 'WAITING_CONFIRMATION',
        order_id: orderId,
        payment_proof_url: proofUrl,
        message: 'Bukti transfer berhasil dikirim. Menunggu verifikasi mutasi oleh penjual.',
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Payment Proof API] Exception:', errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
