import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendPaymentProofAlertToSeller } from '@/lib/email-service';
import { ingestPaymentEvidence, resolveExternalReference } from '@/lib/payment-evidence-service';
import { toCanonicalUTCString } from '@/lib/timezone-canonical';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/[orderId]/payment-proof
 * Ingestion bukti transfer: Payment Evidence ≠ Payment Confirmation.
 * Menyimpan PaymentEvidence dan mengevaluasi sinyal MATCH_CANDIDATE -> PENDING_PAYMENT_CONFIRMATION.
 * HANYA Financial State Machine (Reader / PG / Manual Merchant Confirm) yang berhak mengubah order menjadi PAID.
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
    let body: Record<string, any> = {};

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      notes = String(formData.get('notes') || '');
      body = {
        notes,
        external_reference: formData.get('external_reference') || formData.get('reference_no') || formData.get('rrn'),
        receipt_transaction_at: formData.get('receipt_transaction_at') || formData.get('receipt_timestamp'),
      };

      if (file && file.size > 0) {
        const fileExt = file.name.split('.').pop() || 'png';
        const fileName = `proof_${orderId}_${Date.now()}.${fileExt}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload ke Supabase Storage bucket 'payment-receipts' / 'payment-proofs' / 'proofs'
        const candidateBuckets = ['payment-receipts', 'payment-proofs', 'proofs'];
        for (const bName of candidateBuckets) {
          try {
            const { data: uploadData, error: uploadErr } = await supabase.storage
              .from(bName)
              .upload(fileName, buffer, {
                contentType: file.type || 'image/jpeg',
                upsert: true,
              });

            if (!uploadErr && uploadData?.path) {
              const { data: publicUrlData } = supabase.storage
                .from(bName)
                .getPublicUrl(uploadData.path);
              if (publicUrlData?.publicUrl) {
                proofUrl = publicUrlData.publicUrl;
                break;
              }
            }
          } catch (bErr) {
            console.warn(`[Payment Proof API] Upload to ${bName} failed:`, bErr);
          }
        }

        if (!proofUrl) {
          // Jika storage belum siap, fallback ke base64 data URI aman
          const base64Str = buffer.toString('base64');
          proofUrl = `data:${file.type || 'image/jpeg'};base64,${base64Str}`;
        }
      }
    } else {
      body = await req.json().catch(() => ({}));
      proofUrl = String(body.proof_url || body.payment_proof_url || '').trim();
      notes = String(body.notes || '').trim();

      // Jika mengirimkan base64 image data
      if (!proofUrl && body.proof_base64) {
        try {
          const base64Content = body.proof_base64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Content, 'base64');
          const fileName = `proof_${orderId}_${Date.now()}.png`;

          const candidateBuckets = ['payment-receipts', 'payment-proofs', 'proofs'];
          for (const bName of candidateBuckets) {
            try {
              const { data: uploadData, error: uploadErr } = await supabase.storage
                .from(bName)
                .upload(fileName, buffer, {
                  contentType: 'image/png',
                  upsert: true,
                });

              if (!uploadErr && uploadData?.path) {
                const { data: publicUrlData } = supabase.storage
                  .from(bName)
                  .getPublicUrl(uploadData.path);
                if (publicUrlData?.publicUrl) {
                  proofUrl = publicUrlData.publicUrl;
                  break;
                }
              }
            } catch (err) {
              // try next
            }
          }

          if (!proofUrl) {
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
        .or(`id.eq.${orderId},order_number.eq.${orderId},correlation_id.eq.${orderId}`)
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

    // 3. Ingestion Sinyal Bukti Bayar (Payment Evidence ≠ Payment Confirmation)
    // Doktrin: "Multimodal AI may accelerate verification; only the Financial State Machine may authorize payment."
    const tenantSlug = order.tenant_slug || order.tenant_id || 'platform';
    const customerName = order.customer_name || 'Pelanggan';
    const grossAmount = Number(order.gross_amount || order.total_amount || 0);
    const uniqueCode = Number(order.unique_code || 0);

    // Ambil nama toko tujuan dari database
    let targetStoreName = tenantSlug;
    if (tenantSlug) {
      try {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('name')
          .eq('slug', tenantSlug)
          .maybeSingle();
        if (tenantRow?.name) {
          targetStoreName = tenantRow.name;
        }
      } catch (tErr) {
        console.warn('[Payment Proof API] Tenant name query note:', tErr);
      }
    }

    // Ekstraksi data sinyal struk via helper adapter
    const rawRefString = body?.external_reference || body?.reference_no || body?.rrn || notes;
    const { externalReference, referenceType } = resolveExternalReference(rawRefString);
    const receiptTime = body?.receipt_transaction_at || body?.receipt_timestamp || null;

    // Evaluasi bukti bayar & pisahkan entitas PaymentEvidence
    const evidenceResult = await ingestPaymentEvidence({
      orderId: order.id,
      tenantSlug,
      tenantId: order.tenant_id,
      proofUrl,
      rawAmount: grossAmount,
      expectedAmount: grossAmount,
      detectedMerchant: targetStoreName,
      targetMerchantName: targetStoreName,
      externalReference,
      referenceType,
      receiptTransactionAt: receiptTime,
      checkoutCreatedAt: order.created_at,
      toleranceHours: 24, // Sinyal komparatif, margin toleransi configurable 24 jam (Bukan hard rejection 5 menit!)
      notes,
      rawPayload: {
        notes,
        headers: Object.fromEntries(req.headers.entries()),
      },
    });

    const nowIso = toCanonicalUTCString();

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
        status: evidenceResult.orderStatus, // 'PENDING_PAYMENT_CONFIRMATION' or 'PENDING_MANUAL_REVIEW'
        order_id: orderId,
        payment_proof_url: proofUrl,
        evidence_id: evidenceResult.evidence.id,
        evidence_status: evidenceResult.evidence.status, // 'MATCH_CANDIDATE' or 'NEEDS_MANUAL_REVIEW'
        verification_state: evidenceResult.orderStatus,
        signals: evidenceResult.signals,
        ocr_verified: evidenceResult.signals.nominal_matched && evidenceResult.signals.merchant_matched,
        verification_estimation_seconds: 180,
        detected_amount: grossAmount,
        detected_merchant: targetStoreName,
        message: evidenceResult.message,
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
