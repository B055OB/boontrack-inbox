import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.boontrack.com'),
  title: 'BoonTrack Enterprise',
  description:
    'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
  manifest: '/app-portal/site.webmanifest',
  openGraph: {
    title: 'BoonTrack Enterprise',
    description:
      'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
    url: 'https://app.boontrack.com',
    siteName: 'BoonTrack Enterprise',
    images: [
      {
        url: 'https://app.boontrack.com/app-portal/logo-master.png',
        width: 1024,
        height: 1024,
        alt: 'BoonTrack Enterprise',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BoonTrack Enterprise',
    description:
      'Platform orkestrasi operasional, tracking, payment, dan transactional decision layer untuk WhatsApp Business & AI Agent.',
    images: ['https://app.boontrack.com/app-portal/logo-master.png'],
  },
  icons: {
    icon: [
      { url: '/app-portal/favicon.ico', sizes: 'any' },
      { url: '/app-portal/icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/app-portal/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/app-portal/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/app-portal/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/app-portal/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/app-portal/favicon.ico',
    apple: [
      { url: '/app-portal/apple-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/app-portal/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
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
        <link rel="icon" href="/app-portal/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/app-portal/favicon.ico" />
        <link rel="apple-touch-icon" href="/app-portal/apple-icon.png" />
      </head>
      {children}
    </>
  );
}