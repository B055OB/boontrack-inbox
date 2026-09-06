import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export interface ActionProposal {
  id: string;
  action_type: string;
  title: string;
  summary: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED';
}

export interface MerchantCopilotResponse {
  status?: string;
  type: 'TEXT' | 'ACTION_PROPOSAL';
  reply: string;
  reply_text?: string;
  action_proposal?: ActionProposal | null;
  data?: Record<string, any> | null;
  quick_actions?: string[];
  session_id: string;
  tenant_id?: string;
}

function getSmartOnboardingFallback(
  userMessage: string,
  tenantSlug: string,
  sessionId: string
): MerchantCopilotResponse {
  const q = (userMessage || '').toLowerCase();

  // 1. Intent: Import massal / file Excel / CSV / spreadsheet / marketplace format
  if (
    q.includes('import') ||
    q.includes('excel') ||
    q.includes('csv') ||
    q.includes('xlsx') ||
    q.includes('spreadsheet') ||
    q.includes('tokopedia') ||
    q.includes('shopee') ||
    q.includes('format')
  ) {
    return {
      status: 'success',
      type: 'TEXT',
      reply: `Halo! Untuk mengunggah produk secara massal ke etalase toko Anda:

1. **Format File yang Didukung:** Anda dapat menggunakan format spreadsheet **.xlsx**, **.xls**, atau **.csv**.
2. **Struktur Kolom Rekomendasi:**
   - \`name\` / \`nama_produk\` *(Wajib)*: Nama lengkap produk.
   - \`price\` / \`harga\` *(Wajib)*: Angka harga jual tanpa titik/koma (contoh: \`150000\`).
   - \`stock\` / \`stok\`: Jumlah ketersediaan barang (default: \`99\`).
   - \`sku\`: Kode unik produk (otomatis dibuat jika kosong).
   - \`category\` / \`kategori\`: Kategori produk (contoh: *digital*, *fashion*, dsb).
   - \`description\` / \`deskripsi\`: Keterangan detail produk.
3. **Langkah Eksekusi:**
   - Klik tombol **'Import Massal (.xlsx / .csv)'** di tab **Katalog Produk**.
   - Pilih file spreadsheet dari perangkat Anda, lalu klik **Upload & Import Produk**.
   - Ratusan SKU produk akan langsung aktif di etalase dalam beberapa detik!

Jika Anda memiliki file export langsung dari Tokopedia atau Shopee, sistem akan otomatis mendeteksi kolom nama dan harga tanpa perlu ubah format secara manual.`,
      quick_actions: [
        'Panduan Format Spreadsheet',
        'Bagaimana cara import file Tokopedia/Shopee?',
        'Bantu saya upload produk',
      ],
      session_id: sessionId,
      tenant_id: tenantSlug,
    };
  }

  // 2. Intent: Tambah produk manual / upload satuan
  if (
    q.includes('tambah') ||
    q.includes('upload') ||
    q.includes('buat produk') ||
    q.includes('input') ||
    q.includes('produk baru')
  ) {
    return {
      status: 'success',
      type: 'TEXT',
      reply: `Untuk menambahkan produk baru secara manual ke katalog toko Anda:

1. Buka tab **Katalog Produk** di dashboard.
2. Klik tombol **'+ Tambah Produk Baru'** di bagian atas.
3. Masukkan informasi produk:
   - Nama produk & harga jual
   - Unggah foto/gambar produk via form
   - Kategori & jumlah stok
4. Klik **Simpan Produk**. Produk akan langsung siap dipesan pembeli dengan checkout instan dan pembayaran Dynamic QRIS otomatis!`,
      quick_actions: [
        '+ Tambah Produk Baru',
        'Import Massal (.xlsx / .csv)',
        'Bagaimana cara pasang Dynamic QRIS?',
      ],
      session_id: sessionId,
      tenant_id: tenantSlug,
    };
  }

  // 3. Intent: WhatsApp / Bot / Omnichannel
  if (
    q.includes('whatsapp') ||
    q.includes('wa') ||
    q.includes('bot') ||
    q.includes('inbox') ||
    q.includes('connect') ||
    q.includes('scan')
  ) {
    return {
      status: 'success',
      type: 'TEXT',
      reply: `BoonTrack menyediakan integrasi WhatsApp mutakhir untuk toko Anda:

1. **BoonTrack Direct Connect (Engine Mandiri):**
   - Buka tab **WhatsApp** di dashboard.
   - Scan QR Code langsung menggunakan WhatsApp di ponsel Anda via **Perangkat Tertaut**.
   - Bot AI akan langsung aktif membalas pertanyaan pembeli, konfirmasi stok, dan kirim tagihan QRIS 24/7 tanpa biaya per pesan.
2. **Persona AI Bot:** Anda dapat memilih mode *Toko Baru (Trust Builder)*, *Mode Seimbang*, atau *Mode Penjualan Cepat*.
3. **BoonTrack Inbox:** Pantau obrolan masuk dan lakukan intervensi percakapan oleh CS manusia secara real-time.`,
      quick_actions: [
        'Hubungkan WhatsApp Bot',
        'Cek Live Chat di BoonTrack Inbox',
        'Ganti Persona Bot WhatsApp',
      ],
      session_id: sessionId,
      tenant_id: tenantSlug,
    };
  }

  // 4. Intent: Performa penjualan / omset / stok toko
  if (
    q.includes('omset') ||
    q.includes('penjualan') ||
    q.includes('stok') ||
    q.includes('performa') ||
    q.includes('laporan')
  ) {
    return {
      status: 'success',
      type: 'TEXT',
      reply: `Halo! Saat ini toko Anda berada pada tahap inisialisasi awal (*onboarding*).

💡 **Langkah Prioritas untuk Memulai Penjualan:**
1. **Lengkapi Etalase:** Isi katalog produk melalui tombol **'Import Massal (.xlsx / .csv)'** atau **'+ Tambah Produk Baru'**.
2. **Sambungkan WhatsApp:** Hubungkan WhatsApp toko Anda via **BoonTrack Direct Connect** untuk melayani pelanggan otomatis.
3. **Mulai Promosi:** Bagikan link etalase toko Anda ke media sosial atau iklan Meta Ads.

Setelah transaksi pertama masuk, seluruh metrik omset, closing rate, dan ROAS akan terpantau otomatis di sini.`,
      quick_actions: [
        'Import Massal (.xlsx / .csv)',
        'Panduan Format Spreadsheet',
        'Hubungkan WhatsApp Bot',
      ],
      session_id: sessionId,
      tenant_id: tenantSlug,
    };
  }

  // 5. Default Warm Greeting & Guidance
  return {
    status: 'success',
    type: 'TEXT',
    reply: `Halo! Saya **BoonPilot Copilot**, AI asisten cerdas toko Anda. 🚀

Saya siap memandu Anda mengelola toko, mulai dari import massal katalog spreadsheet (.xlsx/.csv), penambahan produk baru, hingga otomatisasi WhatsApp toko Anda.

Silakan pilih topik bantuan cepat di bawah atau tanyakan langsung apa pun yang ingin Anda ketahui:`,
    quick_actions: [
      'Import Massal (.xlsx / .csv)',
      'Panduan Format Spreadsheet',
      'Bagaimana cara import file Tokopedia/Shopee?',
      'Bantu saya upload produk',
    ],
    session_id: sessionId,
    tenant_id: tenantSlug,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      tenant_id,
      message,
      session_id,
      conversation_history = [],
      history = [],
      context,
    } = body;

    // Multi-tenant fallback: default ke 'growth' atau 'onlineboost' agar testing / tenant baru tidak mental
    const slug = normalizeTenantSlug(tenant_slug || tenant_id || 'growth');
    const sessionId = session_id || `copilot_sess_${Date.now()}`;
    const storeName = slug.replace(/[-_]/g, ' ').toUpperCase();
    const activeHistory = conversation_history.length > 0 ? conversation_history : history;

    // Kandidat Backend URLs: mencakup environment variable, localhost (FastAPI dev), dan Railway production
    const backendCandidates = [
      process.env.CORE_BACKEND_URL,
      process.env.NEXT_PUBLIC_CORE_API_URL,
      process.env.NEXT_PUBLIC_API_URL,
      process.env.BACKEND_URL,
      process.env.NEXT_PUBLIC_BACKEND_URL,
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'https://boontrack-core-production.up.railway.app',
    ].filter(Boolean) as string[];

    const uniqueBases = Array.from(new Set(backendCandidates.map((u) => u.replace(/\/$/, ''))));

    const candidatePaths = [
      '/api/v1/merchant/copilot',
      '/api/merchant/copilot',
      '/api/v1/boonpilot/chat',
    ];

    let coreRes: Response | null = null;
    let successfulPath = '';

    for (const base of uniqueBases) {
      for (const path of candidatePaths) {
        const targetUrl = `${base}${path}`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant-Slug': slug,
              'X-Tenant-ID': slug,
              'X-Session-ID': sessionId,
            },
            body: JSON.stringify({
              tenant_slug: slug,
              tenant_id: slug,
              slug,
              message,
              session_id: sessionId,
              conversation_history: activeHistory,
              history: activeHistory,
              context: context || {
                tenant_slug: slug,
                store_name: storeName,
              },
            }),
            cache: 'no-store',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (res.ok) {
            coreRes = res;
            successfulPath = targetUrl;
            break;
          }
        } catch {
          // Lanjut ke kandidat berikutnya
        }
      }
      if (coreRes) break;
    }

    if (coreRes && coreRes.ok) {
      try {
        const coreData = await coreRes.json();
        let reply = coreData.reply || coreData.reply_text || coreData.text || '';
        let actionProposal = coreData.action_proposal || null;
        let dataPayload = coreData.data || null;
        let quickActions = coreData.quick_actions || [];

        // Parse nested JSON jika reply berupa format JSON string dari AI engine
        if (typeof reply === 'string' && reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
          try {
            const parsed = JSON.parse(reply.trim());
            if (parsed.reply) reply = parsed.reply;
            if (Array.isArray(parsed.quick_actions) && parsed.quick_actions.length > 0) {
              quickActions = parsed.quick_actions;
            }
            if (parsed.action_proposal) {
              actionProposal = parsed.action_proposal;
            }
            if (parsed.data) {
              dataPayload = parsed.data;
            }
          } catch {
            // Keep original string if JSON parsing fails
          }
        }

        return NextResponse.json({
          status: coreData.status || 'success',
          type: coreData.type || (actionProposal ? 'ACTION_PROPOSAL' : 'TEXT'),
          reply,
          reply_text: reply,
          action_proposal: actionProposal,
          data: dataPayload,
          quick_actions: quickActions,
          session_id: coreData.session_id || sessionId,
          tenant_id: slug,
        });
      } catch (parseErr) {
        console.warn('[Merchant Copilot] Error parsing core response, falling back to smart onboarding:', parseErr);
      }
    }

    // Smart Onboarding Fallback: Jika backend offline, 404, atau unreachable
    const fallbackResponse = getSmartOnboardingFallback(message, slug, sessionId);
    return NextResponse.json(fallbackResponse);

  } catch (error) {
    console.error('[BoonPilot Copilot] Fatal route error:', error);
    const fallbackResponse = getSmartOnboardingFallback('', 'growth', `err_${Date.now()}`);
    return NextResponse.json(fallbackResponse);
  }
}
