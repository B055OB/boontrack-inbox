import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'BoonTrack Apps — No-Friction Conversational OS & Hardware API',
    description: 'Ekosistem bisnis modular tanpa install aplikasi CRM untuk konsumen. Terhubung ke WhatsApp, Telegram, Discord, POS, NFC, dan Doorlock IoT.',
    icons: {
        icon: [
            { url: '/app-brand/favicon.ico' },
            { url: '/app-brand/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
            { url: '/app-brand/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        ],
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