import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, Lock, ArrowLeft } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function ForbiddenAccessView({ userEmail, role }: { userEmail?: string; role?: string }) {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#131927] border border-rose-500/30 rounded-3xl p-7 text-center space-y-6 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider">
            <span>HTTP 403 Forbidden</span>
          </div>
          <h1 className="text-xl font-black text-white">Akses Ditolak</h1>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Akun Anda terautentikasi {userEmail ? `(${userEmail})` : ''}, namun role Anda bukan <strong>ADMIN</strong> dan Anda bukan pemilik sah workspace Creator ini.
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-zinc-400 text-left space-y-1">
          <p className="flex items-center gap-1.5 text-zinc-300 font-bold">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Fail-Closed Security Enforcement</span>
          </p>
          <p>Seluruh data sensitif profil, QRIS donasi, nomor kontak, dan order endorsement diblokir demi privasi pemilik akun.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/10 transition text-center"
          >
            Dashboard Toko
          </Link>
          <Link
            href="/login"
            className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition text-center shadow-lg shadow-rose-600/30"
          >
            Ganti Akun
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function CreatorAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();

  // 1. Ekstrak Supabase Auth Token dari Cookies
  let authToken = cookieStore.get('sb-access-token')?.value || '';
  if (!authToken) {
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) {
        try {
          const parsed = JSON.parse(decodeURIComponent(c.value));
          if (Array.isArray(parsed) && parsed[0]) {
            authToken = parsed[0];
            break;
          } else if (parsed?.access_token) {
            authToken = parsed.access_token;
            break;
          }
        } catch {}
      }
    }
  }

  const customToken =
    cookieStore.get('bt_creator_token')?.value ||
    cookieStore.get('creator_token')?.value ||
    cookieStore.get('bt_manager_token')?.value ||
    '';

  const token = (authToken || customToken).trim();

  // 2. Ekstrak Creator Session Cookies
  const cleanVal = (val?: string) => {
    if (!val) return '';
    try {
      return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
    } catch {
      return val.toLowerCase().trim();
    }
  };

  const creatorHandle = cleanVal(cookieStore.get('creator_handle')?.value);
  const creatorSession = cleanVal(cookieStore.get('creator_session')?.value);
  const merchantStore = cleanVal(cookieStore.get('merchant_store')?.value);
  const merchantSession = cleanVal(cookieStore.get('merchant_session')?.value);
  const btTenant = cleanVal(cookieStore.get('bt_tenant')?.value);

  const candidateHandle = creatorHandle || creatorSession || merchantStore || merchantSession || btTenant;

  // 3. Fail-Closed: Jika tidak ada token DAN tidak ada session cookie sama sekali
  if (!token && !candidateHandle) {
    redirect('/login?redirectTo=/admin');
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (err) {
    console.error('[Creator Admin Guard] Failed to initialize Supabase Admin:', err);
    redirect('/login?redirectTo=/admin');
  }

  // 4. Validasi Supabase Auth Token jika ada
  if (token) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (!authError && authData?.user) {
      const user = authData.user;
      const appRole = String(user.app_metadata?.role || user.user_metadata?.role || '').toUpperCase();

      // Cek apakah user adalah ADMIN atau SUPERADMIN
      if (appRole === 'ADMIN' || appRole === 'SUPERADMIN') {
        return <>{children}</>;
      }

      // Cek apakah user ada di tabel affiliates sebagai ADMIN
      const { data: aff } = await supabaseAdmin
        .from('affiliates')
        .select('role')
        .or(`id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();

      if (aff && (String(aff.role).toUpperCase() === 'ADMIN' || String(aff.role).toUpperCase() === 'SUPERADMIN')) {
        return <>{children}</>;
      }

      // Cek apakah user adalah pemilik sah creator profile atau tenant
      const { data: creatorProf } = await supabaseAdmin
        .from('creator_profiles')
        .select('id, handle, tenant_id')
        .or(`tenant_id.eq.${user.id},handle.eq.${user.email}`)
        .maybeSingle();

      if (creatorProf) {
        return <>{children}</>;
      }

      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('id, slug')
        .or(`id.eq.${user.id},metadata->>email.eq.${user.email}`)
        .maybeSingle();

      if (tenantRow) {
        return <>{children}</>;
      }

      // User terautentikasi tapi BUKAN ADMIN dan BUKAN PEMILIK SAH -> 403 Forbidden!
      return <ForbiddenAccessView userEmail={user.email} role={appRole || 'USER'} />;
    }
  }

  // 5. Validasi Creator Handle Session Cookie terhadap Database (SSOT)
  if (candidateHandle) {
    const baseHandle = candidateHandle.replace(/_+$/, '');

    // Cek di creator_profiles
    const { data: profile } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, handle, status')
      .or(`handle.eq.${candidateHandle},handle.eq.${baseHandle},tenant_id.eq.${candidateHandle}`)
      .limit(1)
      .maybeSingle();

    if (profile) {
      return <>{children}</>;
    }

    // Cek di tenants
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, status, category, tenant_kind')
      .eq('slug', candidateHandle)
      .maybeSingle();

    if (tenant && tenant.status !== 'inactive') {
      return <>{children}</>;
    }
  }

  // Session tidak valid atau tidak cocok dengan database
  redirect('/login?redirectTo=/admin');
}
