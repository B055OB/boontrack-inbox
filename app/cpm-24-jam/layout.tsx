import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Modul Praktis CPM 24 Jam | Tembus Impresi Pertama dalam 24 Jam - OnlineBoost ID',
  description:
    'Panduan Praktis Setup Traffic CPM: Tembus Impresi Pertama dalam 24 Jam. 3 langkah taktis optimasi traffic instan tanpa teori rumit untuk sesi live demo OnlineBoost.',
  openGraph: {
    title: 'Modul Praktis CPM 24 Jam - OnlineBoost ID',
    description:
      'Panduan Praktis Setup Traffic CPM: Tembus Impresi Pertama dalam 24 Jam. Akses eksklusif seharga Rp1.000 khusus sesi live demo.',
    type: 'website',
  },
};

export default function CPMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
