import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SATYA Field Ops — Satuan Tugas & Patroli Lapangan',
  description: 'Aplikasi Operasional Lapangan Ergonomis Satuan Pengamanan & Facility Services - Powered by BoonTrack',
  manifest: '/workforce.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SATYA',
  },
  icons: {
    icon: '/icons/workforce-192.png',
    apple: '/icons/workforce-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#991b1b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="manifest" href="/workforce.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/workforce-192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/workforce-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/workforce-512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SATYA" />
        <meta name="theme-color" content="#991b1b" />
      </head>
      <body className="min-h-screen bg-slate-900 text-slate-900 antialiased flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
