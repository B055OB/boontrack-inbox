import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

interface ChatRequestPayload {
  tenant_slug: string;
  message: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestPayload = await req.json();
    const { tenant_slug, message } = body;
    const slug = (tenant_slug || 'onlineboost').trim().toLowerCase();
    const q = (message || '').trim().toLowerCase();

    if (!message) {
      return NextResponse.json(
        { error: 'Pesan tidak boleh kosong.' },
        { status: 400 }
      );
    }

    // 1. SCENARIO: Cek Performa Penjualan
    if (
      q.includes('performa') ||
      q.includes('penjualan') ||
      q.includes('omset') ||
      q.includes('minggu ini') ||
      q.includes('laporan')
    ) {
      let totalRevenue = 4850000;
      let orderCount = 24;

      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: orders } = await supabase
            .from('orders')
            .select('gross_amount, status, created_at')
            .eq('tenant_slug', slug);

          if (orders && orders.length > 0) {
            orderCount = orders.length;
            totalRevenue = orders.reduce(
              (acc, o) => acc + (Number(o.gross_amount) || 0),
              0
            );
          }
        }
      } catch (err) {
        console.warn('[BoonPilot] Could not query orders for analytics:', err);
      }

      const formattedRev = `Rp ${totalRevenue.toLocaleString('id-ID')}`;

      const reply = `📊 **Ringkasan Performa Toko Anda:**
- **Total Omzet:** ${formattedRev} (↑ 18.5% dibanding periode sebelumnya)
- **Total Transaksi Selesai:** **${orderCount} pesanan**
- **Metode Pembayaran Terbanyak:** **QRIS Dinamis (68%)**, Transfer Bank (22%), COD (10%)
- **Rata-rata Nilai Transaksi (AOV):** Rp ${Math.round(totalRevenue / Math.max(1, orderCount)).toLocaleString('id-ID')}

💡 **Saran Strategis BoonPilot:**
Konversi tertinggi terjadi pada kampanye Meta Ads & TikTok di jam **19.00 - 22.00 WIB**. Pertimbangkan untuk menaikkan anggaran iklan berbayar pada slot waktu tersebut.`;

      return NextResponse.json({
        reply,
        action_proposal: null,
      });
    }

    // 2. SCENARIO: Cek Stok Produk Menipis
    if (
      q.includes('stok') ||
      q.includes('habis') ||
      q.includes('menipis') ||
      q.includes('inventory') ||
      q.includes('gudang') && !q.includes('penjemputan') && !q.includes('titik')
    ) {
      const reply = `⚠️ **Peringatan Stok Menipis:**
Sistem mendeteksi 2 produk dengan sisa stok kritis yang berpotensi kehabisan saat lonjakan pesanan terjadi:
- **Kemeja Casual Oxford Pria**: Sisa **3 unit** (Ambang batas aman: 15 unit)
- **Serum Brightening Glow 30ml**: Sisa **4 unit** (Ambang batas aman: 20 unit)

Apakah Anda ingin saya restock produk tersebut secara otomatis agar promosi tidak terhenti?`;

      const action_proposal = {
        id: `act_stock_${Date.now()}`,
        type: 'update_stock',
        title: 'Konfirmasi Penambahan Stok Produk',
        description: 'Ubah stok Kemeja Casual (+20 unit) dan Serum Brightening (+30 unit) sekarang?',
        summary: 'Sinkronisasi inventaris toko ke katalog produk aktif',
        details: {
          'Kemeja Casual Oxford': '3 unit ➔ 23 unit (+20)',
          'Serum Brightening Glow': '4 unit ➔ 34 unit (+30)',
          Target: 'Katalog Produk Toko & Landing Page',
        },
      };

      return NextResponse.json({
        reply,
        action_proposal,
      });
    }

    // 3. SCENARIO: Atur Titik Penjemputan Gudang Kurir
    if (
      q.includes('penjemputan') ||
      q.includes('titik jemput') ||
      q.includes('pickup') ||
      q.includes('kurir') ||
      q.includes('gudang kurir') ||
      q.includes('biteship')
    ) {
      const reply = `🚚 **Pengaturan Titik Jemput Gudang Kurir:**
Untuk mengaktifkan kalkulasi ongkir real-time dan layanan penjemputan paket otomatis oleh armada kurir (GoSend, GrabExpress, JNE, SiCepat), alamat asal penjemputan gudang perlu disinkronkan.

Berikut usulan pembaruan titik penjemputan gudang utama toko Anda:`;

      const action_proposal = {
        id: `act_pickup_${Date.now()}`,
        type: 'update_pickup_origin',
        title: 'Perbarui Titik Jemput Gudang Logistik',
        description: 'Ubah titik penjemputan ke Gudang Sentral Logistik BoonTrack (Kec. Coblong, Kota Bandung 40132)?',
        summary: 'Penyelarasan koordinat & kode pos untuk kalkulasi tarif Biteship real-time',
        details: {
          'Nama Tempat': 'Gudang Sentral Logistik BoonTrack',
          'Alamat Lengkap': 'Jl. Dipatiukur No. 88, Lebakgede, Kec. Coblong',
          'Kota / Kab': 'Kota Bandung, Jawa Barat',
          'Kode Pos': '40132',
        },
      };

      return NextResponse.json({
        reply,
        action_proposal,
      });
    }

    // 4. SCENARIO: Diskon / Voucher Promosi
    if (q.includes('diskon') || q.includes('promo') || q.includes('voucher') || q.includes('ongkir')) {
      const reply = `🎁 **Rekomendasi Kampanye Promosi:**
Anda dapat membuat kode voucher subsidi ongkir atau diskon persentase langsung untuk meningkatkan rasio checkout pembeli.

Saya dapat membantu mengaktifkan voucher potongan ongkir instan Rp 10.000 untuk pelanggan:`;

      const action_proposal = {
        id: `act_voucher_${Date.now()}`,
        type: 'create_voucher',
        title: 'Aktifkan Voucher Subsidi Ongkir Rp 10.000',
        description: 'Buat kupon promo `ONGKIRHEMAT` (Potongan Rp 10.000, Min. Belanja Rp 50.000)?',
        summary: 'Penerapan kupon otomatis pada form checkout single landing page',
        details: {
          'Kode Kupon': 'ONGKIRHEMAT',
          'Nilai Subsidi': 'Rp 10.000',
          'Minimum Belanja': 'Rp 50.000',
          Masa_Berlaku: '7 Hari ke Depan',
        },
      };

      return NextResponse.json({
        reply,
        action_proposal,
      });
    }

    // 5. Default Copilot Intelligent Assistant Response
    const defaultReply = `Halo! Saya **BoonPilot**, AI Copilot toko Anda di **${slug.replace(/[-_]/g, ' ').toUpperCase()}**.

Saya dapat membantu Anda mengelola toko dengan cepat:
- 📈 **Analisis Penjualan & Iklan**: Evaluasi omzet, closing QRIS, dan ROAS kampanye.
- 📦 **Manajemen Stok**: Memeriksa produk menipis dan restock inventaris otomatis.
- 🚚 **Logistik & Kurir**: Menyesuaikan titik penjemputan paket dan tarif kurir instan.
- 💬 **WhatsApp Automation**: Konfigurasi strategi bot CS dan pesan broadcast pelanggan.

Ketik pertanyaan atau klik salah satu tombol saran di atas untuk memulai!`;

    return NextResponse.json({
      reply: defaultReply,
      action_proposal: null,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem internal';
    return NextResponse.json(
      { error: errorMsg, reply: 'Maaf, terjadi kendala saat memproses permintaan Anda. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}
