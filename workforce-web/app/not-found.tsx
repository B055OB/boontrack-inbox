import React from 'react';
import Link from 'next/link';

export default function WorkforceNotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-extrabold text-2xl">
          404
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Page Not Found</h1>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            The requested page or resource is not available on BWM Workforce Management OS.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold tracking-wide transition shadow-lg shadow-blue-900/30"
          >
            Return to Operations Portal
          </Link>
        </div>
        <p className="text-[10px] text-slate-500">
          Powered by BoonTrack &bull; Enterprise Workforce Engine
        </p>
      </div>
    </div>
  );
}
