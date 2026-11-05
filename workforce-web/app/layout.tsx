import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'SATYA Field Ops — Satuan Tugas & Patroli Lapangan',
  description: 'Aplikasi Operasional Lapangan Ergonomis Satuan Pengamanan & Facility Services - Powered by BoonTrack',
  manifest: '/api/manifest',
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
  themeColor: '#059669',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const primaryColor = headersList.get('x-workforce-primary-color') || '#059669';
  const accentColor = headersList.get('x-workforce-accent-color') || '#0d9488';
  const brandName = headersList.get('x-workforce-brand-name') || 'SATYA';

  return (
    <html lang="id">
      <head>
        <link rel="manifest" href="/api/manifest" />
        <link rel="apple-touch-icon" href="/icons/workforce-192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/workforce-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/workforce-512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={brandName} />
        <meta name="theme-color" content={primaryColor} />
        <style
          id="dynamic-brand-variables"
          dangerouslySetInnerHTML={{
            __html: `:root { --brand-primary: ${primaryColor}; --brand-accent: ${accentColor}; }`,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-900 text-slate-900 antialiased flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
