import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface GenerateRequest {
  product_name: string;
  pain_point: string;
  hook_angle: string;
  cta_goal: string;
  category?: string;
  tone?: string;
}

export async function POST(req: Request) {
  try {
    const body: GenerateRequest = await req.json();
    const { product_name, pain_point, hook_angle, cta_goal, category = 'General', tone = 'Casual Gaul' } = body;

    if (!product_name || !pain_point) {
      return NextResponse.json(
        { success: false, message: 'Nama produk dan pain point audiens wajib diisi.' },
        { status: 400 }
      );
    }

    // Dynamic 9-Scene Formula Generation Engine
    const isUnboxing = hook_angle.toLowerCase().includes('unboxing');
    const isBeforeAfter = hook_angle.toLowerCase().includes('sebelum-sesudah') || hook_angle.toLowerCase().includes('before');
    const isHemat = hook_angle.toLowerCase().includes('hemat') || hook_angle.toLowerCase().includes('boncos');
    const isProblemFirst = hook_angle.toLowerCase().includes('masalah') || hook_angle.toLowerCase().includes('sehari-hari');

    // Scene 1: Visual Pattern Interrupt (3s)
    let s1Visual = `Kamera selfie handheld close-up ekspresi kaget menatap lensa sambil mengacungkan ${product_name}. Gerakan kamera cepat stop-scroll dengan sound effect whoosh.`;
    let s1Voiceover = `Stop scroll dulu! Sumpah kalau kamu masih mikir masalah ${pain_point.slice(0, 45)} nggak ada jalan keluarnya, kamu wajib tahu ini!`;
    if (isUnboxing) {
      s1Visual = `POV kamera menunduk membuka paket bubble wrap dengan suara renyah ASMR. Menampakkan kemasan elegan ${product_name} dalam 1 detik pertama.`;
      s1Voiceover = `Akhirnya paket viral yang lagi rame di TikTok nyampe juga! Kita bongkar bareng, beneran sebagus itu gak sih?`;
    } else if (isBeforeAfter) {
      s1Visual = `Split screen kilat (0.5s): Kiri foto kondisi buruk sebelum, Kanan wajah glowing/puas setelah pakai ${product_name}. Transisi zoom in cepat.`;
      s1Voiceover = `Liat sendiri bedanya! Ini kondisi aku sebelum vs sekarang setelah rutin pakai ${product_name}.`;
    } else if (isHemat) {
      s1Visual = `Kreator memegang dompet atau bukti struk belanjaan mahal, lalu menggelengkan kepala dramatis sebelum mengangkat ${product_name}.`;
      s1Voiceover = `Nyesel banget baru tahu sekarang! Ternyata buat beresin ${pain_point.slice(0, 40)} nggak perlu keluar uang jutaan!`;
    }

    // Scene 2: Hook Problem (3s)
    let s2Visual = `Kreator menatap cermin atau layar dengan ekspresi lelah. Tangan menunjuk area masalah (${category}) secara jelas dan natural.`;
    let s2Voiceover = `Pasti capek banget kan tiap hari harus ngadepin ${pain_point.slice(0, 60)} yang gak kelar-kelar?`;

    // Scene 3: Agitation / Relatability (3s)
    let s3Visual = `B-roll footage cepat: Menyingkirkan produk-produk lama yang tidak efektif ke meja, gestur menghela napas geleng kepala.`;
    let s3Voiceover = `Udah coba macam-macam cara, gonta-ganti produk lain tapi hasilnya zonk dan bikin kantong jebol.`;

    // Scene 4: Introduction Solution (3s)
    let s4Visual = `Hero shot sinematik! ${product_name} diangkat sejajar mata dengan pencahayaan hangat, efek kilau bersih dan gerakan memutar perlahan.`;
    let s4Voiceover = `Sampai akhirnya aku nemu penyelamat baru: ${product_name}. Ini game changer yang beneran ngubah rutinitas aku.`;

    // Scene 5: Product In-Action Demo (4s)
    let s5Visual = `Macro zoom tekstur/penggunaan produk saat diaplikasikan: tekstur ringan meresap cepat, bahan premium, atau build quality kokoh.`;
    let s5Voiceover = `Lihat pas dipakai, teksturnya ringan banget, nyaman, gak ribet sama sekali dan langsung bekerja seketika.`;

    // Scene 6: Key Benefit 1 (3s)
    let s6Visual = `Demonstrasi hasil langsung di kamera. Senyum puas kreator menunjukkan rasa percaya diri yang meningkat.`;
    let s6Voiceover = `Manfaat utamanya langsung berasa, bikin aktivitas seharian jadi jauh lebih tenang dan pede maksimal.`;

    // Scene 7: Key Benefit 2 (3s)
    let s7Visual = `Visual kemudahan dibawa bepergian (travel-friendly) atau ketahanan jangka panjang saat digunakan seharian.`;
    let s7Voiceover = `Plus praktis banget dibawa ke mana-mana, formulanya aman dan udah teruji klinis untuk pemakaian harian.`;

    // Scene 8: Social Proof / Reassurance (3s)
    let s8Visual = `Menampilkan pop-up screenshot sertifikat BPOM/Halal, rating 4.9/5 dari marketplace, dan testimoni ribuan pelanggan puas.`;
    let s8Voiceover = `Gak heran ratingnya tembus 4.9/5 dan udah ribuan orang ngerasain hasilnya sendiri. Dijamin original dan terpercaya.`;

    // Scene 9: Strong CTA (5s)
    let s9Visual = `Kreator tersenyum ramah menatap lensa, tangan menunjuk langsung ke pojok kiri bawah (tombol checkout / link bio) dengan grafis panah bergerak.`;
    let s9Voiceover = cta_goal.toLowerCase().includes('bio')
      ? `Khusus hari ini lagi ada diskon bundling terbatas! Langsung klik tautan di Bio profil sekarang sebelum kehabisan!`
      : `Stok promo terbatas banget dan bisa habis sewaktu-waktu. Yuk tap keranjang kuning di bawah sekarang juga!`;

    const scenes = [
      {
        scene_number: 1,
        stage_name: 'Visual Pattern Interrupt',
        duration_sec: 3,
        time_range: '0-3s',
        voiceover: s1Voiceover,
        visual_direction: s1Visual,
        on_screen_text: 'JANGAN BELI SEBELUM TAHU INI! 😱',
      },
      {
        scene_number: 2,
        stage_name: 'Hook Problem',
        duration_sec: 3,
        time_range: '3-6s',
        voiceover: s2Voiceover,
        visual_direction: s2Visual,
        on_screen_text: 'Pernah ngerasain hal yang sama? ✋',
      },
      {
        scene_number: 3,
        stage_name: 'Agitation / Relatability',
        duration_sec: 3,
        time_range: '6-9s',
        voiceover: s3Voiceover,
        visual_direction: s3Visual,
        on_screen_text: 'Udah coba ini itu tapi zonk... 💸',
      },
      {
        scene_number: 4,
        stage_name: 'Introduction Solution',
        duration_sec: 3,
        time_range: '9-12s',
        voiceover: s4Voiceover,
        visual_direction: s4Visual,
        on_screen_text: `Solusi Baru: ${product_name} ✨`,
      },
      {
        scene_number: 5,
        stage_name: 'Product In-Action Demo',
        duration_sec: 4,
        time_range: '12-16s',
        voiceover: s5Voiceover,
        visual_direction: s5Visual,
        on_screen_text: 'Langsung meresap & nyaman banget! 💧',
      },
      {
        scene_number: 6,
        stage_name: 'Key Benefit 1',
        duration_sec: 3,
        time_range: '16-19s',
        voiceover: s6Voiceover,
        visual_direction: s6Visual,
        on_screen_text: 'Hasil nyata bikin pede balik 100% 🔥',
      },
      {
        scene_number: 7,
        stage_name: 'Key Benefit 2',
        duration_sec: 3,
        time_range: '19-22s',
        voiceover: s7Voiceover,
        visual_direction: s7Visual,
        on_screen_text: 'Praktis, aman & nyaman seharian 🌟',
      },
      {
        scene_number: 8,
        stage_name: 'Social Proof / Reassurance',
        duration_sec: 3,
        time_range: '22-25s',
        voiceover: s8Voiceover,
        visual_direction: s8Visual,
        on_screen_text: '⭐⭐⭐⭐⭐ 4.9/5 (Teruji & Terpercaya)',
      },
      {
        scene_number: 9,
        stage_name: 'Strong CTA (Klaim Promo / Cek Link Bio)',
        duration_sec: 5,
        time_range: '25-30s',
        voiceover: s9Voiceover,
        visual_direction: s9Visual,
        on_screen_text: '👉 Klaim Promo Spesial Hari Ini! 🛒',
      },
    ];

    return NextResponse.json({
      success: true,
      product_name,
      hook_angle,
      category,
      tone,
      total_duration_sec: 30,
      scenes,
    });
  } catch (err: any) {
    console.error('[Studio Script Generate API] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal menghasilkan naskah AI.' },
      { status: 500 }
    );
  }
}
