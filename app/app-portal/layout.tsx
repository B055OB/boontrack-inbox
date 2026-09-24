import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.boontrack.com'),
  title: 'BoonTrack | Business Action Layer & Platform Orkestrasi',
  description:
    'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
  manifest: '/app-brand/site.webmanifest',
  openGraph: {
    title: 'BoonTrack | Business Action Layer & Platform Orkestrasi',
    description:
      'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
    url: 'https://app.boontrack.com',
    siteName: 'BoonTrack',
    images: [
      {
        url: 'https://app.boontrack.com/app-brand/logo-master.png',
        width: 1024,
        height: 1024,
        alt: 'BoonTrack | Business Action Layer & Platform Orkestrasi',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BoonTrack | Business Action Layer & Platform Orkestrasi',
    description:
      'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
    images: ['https://app.boontrack.com/app-brand/logo-master.png'],
  },
  icons: {
    icon: [
      { url: '/app-brand/favicon.ico', sizes: 'any' },
      { url: '/app-brand/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/app-brand/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/app-brand/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/app-brand/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/app-brand/favicon.ico',
    apple: '/app-brand/apple-touch-icon.png',
  },
};

export default function AppPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}