'use client';

import React, { useState } from 'react';

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-medium transition cursor-pointer disabled:opacity-50"
    >
      {loading ? 'Mengakhiri Sesi...' : 'Keluar Sesi (Logout)'}
    </button>
  );
}

