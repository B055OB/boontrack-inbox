import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { verifyCreatorSession } from '@/lib/auth/creator-auth-guard';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/creators/[handle]/tips/[id]
 * Memperbarui status traktir (misal: READ atau VERIFIED).
 * P1 Anti-IDOR: Hanya pemilik creator sah atau admin yang berhak mengubah status.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ handle: string; id: string }> }
) {
  try {
    const { handle, id } = await context.params;
    const cleanHandle = (handle || '').replace(/^@+/, '').trim().toLowerCase();
    const tipId = (id || '').trim();

    if (!cleanHandle || !tipId) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Handle kreator dan ID traktir wajib diisi.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetStatus = String(body.status || 'READ').trim().toUpperCase();

    if (!['READ', 'VERIFIED', 'UNREAD'].includes(targetStatus)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_STATUS', message: "Status harus berupa 'READ', 'VERIFIED', atau 'UNREAD'." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // P1: Anti-IDOR: Otorisasi Sesi Server Kreator
    const auth = await verifyCreatorSession(req, cleanHandle, { supabaseClient: supabaseAdmin });
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: auth.errorStatus === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: auth.errorMessage || 'Akses ditolak (Anti-IDOR).',
        },
        { status: auth.errorStatus || 401 }
      );
    }

    // 1. Resolve Creator
    const baseHandle = cleanHandle.replace(/_+$/, '');
    const { data: creator, error: creatorErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, tenant_id, handle')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creatorErr || !creator) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_NOT_FOUND', message: 'Profil kreator tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Update Tip with Strict Ownership Isolation
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('creator_tips')
      .update({ status: targetStatus })
      .eq('id', tipId)
      .eq('creator_id', creator.tenant_id)
      .select();

    if (updateErr) {
      console.error('[Creator Tip PATCH] Update error:', updateErr);
      return NextResponse.json(
        { success: false, error: updateErr.code, message: updateErr.message },
        { status: 500 }
      );
    }

    if (!updated || updated.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: 'Data traktir tidak ditemukan atau tidak berada dalam lingkup kreator ini.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Status dukungan berhasil diubah menjadi ${targetStatus}.`,
      tip: updated[0],
    });
  } catch (err: any) {
    console.error('[Creator Tip PATCH Fatal]:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
