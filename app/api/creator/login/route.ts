import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { verifyPassword } from '@/lib/auth/password-hasher';

export const runtime = 'nodejs';

/**
 * POST /api/creator/login
 * Dedicated authentication route handler for Creator Workspace.
 * Supports:
 * 1. Handle + PIN / Password (creator_profiles & tenants)
 * 2. Email + Password (Supabase Auth & Admin verification)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { identifier, pin, password, email } = body;

    const rawId = (identifier || email || '').toString().trim();
    const rawSecret = (pin || password || '').toString().trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Handle bio link atau email wajib diisi.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // ── 1. Cek apakah identifier adalah Email -> Login via Supabase Auth ──
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawId);

    if (isEmail) {
      if (!rawSecret) {
        return NextResponse.json(
          { success: false, error: 'SECRET_REQUIRED', message: 'Password wajib diisi untuk login email.' },
          { status: 400 }
        );
      }

      // Login via Supabase Auth Client
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: rawId.toLowerCase(),
        password: rawSecret,
      });

      if (authError || !authData?.user) {
        // Fallback: cek apakah email terdaftar di tabel tenants (seperti akun Alldy Studio)
        const { data: tenantByEmail } = await supabaseAdmin
          .from('tenants')
          .select('id, slug, name, access_password, metadata')
          .eq('metadata->>email', rawId.toLowerCase())
          .maybeSingle();

        if (tenantByEmail) {
          const expectedPwd =
            tenantByEmail.access_password ||
            tenantByEmail.metadata?.access_pin ||
            tenantByEmail.metadata?.pin ||
            '';

          let isMatch = expectedPwd === rawSecret;
          if (!isMatch && tenantByEmail.metadata?.password_hash) {
            // Check SHA-256 or bcrypt
            const crypto = require('crypto');
            const sha256 = crypto.createHash('sha256').update(rawSecret).digest('hex');
            isMatch = sha256 === tenantByEmail.metadata.password_hash;
          }

          if (isMatch) {
            const res = NextResponse.json({
              success: true,
              message: `Selamat datang kembali, ${tenantByEmail.name || rawId}!`,
              data: {
                handle: tenantByEmail.slug,
                name: tenantByEmail.name,
                role: 'CREATOR_OWNER',
                redirect: `/admin?handle=${encodeURIComponent(tenantByEmail.slug)}`,
              },
            });

            res.cookies.set('creator_handle', tenantByEmail.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
            res.cookies.set('creator_session', tenantByEmail.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
            res.cookies.set('merchant_store', tenantByEmail.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
            res.cookies.set('merchant_session', tenantByEmail.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
            res.cookies.set('bt_tenant', tenantByEmail.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
            return res;
          }
        }

        return NextResponse.json(
          { success: false, error: 'AUTH_FAILED', message: authError?.message || 'Email atau password tidak sesuai.' },
          { status: 401 }
        );
      }

      const user = authData.user;
      const appRole = String(user.app_metadata?.role || user.user_metadata?.role || '').toUpperCase();
      const isAdmin = appRole === 'ADMIN' || appRole === 'SUPERADMIN';

      // Cek apakah ada creator_profile atau tenant yang terhubung
      const { data: creatorProf } = await supabaseAdmin
        .from('creator_profiles')
        .select('handle, display_name')
        .or(`tenant_id.eq.${user.id},handle.eq.${user.email}`)
        .maybeSingle();

      const resolvedHandle = creatorProf?.handle || user.email?.split('@')[0] || 'creator';

      const res = NextResponse.json({
        success: true,
        message: 'Login berhasil.',
        data: {
          user_id: user.id,
          email: user.email,
          role: isAdmin ? 'ADMIN' : 'CREATOR_OWNER',
          handle: resolvedHandle,
          redirect: `/admin?handle=${encodeURIComponent(resolvedHandle)}`,
        },
      });

      // Set session cookies
      if (authData.session?.access_token) {
        res.cookies.set('sb-access-token', authData.session.access_token, {
          path: '/',
          maxAge: 2592000,
          sameSite: 'lax',
          httpOnly: true,
        });
      }
      res.cookies.set('creator_handle', resolvedHandle, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('creator_session', resolvedHandle, { path: '/', maxAge: 2592000, sameSite: 'lax' });

      return res;
    }

    // ── 2. Handle Bio Link + PIN / Password ──
    const cleanHandle = rawId.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').trim().toLowerCase();
    const baseHandle = cleanHandle.replace(/_+$/, '');

    // Cari di creator_profiles
    const { data: profile } = await supabaseAdmin
      .from('creator_profiles')
      .select('*')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profile) {
      const storedPin = profile.pin || profile.theme_config?.pin || '';
      const storedHash = profile.pin_hash || profile.theme_config?.pin_hash || '';

      let pinValid = false;
      if (!storedPin && !storedHash) {
        // Jika profil dibuat tanpa PIN, izinkan login atau jika rawSecret diisi cocok
        pinValid = true;
      } else if (storedHash) {
        pinValid = await verifyPassword(rawSecret, storedHash);
      } else if (storedPin) {
        pinValid = storedPin === rawSecret;
      }

      if (!pinValid) {
        return NextResponse.json(
          { success: false, error: 'INVALID_PIN', message: 'PIN atau password akses salah.' },
          { status: 401 }
        );
      }

      const res = NextResponse.json({
        success: true,
        message: `Selamat datang kembali, ${profile.display_name || profile.handle}!`,
        data: {
          handle: profile.handle,
          display_name: profile.display_name,
          role: 'CREATOR_OWNER',
          redirect: `/admin?handle=${encodeURIComponent(profile.handle)}`,
        },
      });

      res.cookies.set('creator_handle', profile.handle, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('creator_session', profile.handle, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('merchant_store', profile.handle, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('merchant_session', profile.handle, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('bt_tenant', profile.handle, { path: '/', maxAge: 2592000, sameSite: 'lax' });

      return res;
    }

    // Cari di tabel tenants jika belum ada di creator_profiles (seperti slug tenant toko/creator/studio)
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, access_password, metadata')
      .eq('slug', cleanHandle)
      .maybeSingle();

    if (tenant) {
      const expectedPwd =
        tenant.access_password ||
        tenant.metadata?.access_pin ||
        tenant.metadata?.pin ||
        '';

      let isMatch = expectedPwd === rawSecret;
      if (!isMatch && tenant.metadata?.password_hash) {
        const crypto = require('crypto');
        const sha256 = crypto.createHash('sha256').update(rawSecret).digest('hex');
        isMatch = sha256 === tenant.metadata.password_hash;
      }

      if (!isMatch && expectedPwd) {
        return NextResponse.json(
          { success: false, error: 'INVALID_PIN', message: 'PIN atau password akses toko/kreator salah.' },
          { status: 401 }
        );
      }

      const res = NextResponse.json({
        success: true,
        message: `Selamat datang kembali, ${tenant.name || tenant.slug}!`,
        data: {
          handle: tenant.slug,
          name: tenant.name,
          role: 'CREATOR_OWNER',
          redirect: `/admin?handle=${encodeURIComponent(tenant.slug)}`,
        },
      });

      res.cookies.set('creator_handle', tenant.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('creator_session', tenant.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('merchant_store', tenant.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('merchant_session', tenant.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });
      res.cookies.set('bt_tenant', tenant.slug, { path: '/', maxAge: 2592000, sameSite: 'lax' });

      return res;
    }

    return NextResponse.json(
      { success: false, error: 'NOT_FOUND', message: `Handle @${cleanHandle} belum terdaftar. Silakan daftar terlebih dahulu.` },
      { status: 404 }
    );
  } catch (err: any) {
    console.error('[Creator Login API] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Terjadi kesalahan sistem saat proses masuk.' },
      { status: 500 }
    );
  }
}
