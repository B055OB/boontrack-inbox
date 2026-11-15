import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, Lock } from 'lucide-react';
import { verifyHostSessionToken } from '@/lib/auth/host-session';

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
            Akun Anda terautentikasi {userEmail ? `(${userEmail})` : ''}, namun role Anda ({role || 'UNAUTHORIZED'}) tidak berwenang mengakses Creator Admin workspace ini.
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

  // 1. Ekstrak Authoritative Signed Creator Host Session Token
  const creatorSessionToken =
    cookieStore.get('__Host-bt_creator_session')?.value ||
    cookieStore.get('bt_creator_session')?.value ||
    '';

  // 2. Fail-Closed: Tolak jika tidak ada signed creator host token
  // DILARANG KERAS mempercayai plaintext cookies atau generic Supabase Auth session token
  if (!creatorSessionToken) {
    redirect('/login?redirectTo=/admin');
  }

  // 3. Validasi Authoritative Signed Creator Session Token via Node verifier
  const verification = await verifyHostSessionToken(creatorSessionToken, 'creator');
  if (!verification.valid || !verification.payload) {
    redirect('/login?redirectTo=/admin');
  }

  const payload = verification.payload;
  const roleUpper = String(payload.role || '').toUpperCase();
  const allowedRoles = ['CREATOR_OWNER', 'CREATOR_MEMBER', 'ADMIN', 'SUPERADMIN'];

  if (!allowedRoles.includes(roleUpper)) {
    return <ForbiddenAccessView userEmail={payload.sub} role={payload.role} />;
  }

  return <>{children}</>;
}
