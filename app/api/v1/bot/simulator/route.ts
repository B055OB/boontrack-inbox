import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const { tenantSlug, message, history } = await req.json();

    if (!tenantSlug || !message) {
      return NextResponse.json({ reply: 'Pesan tidak boleh kosong.' }, { status: 400 });
    }

    const supabase = getSupabase();
    
    // Ambil konfigurasi skema reservasi tenant
    const { data: schema } = await supabase
      .from('tenant_booking_schemas')
      .select('*')
      .eq('tenant_slug', tenantSlug)
      .maybeSingle();

    const templates = schema?.message_templates || {};
    const lower = message.toLowerCase();

    // 1. In-Context / Regex Matching sederhana untuk testing alur utama
    if (lower.match(/\b(halo|hi|pagi|siang|sore|malam|permisi)\b/)) {
      return NextResponse.json({
        reply: templates.greeting || 'Halo! Mau konsultasi pembersihan toren ukuran berapa liter ya Kak?',
        state: 'AWAIT_CAPACITY',
      });
    }

    const literMatch = lower.match(/\b(\d{3,4})\s*(liter|l)?\b/);
    if (literMatch) {
      const liter = literMatch[1];
      const items = Array.isArray(schema?.pricing_tiers) ? schema.pricing_tiers : [];
      const matchedTier = items.find((t: any) => String(t.capacity) === liter);
      const harga = matchedTier ? `Rp ${matchedTier.price?.toLocaleString('id-ID')}` : 'Rp 200.000';

      return NextResponse.json({
        reply: `Baik Kak, untuk ukuran ${liter} Liter biayanya ${harga}. Mau kita jadwalkan hari ini atau besok ya Kak?`,
        state: 'AWAIT_SCHEDULE_CONFIRM',
      });
    }

    if (lower.match(/\b(nggak|gak|batal|nanti|pikir)\b/)) {
      return NextResponse.json({
        reply: templates.decline_response || 'Baik Kak, kabari kami jika sudah luang ya. Terima kasih!',
        state: 'IDLE',
      });
    }

    if (lower.match(/\b(boleh|bisa|jadwal|besok|hari ini|setuju|mau)\b/)) {
      return NextResponse.json({
        reply: templates.collect_details || 'Siap Kak, dengan siapa namanya dan alamat lengkap pengerjaannya di mana?',
        state: 'AWAIT_ADDRESS',
      });
    }

    if (lower.match(/\b(qris|transfer)\b/)) {
      return NextResponse.json({
        reply: templates.closing_qris || 'Terima kasih Kak, nanti dibayarkan via QRIS setelah pekerjaan beres ya. Teknisi kami akan meluncur sesuai jadwal.',
        state: 'COMPLETED',
      });
    }

    if (lower.match(/\b(tunai|cash|cod)\b/)) {
      return NextResponse.json({
        reply: templates.closing_cod || 'Terima kasih Kak, nanti dibayarkan tunai saja setelah pekerjaan beres ya. Sampai jumpa di lokasi!',
        state: 'COMPLETED',
      });
    }

    // 2. Out-of-Context Interceptor (Fallback ramah)
    return NextResponse.json({
      reply: `Untuk pertanyaan tersebut aman Kak, pengerjaan kami higienis dan profesional. Nah, untuk rencana torennya mau dikuras kapan ya Kak?`,
      state: 'PULLBACK',
    });

  } catch (err: any) {
    return NextResponse.json({ reply: 'Maaf, sistem simulator sedang mengalami gangguan.' }, { status: 500 });
  }
}