import type { Metadata, Viewport } from "next";
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
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
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
        url: '/icon-shop.png',
        width: 512,
        height: 512,
        alt: 'BoonTrack Shop',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: "BoonTrack Shop | Platform Otomasi Penjualan & WhatsApp Commerce Cerdas",
    description: "Solusi SaaS terintegrasi untuk kelola katalog digital, checkout otomatis, notifikasi WhatsApp instan, dan penerimaan pembayaran QRIS resmi PT BOONTRACK INOVASI DIGITAL.",
    images: ['/icon-shop.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BoonTrack",
  },
  icons: {
    icon: [
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
        {/* ads-tracker.js — lazyOnload, skip /admin/* routes */}
        <Script
          id="ads-tracker"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `(function(){if(window.location.pathname.startsWith('/admin'))return;var s=document.createElement('script');s.src='/ads-tracker.js';s.async=true;document.head.appendChild(s);})();`,
          }}
        />
        <ErrorBoundary name="RootLayout">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}