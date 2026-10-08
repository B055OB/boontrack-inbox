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
    // Isolated Studio Gemini Key Guard
    const apiKey = process.env.GEMINI_API_KEY_STUDIO;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY_STUDIO belum terkonfigurasi.');
    }

    const body: GenerateRequest = await req.json();
    const { product_name, pain_point, hook_angle, cta_goal, category = 'General', tone = 'Casual Gaul' } = body;

    if (!product_name || !pain_point) {
      return NextResponse.json(
        { success: false, message: 'Nama produk dan pain point audiens wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '');
    const modelName = process.env.AI_MODEL_NAME || 'gemini-3.8-flash';

    // Attempt generation with Gemini Studio AI Engine
    let generatedScenes: any[] | null = null;
    let generatedAdsCopy: any = null;

    try {
      const prompt = `Anda adalah Creative Director iklan UGC (User Generated Content) TikTok, Shopee Video, dan Reels nomor 1 di Indonesia.
Buatkan 9 adegan naskah terstruktur untuk formula video 30 detik serta salinan iklan (Meta & TikTok Ads Manager) berikut:
- Nama Produk: ${product_name}
- Kategori: ${category}
- Masalah / Pain Point: ${pain_point}
- Sudut Pandang Hook: ${hook_angle}
- Tujuan CTA: ${cta_goal}
- Gaya Bahasa / Tone: ${tone}

Format output WAJIB berupa JSON murni dengan 9 adegan lengkap (scene 1 s/d 9) serta ads_copy mengikuti schema:
{
  "scenes": [
    {
      "scene_number": 1,
      "stage_name": "Visual Pattern Interrupt",
      "duration_sec": 3,
      "time_range": "0-3s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 2,
      "stage_name": "Hook Problem",
      "duration_sec": 3,
      "time_range": "3-6s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 3,
      "stage_name": "Agitation / Relatability",
      "duration_sec": 3,
      "time_range": "6-9s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 4,
      "stage_name": "Introduction Solution",
      "duration_sec": 3,
      "time_range": "9-12s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 5,
      "stage_name": "Product In-Action Demo",
      "duration_sec": 4,
      "time_range": "12-16s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 6,
      "stage_name": "Key Benefit 1",
      "duration_sec": 3,
      "time_range": "16-19s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 7,
      "stage_name": "Key Benefit 2",
      "duration_sec": 3,
      "time_range": "19-22s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 8,
      "stage_name": "Social Proof / Reassurance",
      "duration_sec": 3,
      "time_range": "22-25s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    },
    {
      "scene_number": 9,
      "stage_name": "Strong CTA",
      "duration_sec": 5,
      "time_range": "25-30s",
      "voiceover": "...",
      "visual_direction": "...",
      "on_screen_text": "..."
    }
  ],
  "ads_copy": {
    "headlines": [
      "Headline 1 singkat & menarik",
      "Headline 2 penasaran & klik",
      "Headline 3 promo & benefit"
    ],
    "primary_texts": [
      "Naskah feed variasi 1 (Storytelling & problem-solving)",
      "Naskah feed variasi 2 (Direct offer & urgensi diskon terbatas)"
    ],
    "call_to_actions": [
      "Beli Sekarang / Shop Now",
      "Pesan Sekarang / Order Now",
      "Pelajari Selengkapnya / Learn More"
    ]
  }
}`;

      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanApiKey}`;
      const geminiRes = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
        cache: 'no-store',
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed?.scenes && Array.isArray(parsed.scenes) && parsed.scenes.length === 9) {
            generatedScenes = parsed.scenes;
          }
          if (parsed?.ads_copy && typeof parsed.ads_copy === 'object') {
            generatedAdsCopy = parsed.ads_copy;
          }
        }
      }
    } catch (aiErr) {
      console.warn('[Studio AI Engine] Gemini call warning (falling back to formula):', aiErr);
    }

    // Dynamic 9-Scene Formula Generation Engine (Fallback & Deterministic baseline)
    const isUnboxing = hook_angle.toLowerCase().includes('unboxing');
    const isBeforeAfter = hook_angle.toLowerCase().includes('sebelum-sesudah') || hook_angle.toLowerCase().includes('before');
    const isHemat = hook_angle.toLowerCase().includes('hemat') || hook_angle.toLowerCase().includes('boncos');

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
    const s2Visual = `Kreator menatap cermin atau layar dengan ekspresi lelah. Tangan menunjuk area masalah (${category}) secara jelas dan natural.`;
    const s2Voiceover = `Pasti capek banget kan tiap hari harus ngadepin ${pain_point.slice(0, 60)} yang gak kelar-kelar?`;

    // Scene 3: Agitation / Relatability (3s)
    const s3Visual = `B-roll footage cepat: Menyingkirkan produk-produk lama yang tidak efektif ke meja, gestur menghela napas geleng kepala.`;
    const s3Voiceover = `Udah coba macam-macam cara, gonta-ganti produk lain tapi hasilnya zonk dan bikin kantong jebol.`;

    // Scene 4: Introduction Solution (3s)
    const s4Visual = `Hero shot sinematik! ${product_name} diangkat sejajar mata dengan pencahayaan hangat, efek kilau bersih dan gerakan memutar perlahan.`;
    const s4Voiceover = `Sampai akhirnya aku nemu penyelamat baru: ${product_name}. Ini game changer yang beneran ngubah rutinitas aku.`;

    // Scene 5: Product In-Action Demo (4s)
    const s5Visual = `Macro zoom tekstur/penggunaan produk saat diaplikasikan: tekstur ringan meresap cepat, bahan premium, atau build quality kokoh.`;
    const s5Voiceover = `Lihat pas dipakai, teksturnya ringan banget, nyaman, gak ribet sama sekali dan langsung bekerja seketika.`;

    // Scene 6: Key Benefit 1 (3s)
    const s6Visual = `Demonstrasi hasil langsung di kamera. Senyum puas kreator menunjukkan rasa percaya diri yang meningkat.`;
    const s6Voiceover = `Manfaat utamanya langsung berasa, bikin aktivitas seharian jadi jauh lebih tenang dan pede maksimal.`;

    // Scene 7: Key Benefit 2 (3s)
    const s7Visual = `Visual kemudahan dibawa bepergian (travel-friendly) atau ketahanan jangka panjang saat digunakan seharian.`;
    const s7Voiceover = `Plus praktis banget dibawa ke mana-mana, formulanya aman dan udah teruji klinis untuk pemakaian harian.`;

    // Scene 8: Social Proof / Reassurance (3s)
    const s8Visual = `Menampilkan pop-up screenshot sertifikat BPOM/Halal, rating 4.9/5 dari marketplace, dan testimoni ribuan pelanggan puas.`;
    const s8Voiceover = `Gak heran ratingnya tembus 4.9/5 dan udah ribuan orang ngerasain hasilnya sendiri. Dijamin original dan terpercaya.`;

    // Scene 9: Strong CTA (5s)
    const s9Visual = `Kreator tersenyum ramah menatap lensa, tangan menunjuk langsung ke pojok kiri bawah (tombol checkout / link bio) dengan grafis panah bergerak.`;
    const s9Voiceover = cta_goal.toLowerCase().includes('bio')
      ? `Khusus hari ini lagi ada diskon bundling terbatas! Langsung klik tautan di Bio profil sekarang sebelum kehabisan!`
      : `Stok promo terbatas banget dan bisa habis sewaktu-waktu. Yuk tap keranjang kuning di bawah sekarang juga!`;

    const scenes = generatedScenes || [
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

    // Ads Copy Meta & TikTok
    const defaultAdsCopy = {
      headlines: [
        `Solusi Atasi ${pain_point.slice(0, 32)} Seketika!`,
        `Viral di TikTok! Rahasia Baru ${product_name}`,
        `Jangan Beli ${category} Sebelum Lihat Ini!`,
      ],
      primary_texts: [
        `Capek ngadepin ${pain_point}? Kini hadir ${product_name} yang dirancang khusus untuk memberikan hasil nyata tanpa ribet. Coba sekarang dan buktikan sendiri perbedaannya!`,
        `Promo bundling terbatas hari ini! Dapatkan ${product_name} dengan penawaran harga spesial sebelum kehabisan stok. Garansi original & pengiriman kilat.`,
      ],
      call_to_actions: [
        'Shop Now (Beli Sekarang)',
        'Order Now (Pesan Sekarang)',
        'Learn More (Pelajari Selengkapnya)',
      ],
    };

    const finalAdsCopy = {
      headlines: Array.isArray(generatedAdsCopy?.headlines) && generatedAdsCopy.headlines.length > 0
        ? generatedAdsCopy.headlines.slice(0, 3)
        : defaultAdsCopy.headlines,
      primary_texts: Array.isArray(generatedAdsCopy?.primary_texts) && generatedAdsCopy.primary_texts.length > 0
        ? generatedAdsCopy.primary_texts.slice(0, 2)
        : defaultAdsCopy.primary_texts,
      call_to_actions: Array.isArray(generatedAdsCopy?.call_to_actions) && generatedAdsCopy.call_to_actions.length > 0
        ? generatedAdsCopy.call_to_actions.slice(0, 3)
        : defaultAdsCopy.call_to_actions,
    };

    return NextResponse.json({
      success: true,
      product_name,
      hook_angle,
      category,
      tone,
      model_name: modelName,
      total_duration_sec: 30,
      scenes,
      ads_copy: finalAdsCopy,
    });
  } catch (err: any) {
    console.error('[Studio Script Generate API] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal menghasilkan naskah AI.' },
      { status: 500 }
    );
  }
}
