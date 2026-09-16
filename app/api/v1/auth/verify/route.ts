import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleVerify(req);
}

export async function POST(req: NextRequest) {
  return handleVerify(req);
}

async function handleVerify(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let token = searchParams.get('token') || '';
    let type = (searchParams.get('type') || 'merchant').toLowerCase();
    let id = searchParams.get('id') || '';
    let slug = searchParams.get('slug') || '';

    // If POST with body
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.token) token = body.token;
        if (body.type) type = body.type.toLowerCase();
        if (body.id) id = body.id;
        if (body.slug) slug = body.slug;
      } catch (_) {}
    }

    token = token.trim();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token aktivasi tidak valid atau tidak ditemukan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database Supabase tidak terhubung.' },
        { status: 500 }
      );
    }

    // ── CASE A: AFFILIATE ACCOUNT ACTIVATION ──
    if (type === 'affiliate') {
      let query = supabase.from('affiliates').select('*');
      if (id) {
        query = query.eq('id', id);
      }
      const { data: affList, error: affErr } = await query;

      if (affErr || !affList || affList.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Akun affiliate tidak ditemukan.' },
          { status: 404 }
        );
      }

      // Match token in metadata or direct column
      const matchedAff = affList.find((a: any) => {
        const meta = a.metadata || {};
        return meta.verification_token === token || a.verification_token === token;
      });

      if (!matchedAff) {
        return NextResponse.json(
          { success: false, error: 'Token aktivasi tidak cocok atau telah kedaluwarsa.' },
          { status: 400 }
        );
      }

      // Check expiry if set (e.g. 24h)
      const tokenExpiresAt = matchedAff.metadata?.verification_expires_at;
      if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() < Date.now()) {
        return NextResponse.json(
          { success: false, error: 'Tautan aktivasi telah kedaluwarsa. Silakan minta kirim ulang email.' },
          { status: 400 }
        );
      }

      // Update status to ACTIVE & verified
      const updatedMeta = {
        ...(matchedAff.metadata || {}),
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        verification_token: null,
      };

      await supabase
        .from('affiliates')
        .update({
          status: 'ACTIVE',
          metadata: updatedMeta,
        })
        .eq('id', matchedAff.id);

      return NextResponse.json({
        success: true,
        message: 'Akun kemitraan affiliate Anda berhasil diaktifkan!',
        type: 'affiliate',
        referral_code: matchedAff.referral_code,
        redirect_url: '/affiliate/dashboard',
      });
    }

    let tenantQuery = supabase.from('tenants').select('*');
    if (slug) {
      tenantQuery = tenantQuery.eq('slug', slug);
    } else if (id) {
      tenantQuery = tenantQuery.eq('id', id);
    } else {
      tenantQuery = tenantQuery.eq('metadata->>verification_token', token);
    }
    let { data: tenantList, error: tErr } = await tenantQuery;

    // Fallback: if not found by metadata query, check affiliates
    if ((!tenantList || tenantList.length === 0) && !slug && !id) {
      const { data: affDirect } = await supabase
        .from('affiliates')
        .select('*')
        .eq('metadata->>verification_token', token);

      if (affDirect && affDirect.length > 0) {
        const matchedAff = affDirect[0];
        const tokenExpiresAt = matchedAff.metadata?.verification_expires_at;
        if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() < Date.now()) {
          return NextResponse.json(
            { success: false, error: 'Tautan aktivasi telah kedaluwarsa. Silakan minta kirim ulang email.' },
            { status: 400 }
          );
        }

        const updatedMeta = {
          ...(matchedAff.metadata || {}),
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          verification_token: null,
        };

        await supabase
          .from('affiliates')
          .update({
            status: 'ACTIVE',
            metadata: updatedMeta,
          })
          .eq('id', matchedAff.id);

        return NextResponse.json({
          success: true,
          message: 'Akun kemitraan affiliate Anda berhasil diaktifkan!',
          type: 'affiliate',
          referral_code: matchedAff.referral_code,
          redirect_url: '/affiliate/dashboard',
        });
      }
    }

    if (tErr || !tenantList || tenantList.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Toko mitra tidak ditemukan.' },
        { status: 404 }
      );
    }

    const matchedTenant = tenantList.find((t: any) => {
      const meta = t.metadata || {};
      return meta.verification_token === token || t.verification_token === token;
    });

    if (!matchedTenant) {
      return NextResponse.json(
        { success: false, error: 'Token aktivasi toko tidak cocok atau telah kedaluwarsa.' },
        { status: 400 }
      );
    }

    const tokenExpiresAt = matchedTenant.metadata?.verification_expires_at;
    if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'Tautan aktivasi telah kedaluwarsa. Silakan minta kirim ulang email.' },
        { status: 400 }
      );
    }

    // Activate tenant status
    const currentMeta = matchedTenant.metadata || {};
    const updatedMeta = {
      ...currentMeta,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      verification_token: null,
    };

    // Determine target status
    const newStatus = (matchedTenant.status === 'unverified' || !matchedTenant.status)
      ? 'active'
      : matchedTenant.status;

    await supabase
      .from('tenants')
      .update({
        status: newStatus,
        is_active: true,
        metadata: updatedMeta,
      })
      .eq('id', matchedTenant.id);

    return NextResponse.json({
      success: true,
      message: 'Toko online Anda berhasil diaktifkan!',
      type: 'merchant',
      tenant_slug: matchedTenant.slug,
      store_name: matchedTenant.name || matchedTenant.slug,
      redirect_url: `/${matchedTenant.slug}/dashboard`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat memverifikasi token.';
    console.error('[AuthVerify] Error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
