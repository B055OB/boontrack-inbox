import { NextResponse } from 'next/server';
import {
  checkStudioIntelligenceEntitled,
  assertStudioIntelligenceEntitled,
  StudioEntitlementError,
} from '@/lib/entitlements/studio-guard';
import { getFreshHookPatternInsights } from '@/lib/studio/intelligence/repository';
import { NormalizedInsight } from '@/lib/studio/intelligence/contracts';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { STUDIO_CREDIT_COSTS } from '@/lib/config/studio-pricing';
import {
  getAuthenticatedStudioSession,
  validateTenantOwnership,
} from '@/lib/auth/studio-session-guard';

export const runtime = 'nodejs';

interface GenerateRequest {
  product_name: string;
  pain_point: string;
  hook_angle: string;
  cta_goal: string;
  category?: string;
  tone?: string;
  tenant_id?: string;
  tenant_slug?: string;
  require_radar?: boolean;
  selected_hook?: string;
  selected_hook_template?: string;
}

/**
 * POST /api/studio/script/generate
 * Generates structured 9-scene UGC ad copy scripts.
 * Remediates Finding: SEC-P0-03 (Mandatory Session Authorization & Pre-Invocation Credit Deduction)
 */
export async function POST(req: Request) {
  try {
    // 1. Authoritative Session Verification
    const session = await getAuthenticatedStudioSession(req);
    if (!session.authenticated || !session.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Autentikasi sesi Studio diperlukan untuk membuat naskah AI.',
        },
        { status: 401 }
      );
    }

    const body: GenerateRequest = await req.json().catch(() => ({}));
    const { product_name, pain_point, hook_angle, cta_goal, category = 'General', tone = 'Casual Gaul' } = body;

    if (!product_name || !pain_point) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PAYLOAD', message: 'Nama produk dan pain point audiens wajib diisi.' },
        { status: 400 }
      );
    }

    // 2. Reject Client-Supplied Tenant Forgery
    const clientTenant =
      body.tenant_id ||
      body.tenant_slug ||
      (req.headers ? (typeof req.headers.get === 'function' ? req.headers.get('x-tenant-id') || req.headers.get('x-tenant-slug') : (req.headers as any)['x-tenant-id']) : undefined);

    const tenantCheck = validateTenantOwnership(session.tenantId, session.tenantSlug || '', clientTenant);
    if (!tenantCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN_TENANT_MISMATCH',
          message: tenantCheck.reason,
        },
        { status: 403 }
      );
    }

    // 3. Derive Authorized Tenant Exclusively from Session Claims
    const authorizedTenantId = session.tenantId;

    // Server-side guard: If radar is explicitly required, throw 403 FEATURE_NOT_ENTITLED if unentitled
    if (body.require_radar) {
      await assertStudioIntelligenceEntitled(authorizedTenantId, 'VIRAL_TRENDS_RADAR');
    }

    // Evaluate entitlement for Viral Trends Radar
    const radarCheck = await checkStudioIntelligenceEntitled(authorizedTenantId, 'VIRAL_TRENDS_RADAR');
    const isRadarEntitled = radarCheck.entitled;

    // Retrieve up to 3 FRESH hook pattern insights if entitled (Sesi Riset Tren: Kuota ter-bundle / 0 kredit)
    let radarInsights: NormalizedInsight[] = [];
    if (isRadarEntitled) {
      radarInsights = await getFreshHookPatternInsights(category, 3);
    }

    // 4. Mandatory Credit Reservation BEFORE External AI Invocation
    const requiredCredits = STUDIO_CREDIT_COSTS.PANDUAN_NASKAH_ASLI;
    const scriptJobId = crypto.randomUUID();

    const creditRes = await StudioCreditService.reserveCredits(
      authorizedTenantId,
      requiredCredits,
      `Panduan Naskah Asli: ${product_name}`,
      scriptJobId
    );

    if (!creditRes.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'INSUFFICIENT_CREDITS',
          message:
            creditRes.message ||
            `Kredit Studio Anda tidak mencukupi (Butuh ${requiredCredits} Kredit). Silakan lakukan top-up kredit.`,
          required_credits: requiredCredits,
          credits_remaining: creditRes.credits_remaining ?? 0,
        },
        { status: creditRes.statusCode === 402 ? 402 : 403 }
      );
    }

    const scriptRemainingCredits = creditRes.credits_remaining;

    // 5. External AI Invocation (ONLY after authorization and credit reservation pass)
    const apiKey = process.env.GEMINI_API_KEY_STUDIO;
    const modelName = process.env.AI_MODEL_NAME || 'gemini-3.8-flash';

    let generatedScenes: any[] | null = null;
    let generatedAdsCopy: any = null;

    if (apiKey) {
      const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '');

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

        const chosenSelectedHook = body.selected_hook || body.selected_hook_template;
        let radarConstraintText = '';
        if (chosenSelectedHook) {
          radarConstraintText += `\n\nFORMULA HOOK RADAR TERPILIH (PRIORITAS UTAMA):\n` +
            `Pengguna telah memilih secara spesifik formula hook ini: "${chosenSelectedHook}".\n` +
            `WAJIB adaptasikan pola kalimat dan emosi hook ini ke dalam Scene 1 dan Scene 2 untuk produk ${product_name}.\n`;
        }
        if (radarInsights.length > 0) {
          radarConstraintText += `\n\nBATASAN REFERENSI VIRAL TRENDS RADAR (TOP ${radarInsights.length} FRESH HOOK PATTERNS):\n` +
            `Sistem mendeteksi pola hook berkinerja tertinggi saat ini untuk kategori ${category}.\n` +
            `Adaptasikan dan adopsi pola hook berikut untuk menyusun Scene 1 (Visual Pattern Interrupt) dan Scene 2 (Hook Problem):\n` +
            radarInsights.map((insight, idx) => `  ${idx + 1}. [Keyakinan ${Math.round(insight.confidence_score * 100)}%] Pola: "${insight.pattern_template}"`).join('\n') +
            `\nCatatan: Jangan copy-paste secara mentah, melainkan terapkan pola psikologi di atas secara kontekstual untuk ${product_name}.\n`;
        }

      const cleanCategory = String(category || '').toLowerCase().trim();
      const isSaaS = cleanCategory.includes('saas') || cleanCategory.includes('software') || cleanCategory.includes('digital') || cleanCategory.includes('aplikasi') || cleanCategory.includes('app');
      const isService = cleanCategory.includes('service') || cleanCategory.includes('jasa') || cleanCategory.includes('agency') || cleanCategory.includes('konsultasi') || cleanCategory.includes('field');
      const isCosmetics = cleanCategory.includes('skincare') || cleanCategory.includes('cosmetic') || cleanCategory.includes('beauty') || cleanCategory.includes('serum') || cleanCategory.includes('flek');

      let categoryGuidelines = '';
      if (isSaaS) {
        categoryGuidelines = `\nPEDOMAN KHUSUS KATEGORI SOFTWARE / SAAS (WAJIB DIPATUHI):
1. Fokus penuh pada fitur produk software, alur kerja (workflow), nilai bisnis (ROI, efisiensi waktu, otomatisasi), dan demonstrasi visual antarmuka/layar dashboard.
2. Scene 5 (Product In-Action Demo) WAJIB berupa demonstrasi langsung navigasi software / aplikasi / dashboard di layar laptop/HP, BUKAN penggunaan produk fisik atau tekstur krim.
3. Scene 7 (Key Benefit 2) WAJIB menyoroti skalabilitas, kemudahan integrasi, kecepatan setup, atau keamanan data cloud.
4. Scene 8 (Social Proof) WAJIB berupa adopsi pengguna, testimoni bisnis, atau metrik penghematan waktu/biaya. DILARANG KERAS mencantumkan sertifikat BPOM, Halal, atau klaim medis skincare!
5. Scene 9 (Strong CTA) dan Ads Copy WAJIB berorientasi pada ajakan SaaS seperti: "Mulai Uji Coba Gratis / Free Trial", "Aktivasi Akun", "Coba Sekarang". DILARANG KERAS menggunakan istilah keranjang kuning (Shopee/TikTok Cart)!\n`;
      } else if (isService) {
        categoryGuidelines = `\nPEDOMAN KHUSUS KATEGORI LAYANAN / JASA (WAJIB DIPATUHI):
1. Fokus penuh pada solusi masalah klien, keahlian teknisi/konsultan profesional, keandalan jadwal, garansi pengerjaan, dan kemudahan booking.
2. Scene 5 (Product In-Action Demo) WAJIB memperlihatkan proses pengerjaan layanan secara profesional di lapangan. DILARANG membahas tekstur krim/kulit.
3. Scene 8 (Social Proof) WAJIB berupa testimoni kepuasan klien/pelanggan yang telah menggunakan jasa. DILARANG mencantumkan sertifikasi BPOM jika tidak relevan.
4. Scene 9 (Strong CTA) WAJIB berupa ajakan booking jadwal, reservasi konsultasi, atau chat WhatsApp resmi.\n`;
      } else if (isCosmetics) {
        categoryGuidelines = `\nPEDOMAN KHUSUS KATEGORI SKINCARE / KOSMETIK:
1. Fokus pada kenyamanan tekstur, kelembutan formula harian, bahan aktif ramah kulit, dan hasil nyata kulit tampak lebih sehat/cerah.
2. DILARANG mengarang nomor izin edar BPOM palsu atau klaim medis yang berlebihan.
3. Gunakan CTA yang jelas menuju toko resmi atau checkout produk.\n`;
      }

      const promptWithRadar = prompt + categoryGuidelines + radarConstraintText;

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanApiKey}`;
        const geminiRes = await fetch(geminiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptWithRadar }] }],
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
    }

    // Dynamic 9-Scene Formula Generation Engine (Fallback & Deterministic baseline)
    const cleanCat = String(category || '').toLowerCase().trim();
    const isSaaSMode = cleanCat.includes('saas') || cleanCat.includes('software') || cleanCat.includes('digital') || cleanCat.includes('aplikasi') || cleanCat.includes('app');
    const isServiceMode = cleanCat.includes('service') || cleanCat.includes('jasa') || cleanCat.includes('agency') || cleanCat.includes('konsultasi') || cleanCat.includes('field');

    const cleanHookAngle = String(hook_angle || '').toLowerCase();
    const isUnboxing = cleanHookAngle.includes('unboxing');
    const isBeforeAfter = cleanHookAngle.includes('sebelum-sesudah') || cleanHookAngle.includes('before');
    const isHemat = cleanHookAngle.includes('hemat') || cleanHookAngle.includes('boncos');

    // Scene 1: Visual Pattern Interrupt (3s)
    let s1Visual = isSaaSMode
      ? `Kamera selfie handheld close-up ekspresi antusias menatap layar laptop sambil menunjukkan dashboard ${product_name}. Transisi zoom in cepat ke antarmuka aplikasi.`
      : isServiceMode
      ? `Kamera handheld mengarah ke teknisi profesional berseragam rapi yang bersiap menangani pekerjaan di lokasi pelanggan.`
      : `Kamera selfie handheld close-up ekspresi kaget menatap lensa sambil mengacungkan ${product_name}. Gerakan kamera cepat stop-scroll dengan sound effect whoosh.`;

    let s1Voiceover = isSaaSMode
      ? `Stop scroll dulu! Kalau tim kamu masih ngerjain ${pain_point.slice(0, 45)} secara manual yang makan waktu berjam-jam, kamu wajib coba sistem ini!`
      : isServiceMode
      ? `Stop scroll dulu! Jangan biarkan masalah ${pain_point.slice(0, 45)} makin parah dan bikin biaya perbaikan bengkak!`
      : `Stop scroll dulu! Sumpah kalau kamu masih mikir masalah ${pain_point.slice(0, 45)} nggak ada jalan keluarnya, kamu wajib tahu ini!`;

    if (isUnboxing && !isSaaSMode && !isServiceMode) {
      s1Visual = `POV kamera menunduk membuka paket bubble wrap dengan suara renyah ASMR. Menampakkan kemasan elegan ${product_name} dalam 1 detik pertama.`;
      s1Voiceover = `Akhirnya paket viral yang lagi rame di TikTok nyampe juga! Kita bongkar bareng, beneran sebagus itu gak sih?`;
    } else if (isBeforeAfter) {
      s1Visual = isSaaSMode
        ? `Split screen kilat (0.5s): Kiri spreadsheet berantakan manual, Kanan dashboard otomatis ${product_name}.`
        : `Split screen kilat (0.5s): Kiri kondisi bermasalah sebelum, Kanan hasil rapi dan memuaskan setelah pakai ${product_name}.`;
      s1Voiceover = `Liat sendiri bedanya! Ini kondisi sebelum vs sekarang setelah pakai ${product_name}.`;
    } else if (isHemat) {
      s1Visual = `Kreator menunjukkan perbandingan efisiensi biaya dan waktu dramatis sebelum mengangkat ${product_name}.`;
      s1Voiceover = `Nyesel banget baru tahu sekarang! Ternyata buat beresin ${pain_point.slice(0, 40)} nggak perlu keluar biaya mahal!`;
    }

    // Scene 2: Hook Problem (3s)
    const s2Visual = `Kreator menatap layar atau area kerja dengan ekspresi lelah. Menyoroti masalah (${category}) secara jelas dan natural.`;
    const s2Voiceover = `Pasti capek banget kan tiap hari harus ngadepin ${pain_point.slice(0, 60)} yang gak kelar-kelar?`;

    // Scene 3: Agitation / Relatability (3s)
    const s3Visual = `B-roll footage cepat: Menggambarkan frustrasi akibat cara-cara lama yang tidak efektif.`;
    const s3Voiceover = isSaaSMode
      ? `Udah coba macam-macam spreadsheet dan tools lain tapi tetap ribet dan bikin tim pusing.`
      : `Udah coba macam-macam cara lain tapi hasilnya zonk dan cuma buang-buang biaya.`;

    // Scene 4: Introduction Solution (3s)
    const s4Visual = isSaaSMode
      ? `Hero shot sinematik! Layar laptop menampilkan halaman utama ${product_name} yang bersih dan modern.`
      : `Hero shot sinematik! ${product_name} ditampilkan jelas dengan pencahayaan hangat dan kesan profesional.`;
    const s4Voiceover = `Sampai akhirnya aku nemu solusi baru: ${product_name}. Ini game changer yang beneran ngubah alur kerja aku.`;

    // Scene 5: Product In-Action Demo (4s)
    const s5Visual = isSaaSMode
      ? `Screen recording antarmuka ${product_name}: navigasi menu intuitif, klik satu tombol langsung memproses data secara otomatis tanpa error.`
      : isServiceMode
      ? `Footage pengerjaan layanan secara langsung oleh tim profesional: pengerjaan teliti, peralatan berstandar tinggi, dan hasil rapi.`
      : `Demonstrasi langsung penggunaan ${product_name}: langkah praktis, mudah dipahami, build quality premium, dan langsung terlihat hasilnya.`;
    const s5Voiceover = isSaaSMode
      ? `Lihat pas dipakai, dashboard-nya simpel banget, setup cuma 2 menit langsung jalan, dan otomatis beresin alur kerja kamu seketika.`
      : isServiceMode
      ? `Lihat tim ahli saat bekerja, pengerjaannya detail, rapi, tepat waktu, dan langsung beres tanpa bikin kamu pusing.`
      : `Metode dan cara pakainya praktis banget, nyaman, gak ribet sama sekali dan langsung bekerja seketika.`;
    const s5OnScreenText = isSaaSMode
      ? 'Alur Kerja Otomatis & Cepat! ⚡'
      : isServiceMode
      ? 'Pengerjaan Profesional & Tuntas! 🛠️'
      : 'Praktis, mudah & langsung terasa! ✨';

    // Scene 6: Key Benefit 1 (3s)
    const s6Visual = `Demonstrasi hasil langsung di kamera. Senyum puas kreator menunjukkan rasa percaya diri dan kepuasan tinggi.`;
    const s6Voiceover = `Manfaat utamanya langsung berasa, bikin aktivitas seharian jadi jauh lebih tenang dan pede maksimal.`;

    // Scene 7: Key Benefit 2 (3s)
    const s7Visual = isSaaSMode
      ? `Visual akses multi-device (laptop, tablet, HP) dengan enkripsi cloud aman dan sinkronisasi real-time 24 jam.`
      : isServiceMode
      ? `Dokumentasi jaminan garansi pengerjaan dan kemudahan penjadwalan fleksibel.`
      : `Visual kemudahan akses dan penggunaan sehari-hari yang fleksibel serta praktis untuk aktivitas harian.`;
    const s7Voiceover = isSaaSMode
      ? `Plus fleksibel diakses dari mana saja, aman terenkripsi, dan siap di-scale seiring perkembangan bisnis kamu.`
      : isServiceMode
      ? `Plus ada jaminan garansi kepuasan dan tim berpengalaman yang siap melayani sesuai jadwal kamu.`
      : `Plus praktis banget digunakan kapan saja, terstruktur rapi dan aman untuk kebutuhan harian kamu.`;
    const s7OnScreenText = isSaaSMode
      ? 'Akses Cloud Aman & Terenkripsi 24 Jam ☁️'
      : isServiceMode
      ? 'Garansi Pengerjaan & Tim Terpercaya 🛡️'
      : 'Praktis, aman & nyaman seharian 🌟';

    // Scene 8: Social Proof / Reassurance (3s)
    const s8Visual = isSaaSMode
      ? `Menampilkan deretan logo brand/bisnis yang telah memakai ${product_name}, rating kepuasan 4.9/5, dan kutipan testimoni profesional.`
      : isServiceMode
      ? `Dokumentasi testimoni kepuasan pelanggan dan foto pengerjaan sebelum vs sesudah.`
      : `Menampilkan pop-up screenshot testimoni kepuasan, rating 4.9/5, atau badge garansi kualitas terpercaya.`;
    const s8Voiceover = isSaaSMode
      ? `Gak heran udah ratusan bisnis aktif mempercayakan sistem ini dan ngerasain efisiensi nyata setiap hari.`
      : isServiceMode
      ? `Sudah dipercaya ribuan pelanggan puas dengan reputasi terbukti. Dijamin amanah dan berkualitas.`
      : `Kualitasnya teruji, ratingnya tembus 4.9/5 dan udah ribuan orang ngerasain hasilnya sendiri. Terbukti terpercaya.`;

    // Scene 9: Strong CTA (5s)
    const s9Visual = isSaaSMode
      ? `Kreator tersenyum menunjuk tombol CTA di bawah layar (Mulai Uji Coba Gratis / Coba Sekarang).`
      : isServiceMode
      ? `Kreator tersenyum sopan menunjuk ke arah tombol kontak WhatsApp atau tautan bio.`
      : `Kreator tersenyum ramah menatap lensa, tangan menunjuk langsung ke pojok kiri bawah (tombol checkout / link bio) dengan grafis panah bergerak.`;
    const s9Voiceover = isSaaSMode
      ? `Yuk klik link di bawah sekarang untuk mulai uji coba gratis dan buktikan sendiri kemudahannya!`
      : isServiceMode
      ? `Jadwal terbatas minggu ini! Langsung klik tautan di bio profil atau hubungi kami untuk booking jadwal sekarang!`
      : String(cta_goal || '').toLowerCase().includes('bio')
      ? `Khusus hari ini lagi ada diskon bundling terbatas! Langsung klik tautan di Bio profil sekarang sebelum kehabisan!`
      : `Stok promo terbatas banget dan bisa habis sewaktu-waktu. Yuk amankan pesanan kamu sekarang juga!`;
    const s9OnScreenText = isSaaSMode
      ? '👉 Coba Gratis Sekarang Tanpa Kartu Kredit! 🚀'
      : isServiceMode
      ? '👉 Booking Jadwal Sekarang Lewat WhatsApp / Bio! 📲'
      : '👉 Klaim Promo Spesial Hari Ini! 🛒';

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
        on_screen_text: s5OnScreenText,
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
        on_screen_text: s7OnScreenText,
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
        on_screen_text: s9OnScreenText,
      },
    ];

    // Ads Copy Meta & TikTok
    const defaultAdsCopy = {
      headlines: isSaaSMode
        ? [
            `Tingkatkan Efisiensi Bisnis dengan ${product_name}!`,
            `Otomatisasi Workflow & Solusi Cepat ${pain_point.slice(0, 25)}`,
            `Software Cloud Terbaik: Coba ${product_name} Hari Ini`,
          ]
        : isServiceMode
        ? [
            `Solusi Profesional Mengatasi ${pain_point.slice(0, 25)}`,
            `Layanan Terpercaya Bergaransi Resmi - ${product_name}`,
            `Booking Praktis Tanpa Ribet Bersama Tim Ahli`,
          ]
        : [
            `Solusi Atasi ${pain_point.slice(0, 32)} Seketika!`,
            `Viral di TikTok! Rahasia Baru ${product_name}`,
            `Jangan Beli ${category} Sebelum Lihat Ini!`,
          ],
      primary_texts: isSaaSMode
        ? [
            `Tinggalkan cara manual yang memakan waktu! ${product_name} membantu tim Anda bekerja lebih cepat, akurat, dan terintegrasi dalam satu platform cloud yang aman.`,
            `Mulai uji coba gratis Anda hari ini dan rasakan peningkatan produktivitas nyata sejak hari pertama. Setup instan tanpa instalasi rumit!`,
          ]
        : [
            `Capek ngadepin ${pain_point}? Kini hadir ${product_name} yang dirancang khusus untuk memberikan hasil nyata tanpa ribet. Coba sekarang dan buktikan sendiri perbedaannya!`,
            `Promo terbatas hari ini! Dapatkan ${product_name} dengan penawaran harga spesial sebelum kehabisan. Garansi kualitas terbaik.`,
          ],
      call_to_actions: isSaaSMode
        ? [
            'Start Free Trial (Mulai Uji Coba Gratis)',
            'Learn More (Pelajari Selengkapnya)',
            'Sign Up (Daftar Sekarang)',
          ]
        : isServiceMode
        ? [
            'Book Now (Booking Sekarang)',
            'Contact Us (Hubungi Kami)',
            'Learn More (Pelajari Selengkapnya)',
          ]
        : [
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
      radar_insights_applied: radarInsights.length > 0 ? radarInsights.map((r) => ({
        id: r.id,
        pattern_template: r.pattern_template,
        confidence_score: r.confidence_score,
      })) : undefined,
      scenes,
      ads_copy: finalAdsCopy,
      remaining_credits: scriptRemainingCredits,
      consumed_credits: requiredCredits,
    });
  } catch (err: any) {
    console.error('[Studio Script Generate API] Error:', err);

    if (err.code === 'FEATURE_NOT_ENTITLED' || err.statusCode === 403) {
      return NextResponse.json(
        { success: false, error: 'FEATURE_NOT_ENTITLED', message: err.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err.message || 'Gagal menghasilkan naskah AI.' },
      { status: err.statusCode || 500 }
    );
  }
}
