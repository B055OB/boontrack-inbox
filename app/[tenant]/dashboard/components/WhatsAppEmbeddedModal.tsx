'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { MessageSquare, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface Props {
  tenantSlug: string;
  onSuccess?: (data: any) => void;
}

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: any;
  }
}

export default function WhatsAppEmbeddedModal({ tenantSlug, onSuccess }: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);

  useEffect(() => {
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_META_APP_ID || '',
        cookie: true,
        xfbml: true,
        version: 'v20.0',
      });
      setSdkReady(true);
    };

    // Message listener untuk sessionInfoVersion: 2 dari Meta Modal
    const handleMetaMessage = (event: MessageEvent) => {
      if (!event.origin.includes('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[Meta Embedded Signup Event]', data);
        }
      } catch (e) {
        // Non-JSON meta message ignored
      }
    };

    window.addEventListener('message', handleMetaMessage);
    return () => window.removeEventListener('message', handleMetaMessage);
  }, []);

  const launchWhatsAppSignup = () => {
    if (!window.FB) {
      alert('Facebook SDK sedang dimuat. Silakan tunggu beberapa detik.');
      return;
    }

    setConnecting(true);

    window.FB.login(
      (response: any) => {
        if (response.authResponse && response.authResponse.code) {
          const authCode = response.authResponse.code;

          // Kirim authorization code ke backend untuk token exchange & register nomor
          fetch(`${process.env.NEXT_PUBLIC_CORE_API}/api/v1/auth/facebook/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: authCode,
              tenant_slug: tenantSlug,
            }),
          })
            .then((res) => res.json())
            .then((resData) => {
              setConnecting(false);
              if (resData.status === 'success') {
                setConnectedNumber(resData.phone_number || 'Nomor WhatsApp');
                if (onSuccess) onSuccess(resData);
              } else {
                alert(`Gagal menghubungkan: ${resData.message || 'Error Meta API'}`);
              }
            })
            .catch((err) => {
              setConnecting(false);
              alert('Terjadi kendala koneksi ke server backend.');
            });
        } else {
          setConnecting(false);
        }
      },
      {
        config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID || '',
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '2',
        },
      }
    );
  };

  return (
    <>
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={() => {
          if (window.fbAsyncInit) window.fbAsyncInit();
        }}
      />

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">WhatsApp Business API</h3>
              <p className="text-xs text-slate-400">Koneksikan nomor resmi bisnis via Meta Embedded Signup</p>
            </div>
          </div>
          {connectedNumber && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-3 py-1 rounded-full font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Terhubung ({connectedNumber})
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Verifikasi resmi langsung via pop-up Meta Cloud</span>
          </div>

          <button
            onClick={launchWhatsAppSignup}
            disabled={connecting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-600/20"
          >
            {connecting ? 'Menghubungkan...' : 'Hubungkan Nomor WA'}
          </button>
        </div>
      </div>
    </>
  );
}