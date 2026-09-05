import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';

export interface PlatformSupportResponse {
  type: 'TEXT' | 'ESCALATE_WA';
  reply: string;
  category?: 'billing' | 'technical' | 'affiliate' | 'general';
  escalation_url?: string;
  quick_actions?: string[];
  session_id: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      message,
      category = 'general',
      session_id,
    } = body;

    const sessionId = session_id || `support_sess_${Date.now()}`;
    const q = (message || '').trim().toLowerCase();

    // 1. Try Core Backend if available
    try {
      const coreRes = await fetch(getBackendApiUrl('/api/v1/platform/support'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_slug, message, category, session_id: sessionId }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData && coreData.reply) {
          return NextResponse.json(coreData);
        }
      }
    } catch {
      // Fallback to structured platform helpdesk engine
    }

    // 2. Structured Platform Support Engine
    const waHelpdesk = 'https://wa.me/6281237450222';

    // A. Billing / Upgrade / Paket
    if (q.includes('upgrade') || q.includes('paket') || q.includes('tier') || q.includes('langganan') || q.includes('biaya')) {
      const reply = `💳 **Informasi Paket & Langganan Platform BoonTrack:**
- **Tier Growth (Rp199.000/bln)**: Toko instan, Scan QR Instan (BoonTrack Engine), kasir otomatis 24 jam, 1 CS agent seat.
- **Tier Growth+ Tracking**: Menambahkan integrasi Meta CAPI Server-Side & Ads Tracking ROAS iklan, 2 CS agent seats.
- **Tier ProScale**: Akses resmi Meta Cloud API (Official WABA centang hijau anti-banned), WhatsApp Broadcast Massal resmi, unlimited CS agent seats.

Apakah Anda ingin dibantu aktivasi upgrade langsung melalui Account Manager kami?`;

      return NextResponse.json({
        type: 'ESCALATE_WA',
        reply,
        category: 'billing',
        escalation_url: `${waHelpdesk}?text=${encodeURIComponent('Halo Tim Billing BoonTrack, saya ingin konsultasi upgrade paket toko saya.')}`,
        quick_actions: ['Upgrade ke Growth+ Tracking', 'Upgrade ke ProScale (WABA)', 'Cek Jadwal Penagihan'],
        session_id: sessionId,
      } as PlatformSupportResponse);
    }

    // B. Affiliate & Payout / Komisi
    if (q.includes('affiliate') || q.includes('komisi') || q.includes('payout') || q.includes('pencairan') || q.includes('rekening')) {
      const reply = `🤝 **Layanan Kemitraan & Payout Mitra BoonTrack:**
- **Portal Mitra**: Khusus mempromosikan platform shop.boontrack.com via link referral berformat \`shop.boontrack.com/?ref={KODE}\`.
- **Kustomisasi Kode Referral**: Mitra terdaftar dapat mengklaim 1x custom slug permanen.
- **Jadwal & SLA Payout**: Pencairan komisi diproses berkala maksimal 1x24 jam kerja ke rekening Bank / E-Wallet terverifikasi.`;

      return NextResponse.json({
        type: 'TEXT',
        reply,
        category: 'affiliate',
        quick_actions: ['Bagaimana cara klaim custom slug?', 'Syarat penarikan saldo', 'Hubungi AM Affiliate'],
        session_id: sessionId,
      } as PlatformSupportResponse);
    }

    // C. Technical / CAPI / Webhook / Domain
    if (q.includes('teknis') || q.includes('capi') || q.includes('pixel') || q.includes('domain') || q.includes('webhook')) {
      const reply = `⚙️ **Bantuan Teknis & Integrasi Sistem:**
- **Meta Conversions API (CAPI)**: Kirim token akses Meta di tab Ads Tracking Pro untuk pelacakan server-side 100% akurat tanpa terhalang adblocker.
- **QRIS Dinamis**: Gateway pembayaran terhubung otomatis tanpa perlu registrasi merchant terpisah.
- **Dukungan Server**: 99.9% Uptime SLA di Railway Enterprise Infrastructure.

Jika Anda membutuhkan bantuan teknis kustom, teknisi kami siap membantu via WhatsApp.`;

      return NextResponse.json({
        type: 'ESCALATE_WA',
        reply,
        category: 'technical',
        escalation_url: `${waHelpdesk}?text=${encodeURIComponent('Halo Tim Teknis BoonTrack, saya butuh bantuan setup integrasi.')}`,
        quick_actions: ['Setup Meta CAPI', 'Konfigurasi Alamat Gudang', 'Hubungi WhatsApp Support'],
        session_id: sessionId,
      } as PlatformSupportResponse);
    }

    // D. General Platform Help
    return NextResponse.json({
      type: 'TEXT',
      reply: `Halo! Selamat datang di **Pusat Bantuan & Layanan Pelanggan BoonTrack** 🚀 Tim kami siap membantu kendala operasional toko, upgrade paket, kemitraan affiliate, dan integrasi WhatsApp.`,
      category: 'general',
      quick_actions: ['Info Upgrade Paket Toko', 'Bantuan Teknis CAPI', 'Tanya Program Kemitraan Mitra', 'Hubungi Live Support WA'],
      session_id: sessionId,
    } as PlatformSupportResponse);

  } catch (error) {
    console.error('Platform support API error:', error);
    return NextResponse.json({
      type: 'TEXT',
      reply: 'Halo! Pusat Bantuan BoonTrack siap melayani Anda.',
      session_id: 'err_fallback',
    });
  }
}
