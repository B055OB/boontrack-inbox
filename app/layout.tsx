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
  themeColor: "#ff6b00",
};

export const metadata: Metadata = {
  metadataBase: new URL('https://app.boontrack.com'),
  title: "BoonTrack | Business Action Layer & Platform Orkestrasi",
  description: "Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.",
  manifest: "/app-brand/site.webmanifest",
  openGraph: {
    title: "BoonTrack | Business Action Layer & Platform Orkestrasi",
    description: "Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.",
    url: "https://app.boontrack.com",
    siteName: "BoonTrack",
    images: [
      {
        url: 'https://app.boontrack.com/app-brand/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BoonTrack | Business Action Layer & Platform Orkestrasi',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "BoonTrack | Business Action Layer & Platform Orkestrasi",
    description: "Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.",
    images: ['https://app.boontrack.com/app-brand/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BoonTrack",
  },
  icons: {
    icon: [
      { url: "/app-brand/favicon.ico", sizes: "any" },
      { url: "/app-brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/app-brand/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-brand/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/app-brand/favicon.ico",
    apple: "/app-brand/apple-touch-icon.png",
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
        {/* Favicon & Touch Icons */}
        <link rel="icon" type="image/x-icon" href="/app-brand/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/app-brand/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/app-brand/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/app-brand/apple-touch-icon.png" />
        <link rel="manifest" href="/app-brand/site.webmanifest" />

        {/* Meta Open Graph (Wajib untuk WhatsApp Link Preview) */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://app.boontrack.com" />
        <meta property="og:title" content="BoonTrack | Business Action Layer & Platform Orkestrasi" />
        <meta property="og:description" content="Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent." />
        <meta property="og:image" content="https://app.boontrack.com/app-brand/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="BoonTrack | Business Action Layer & Platform Orkestrasi" />
        <meta name="twitter:description" content="Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent." />
        <meta name="twitter:image" content="https://app.boontrack.com/app-brand/og-image.png" />

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