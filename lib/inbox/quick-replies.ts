import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export interface QuickReplyItem {
  id?: string;
  tenant_id: string;
  tenant_slug?: string;
  shortcut: string;
  title: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export function getDefaultQuickReplies(tenantSlug: string, storeName?: string): Array<{
  shortcut: string;
  title: string;
  content: string;
}> {
  const name = storeName || 'Toko Kami';
  const storefrontUrl = `https://shop.boontrack.com/${tenantSlug}`;

  return [
    {
      shortcut: '/katalog',
      title: 'Katalog & Produk Resmi',
      content: `🛍️ *Katalog & Produk Resmi ${name}*\n\nSilakan cek seluruh daftar produk, stok terkini, dan lakukan pemesanan mandiri secara instan melalui etalase resmi kami di:\n👉 ${storefrontUrl}\n\nJika ada produk yang ingin ditanyakan, silakan beri tahu kami ya Kak! 🙏`,
    },
    {
      shortcut: '/jam',
      title: 'Jam Operasional & Pengiriman',
      content: `🕒 *Jadwal Operasional & Pengiriman*\n\n• Layanan CS: Setiap hari pukul 08.00 - 21.00 WIB\n• Pengiriman Ekspedisi: Senin - Sabtu (Cut-off pukul 15.00 WIB)\n• Pengiriman Instan/Sameday: Setiap hari (Cut-off pukul 16.00 WIB)\n\nPesanan yang masuk melewati jam cut-off akan diproses pada hari kerja berikutnya ya Kak. Terima kasih atas pengertiannya! ✨`,
    },
    {
      shortcut: '/alamat',
      title: 'Lokasi & Titik Pengiriman',
      content: `📍 *Lokasi Toko Fisik & Titik Pengiriman*\n\nAlamat Gudang/Toko Resmi:\n*${name}*\nPengiriman utama dikirim langsung dari gudang pusat kami. Untuk pesanan kurir instan/ojol, titik jemput akan disesuaikan dengan koordinat terdekat gudang.`,
    },
    {
      shortcut: '/garansi',
      title: 'Ketentuan Garansi & Retur',
      content: `🛡️ *Ketentuan Garansi & Pengembalian Produk*\n\n1. Mohon sertakan *video unboxing* tanpa jeda saat membuka paket pertama kali.\n2. Komplain/klaim garansi maksimal diajukan dalam kurun waktu 1x24 jam sejak paket berstatus diterima.\n3. Tim kami akan mengganti baru atau memproses pengembalian dana 100% jika produk cacat pabrik atau salah kirim. Kepuasan Anda adalah prioritas kami! 🙏`,
    },
    {
      shortcut: '/tanya',
      title: 'Form Tanya Data Pelanggan Awal',
      content: `📋 *Format Konsultasi & Data Pelanggan*\n\nHalo Kak! Agar kami dapat memberikan rekomendasi dan solusi yang paling tepat, mohon bantu isi data singkat berikut ya:\n\n• Nama Lengkap:\n• Kota/Kecamatan Pengiriman:\n• Produk/Kendala yang Ingin Ditanyakan:\n\nTerima kasih Kak, kami akan langsung pelajari data Kakak! 😊`,
    },
  ];
}

/**
 * Ensures quick replies are auto-seeded if currently empty for tenant.
 */
export async function getOrSeedQuickReplies(tenantId: string, tenantSlug: string, storeName?: string): Promise<QuickReplyItem[]> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return [];

  // Query existing quick replies
  const { data: existing, error } = await supabase
    .from('quick_replies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (!error && existing && existing.length > 0) {
    return existing;
  }

  // Auto-seed default 5 presets
  const defaults = getDefaultQuickReplies(tenantSlug, storeName);
  const rowsToInsert = defaults.map((d) => ({
    tenant_id: tenantId,
    tenant_slug: tenantSlug,
    shortcut: d.shortcut,
    title: d.title,
    content: d.content,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('quick_replies')
    .insert(rowsToInsert)
    .select('*');

  if (insertErr) {
    console.warn('[QuickReplies] Error auto-seeding defaults:', insertErr.message);
    // If conflict, try re-fetching
    const { data: refetched } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('tenant_id', tenantId);
    return refetched || rowsToInsert as any;
  }

  return inserted || [];
}
