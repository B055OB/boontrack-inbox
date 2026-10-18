import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/tenants/[slug]/resellers/[id]
 * Mutasi status kemitraan reseller oleh pemilik toko:
 * - APPROVED (hanya dari PENDING)
 * - REJECTED
 * - REVOKED
 *
 * P0 Isolation: Wajib difilter eq('id', id).eq('tenant_id', tenant.id).
 * P0 Atomic Validation: Wajib validasi affected rows (data.length > 0).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await context.params;
    const cleanSlug = (slug || '').trim().toLowerCase();
    const partnershipId = (id || '').trim();

    if (!cleanSlug || !partnershipId) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Parameter slug dan ID permohonan wajib diisi.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const newStatus = String(body.status || '').trim().toUpperCase();

    if (!['APPROVED', 'REJECTED', 'REVOKED'].includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_STATUS',
          message: "Status baru harus berupa 'APPROVED', 'REJECTED', atau 'REVOKED'.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Tenant (Strict Scope Isolation)
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name')
      .or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Fetch current record to verify tenant ownership and status
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('reseller_partnerships')
      .select('*')
      .eq('id', partnershipId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'PARTNERSHIP_NOT_FOUND',
          message: 'Permohonan kemitraan tidak ditemukan atau tidak berada dalam lingkup tenant ini.',
        },
        { status: 404 }
      );
    }

    // 3. P0 State Machine Guard: Approval can only happen from PENDING
    if (newStatus === 'APPROVED' && existing.status !== 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_STATE_TRANSITION',
          message: `Permohonan berstatus '${existing.status}' tidak dapat di-ACC (hanya permohonan 'PENDING' yang dapat disetujui).`,
        },
        { status: 400 }
      );
    }

    // 4. Prepare Mutation Payload
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: nowIso,
    };

    if (body.commission_amount !== undefined && !isNaN(Number(body.commission_amount))) {
      updatePayload.commission_amount = Number(body.commission_amount);
    }
    if (body.commission_type && ['FIXED', 'PERCENTAGE'].includes(String(body.commission_type).toUpperCase())) {
      updatePayload.commission_type = String(body.commission_type).toUpperCase();
    }

    // 5. Execute Atomic Update with Affected Rows Verification
    let query = supabaseAdmin
      .from('reseller_partnerships')
      .update(updatePayload)
      .eq('id', partnershipId)
      .eq('tenant_id', tenant.id);

    if (newStatus === 'APPROVED') {
      query = query.eq('status', 'PENDING');
    }

    const { data: updatedData, error: updateErr } = await query.select();

    if (updateErr || !updatedData || updatedData.length === 0) {
      console.error('[Tenant Reseller PATCH] Zero rows affected or mutation error:', updateErr);
      return NextResponse.json(
        {
          success: false,
          error: 'UPDATE_FAILED_OR_ZERO_ROWS_AFFECTED',
          message: updateErr?.message || 'Gagal memperbarui status kemitraan reseller.',
        },
        { status: 400 }
      );
    }

    const updatedRecord = updatedData[0];

    // 6. Dual-Sync: If APPROVED, ensure store_resellers / reseller_links has this creator registered
    if (newStatus === 'APPROVED') {
      try {
        const creatorHandle = (updatedRecord.creator_handle || '').toLowerCase();
        const { data: existingStoreReseller } = await supabaseAdmin
          .from('store_resellers')
          .select('id')
          .eq('tenant_slug', tenant.slug)
          .eq('code', creatorHandle)
          .maybeSingle();

        if (!existingStoreReseller) {
          // Fetch creator details
          const { data: crProfile } = await supabaseAdmin
            .from('creator_profiles')
            .select('display_name, phone, whatsapp')
            .eq('handle', creatorHandle)
            .maybeSingle();

          await supabaseAdmin.from('store_resellers').insert({
            tenant_slug: tenant.slug,
            code: creatorHandle,
            name: crProfile?.display_name || creatorHandle,
            phone: crProfile?.whatsapp || crProfile?.phone || '-',
            status: 'ACTIVE',
            commission_type: updatedRecord.commission_type,
            commission_value: updatedRecord.commission_amount,
            created_at: nowIso,
          });
        }
      } catch (syncErr) {
        console.warn('[Tenant Reseller PATCH] Dual-sync store_resellers warning:', syncErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Status kemitraan berhasil diubah menjadi ${newStatus}.`,
      partnership: updatedRecord,
    });
  } catch (err: any) {
    console.error('[Tenant Reseller PATCH] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
