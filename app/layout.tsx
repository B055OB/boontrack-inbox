import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "@/lib/polyfills";
import PwaRegister from "@/components/PwaRegister";
import ErrorBoundary from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostHeader =
    headersList.get('x-forwarded-host') ||
    headersList.get('host') ||
    '';
  const hostClean = hostHeader.split(',')[0].trim().toLowerCase().split(':')[0];

  const isCreatorHost = hostClean === 'creator.boontrack.com' || hostClean.startsWith('creator.');

  if (isCreatorHost) {
    return {
      metadataBase: new URL('https://creator.boontrack.com'),
      title: "BoonTrack Creator | Platform Profil Kreator, Rate Card & UGC Studio",
      description: "Ekosistem digital resmi kreator: etalase rate card interaktif, showcase portofolio UGC, dan penerimaan pesanan konten terverifikasi.",
      manifest: "/manifest-creator.json",
      openGraph: {
        title: "BoonTrack Creator | Platform Profil Kreator, Rate Card & UGC Studio",
        description: "Ekosistem digital resmi kreator: etalase rate card interaktif, showcase portofolio UGC, dan penerimaan pesanan konten terverifikasi.",
        url: "https://creator.boontrack.com",
        siteName: "BoonTrack Creator",
        images: [
          {
            url: '/app-brand/logo-master.png',
            width: 1024,
            height: 1024,
            alt: 'BoonTrack Creator Platform',
          },
        ],
        locale: 'id_ID',
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: "BoonTrack Creator | Platform Profil Kreator, Rate Card & UGC Studio",
        description: "Ekosistem digital resmi kreator: etalase rate card interaktif, showcase portofolio UGC, dan penerimaan pesanan konten terverifikasi.",
        images: ['/app-brand/logo-master.png'],
      },
      appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "BoonTrack Creator",
      },
      icons: {
        icon: [
          { url: '/app-brand/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
          { url: '/app-brand/favicon.ico', sizes: 'any' },
        ],
        apple: '/app-brand/apple-touch-icon.png',
      },
    };
  }

  // Resolusi Host shop.boontrack.com & Default Commerce Fallback
  return {
    metadataBase: new URL('https://shop.boontrack.com'),
    title: "BoonTrack Shop | Platform Otomasi Penjualan & WhatsApp Commerce Cerdas",
    description: "Solusi SaaS terintegrasi untuk kelola katalog digital, checkout otomatis, notifikasi WhatsApp instan, dan penerimaan pembayaran QRIS resmi PT BOONTRACK INOVASI DIGITAL.",
    manifest: "/manifest.json",
    openGraph: {
      title: "BoonTrack Shop | Platform Otomasi Penjualan & WhatsApp Commerce Cerdas",
      description: "Solusi SaaS terintegrasi untuk kelola katalog digital, checkout otomatis, notifikasi WhatsApp instan, dan penerimaan pembayaran QRIS resmi PT BOONTRACK INOVASI DIGITAL.",
      url: "https://shop.boontrack.com",
      siteName: "BoonTrack Shop",
      images: [
        {
          url: '/og-shop.png',
          width: 1200,
          height: 630,
          alt: 'BoonTrack Shop - Platform Otomasi Penjualan & WhatsApp Commerce Cerdas',
        },
      ],
      locale: 'id_ID',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: "BoonTrack Shop | Platform Otomasi Penjualan & WhatsApp Commerce Cerdas",
      description: "Solusi SaaS terintegrasi untuk kelola katalog digital, checkout otomatis, notifikasi WhatsApp instan, dan penerimaan pembayaran QRIS resmi PT BOONTRACK INOVASI DIGITAL.",
      images: ['/og-shop.png'],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "BoonTrack",
    },
    icons: {
      icon: [
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon.ico', sizes: 'any' },
      ],
      apple: '/apple-touch-icon.png',
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Early Safari / WebKit Compatibility Polyfill (before scripts execute) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof window!=='undefined'){if(typeof window.structuredClone!=='function'){window.structuredClone=function(v){if(v===undefined)return undefined;if(v===null||typeof v!=='object')return v;try{return JSON.parse(JSON.stringify(v));}catch(e){if(Array.isArray(v))return v.slice();var o={};for(var k in v)if(Object.prototype.hasOwnProperty.call(v,k))o[k]=v[k];return o;}};}}})();`,
          }}
        />
        {/* Early PWA beforeinstallprompt capture (ensures event is never missed prior to React hydration) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof window!=='undefined'){window.__bt_deferred_prompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bt_deferred_prompt=e;window.dispatchEvent(new CustomEvent('bt_beforeinstallprompt',{detail:e}));});}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {/* ads-tracker.js — lazyOnload, strictly isolated to public storefronts (skip admin, merchant dashboard, and CS desk) */}
        <Script
          id="ads-tracker"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `(function(){
              if (
                window.location.pathname.startsWith('/admin') ||
                window.location.pathname.includes('/dashboard') ||
                window.location.pathname.includes('/desk') ||
                window.location.hostname.startsWith('dashboard.')
              ) return;
              var s=document.createElement('script');s.src='/ads-tracker.js';s.async=true;document.head.appendChild(s);
            })();`,
          }}
        />
        <ErrorBoundary name="RootLayout">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}