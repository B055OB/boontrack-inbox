import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      'placeholder-anon-key'
  );
}

type Props = {
  params: Promise<{ tenant: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const cleanTenant = tenant.toLowerCase().trim();

  // Slug bawaan sistem agar tidak tertimpa
  const RESERVED_SLUGS = ['login', 'register', 'admin', 'auth', 'checkout'];
  if (RESERVED_SLUGS.includes(cleanTenant)) {
    return {
      title: 'BoonTrack Shop | Platform Otomasi Penjualan',
      description: 'Solusi SaaS terintegrasi untuk kelola katalog digital dan checkout otomatis.',
    };
  }

  const supabase = getSupabase();

  // Tarik data toko langsung dari database Supabase
  const { data: store } = await supabase
    .from('tenants')
    .select('name, metadata')
    .eq('slug', cleanTenant)
    .maybeSingle();

  const storeName = store?.name || cleanTenant.replace(/[-_]/g, ' ').toUpperCase();
  const metaObj = (store?.metadata as Record<string, any>) || {};

  const description =
    metaObj.description ||
    metaObj.tagline ||
    `Selamat datang di layanan resmi ${storeName}. Pemesanan online praktis, konfirmasi instan via WhatsApp, dan bayar di tempat.`;

  const logoUrl =
    metaObj.logo_url ||
    metaObj.image ||
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=60';

  return {
    title: `${storeName} | Layanan Resmi`,
    description,
    openGraph: {
      title: storeName,
      description,
      url: `https://shop.boontrack.com/${cleanTenant}`,
      siteName: storeName,
      locale: 'id_ID',
      type: 'website',
      images: [
        {
          url: logoUrl,
          width: 800,
          height: 600,
          alt: storeName,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: storeName,
      description,
      images: [logoUrl],
    },
  };
}

export default function TenantStoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}