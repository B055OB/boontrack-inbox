import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'BWM — Workforce Management OS',
  description: 'Verified Patrols. Accurate Presence. Zero Dedicated Hardware. - Powered by BoonTrack',
  manifest: '/api/manifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BWM',
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563eb',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const primaryColor = headersList.get('x-workforce-primary-color') || '#2563eb';
  const accentColor = headersList.get('x-workforce-accent-color') || '#1d4ed8';
  const brandName = headersList.get('x-workforce-brand-name') || 'BWM';

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/api/manifest" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon.png" />
        <link rel="icon" href="/favicon.ico" />
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
      <body className="min-h-screen bg-white text-slate-900 antialiased flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
