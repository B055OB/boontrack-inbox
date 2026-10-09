import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

/**
 * POST /api/admin/transactions/offline
 * Pencatatan transaksi manual/offline (Transfer Bank / Tunai) oleh Super Admin
 * untuk klien offline / B2B direct contracts (seperti Tumbuh Kembang Anak atau B2B Custom App).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_id,
      amount_idr,
      payment_channel,
      category,
      reference_no,
      notes,
    } = body;

    // 1. Validasi Input
    if (!tenant_id) {
      return NextResponse.json(
        { success: false, message: 'Tenant / Klien wajib dipilih.' },
        { status: 400 }
      );
    }

    const numericAmount = Number(amount_idr);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { success: false, message: 'Nominal pembayaran harus berupa angka dan lebih besar dari 0.' },
        { status: 400 }
      );
    }

    if (!reference_no || !String(reference_no).trim()) {
      return NextResponse.json(
        { success: false, message: 'Nomor referensi / nomor SPK / invoice wajib diisi.' },
        { status: 400 }
      );
    }

    const channel = payment_channel === 'CASH' ? 'CASH' : 'MANUAL_TRANSFER';
    const validCategories = ['SAAS_SUBSCRIPTION', 'B2B_CUSTOM_APP', 'SPECIAL_CASE'];
    const cat = validCategories.includes(category) ? category : 'SAAS_SUBSCRIPTION';
    const cleanRefNo = String(reference_no).trim();
    const cleanNotes = notes ? String(notes).trim() : '';

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, message: 'Database client tidak tersedia.' },
        { status: 500 }
      );
    }

    // 2. Resolve Tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, slug, tier, category, metadata')
      .or(`id.eq.${tenant_id},slug.eq.${tenant_id}`)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json(
        { success: false, message: 'Tenant / Klien tidak ditemukan di database.' },
        { status: 404 }
      );
    }

    // 3. Insert ke credit_transactions dengan status SETTLED
    const { data: transaction, error: txErr } = await supabase
      .from('credit_transactions')
      .insert({
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        type: 'SUBSCRIPTION_PAYMENT',
        amount_idr: numericAmount,
        tier: tenant.tier || 'PRO_SCALE',
        duration_months: 1,
        invoice_id: cleanRefNo,
        reference_no: cleanRefNo,
        category: cat,
        payment_channel: channel,
        status: 'SETTLED',
        notes: cleanNotes || null,
        metadata: {
          manual: true,
          recorded_by: 'SUPER_ADMIN',
          client_name: tenant.name,
          recorded_at: new Date().toISOString(),
          category: cat,
          reference_no: cleanRefNo,
        },
      })
      .select('*')
      .single();

    if (txErr) {
      console.error('[Offline Transaction] Insert error:', txErr);
      return NextResponse.json(
        { success: false, message: `Gagal mencatat transaksi: ${txErr.message}` },
        { status: 500 }
      );
    }

    // 4. Catat Log Audit ke tenant_credit_ledger
    try {
      const ledgerDesc = `[Offline ${channel}] ${cat} Rp ${numericAmount.toLocaleString('id-ID')} - Ref: ${cleanRefNo}${cleanNotes ? ` - ${cleanNotes}` : ''}`;
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenant.id,
        amount: 0,
        balance_after: 0,
        action: 'OFFLINE_PAYMENT',
        description: ledgerDesc,
      });
    } catch (ledgerErr) {
      console.warn('[Offline Transaction] Warning recording ledger audit:', ledgerErr);
    }

    // 5. Jika kategori SAAS_SUBSCRIPTION, sinkronkan juga ke shop_subscriptions jika ada
    try {
      if (cat === 'SAAS_SUBSCRIPTION') {
        const periodStart = new Date().toISOString();
        const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        const tierEnum = ['STARTER', 'PRO_SCALE', 'ENTERPRISE'].includes(tenant.tier)
          ? tenant.tier
          : 'PRO_SCALE';

        await supabase.from('shop_subscriptions').insert({
          tenant_id: tenant.id,
          tier: tierEnum,
          duration_months: 1,
          starts_at: periodStart,
          current_period_starts_at: periodStart,
          current_period_ends_at: periodEnd,
          expires_at: periodEnd,
          status: 'ACTIVE',
          invoice_id: cleanRefNo,
          amount_paid: numericAmount,
          metadata: {
            channel,
            category: cat,
            manual: true,
          },
        });
      }
    } catch (subErr) {
      console.warn('[Offline Transaction] Warning recording shop subscription:', subErr);
    }

    return NextResponse.json({
      success: true,
      message: `Pembayaran offline Rp ${numericAmount.toLocaleString('id-ID')} untuk ${tenant.name} berhasil dicatat (SETTLED).`,
      data: transaction,
    });
  } catch (err: any) {
    console.error('[Offline Transaction API] Unhandled error:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
