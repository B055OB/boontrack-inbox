import type { Metadata } from 'next';
import { BRANDING_ASSETS } from '@/lib/config/branding';

export const metadata: Metadata = {
  metadataBase: new URL(BRANDING_ASSETS.app.domain || 'https://app.boontrack.com'),
  title: 'BoonTrack App Portal',
  description:
    'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
  manifest: BRANDING_ASSETS.app.manifest || '/branding/app/manifest.json',
  openGraph: {
    title: 'BoonTrack App Portal',
    description:
      'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
    url: 'https://app.boontrack.com',
    siteName: BRANDING_ASSETS.app.name,
    images: [
      {
        url: BRANDING_ASSETS.app.logo,
        width: 512,
        height: 512,
        alt: 'BoonTrack App Portal',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BoonTrack App Portal',
    description:
      'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
    images: [BRANDING_ASSETS.app.logo],
  },
  icons: {
    icon: [
      { url: BRANDING_ASSETS.app.favicon, sizes: 'any' },
      { url: '/branding/app/icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/branding/app/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/branding/app/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/branding/app/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/branding/app/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: BRANDING_ASSETS.app.favicon,
    apple: [
      { url: '/branding/app/apple-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/branding/app/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function AppPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <head>
        <link rel="icon" href={BRANDING_ASSETS.app.favicon} sizes="any" />
        <link rel="shortcut icon" href={BRANDING_ASSETS.app.favicon} />
        <link rel="apple-touch-icon" href="/branding/app/apple-icon.png" />
      </head>
      {children}
    </>
  );
}