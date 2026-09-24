import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

type CanonicalVertical =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'FOOD'
  | 'CREATOR_AGENCY';

interface GeneratePitchRequest {
  tenant_id: string;
  tenant_slug?: string;
  product_name: string;
  vertical: CanonicalVertical;
  price?: number;
  target_audience?: string;
  key_benefits?: string;
  tone?: 'trust_builder' | 'balanced' | 'hard_sell';
}

interface PitchOutput {
  tagline: string;
  description: string;
  facilities: string[];
  promo_label?: string;
  cta_label?: string;
  seo_slug_suggestion: string;
  vertical_notes?: string;
}

const VERTICAL_PROMPT_CONTEXT: Record<CanonicalVertical, string> = {
  PHYSICAL:
    'This is a physical retail product. Emphasize quality, packaging, shipping speed, and return policy.',
  DIGITAL:
    'This is a digital product (e-course, e-book, template, software access). Emphasize instant delivery, lifetime access, and transformation outcomes. Do NOT mention physical shipping or weight.',
  FIELD_SERVICE:
    'This is a field service (technician visit, repair, installation). Emphasize on-site execution, scheduling ease, and technician credentials.',
  PROFESSIONAL_SERVICE:
    'This is a professional/consulting service (legal, accounting, coaching, travel/umroh). Emphasize expertise, trust, and ROI.',
  FOOD:
    'This is a food & beverage product. Emphasize taste, freshness, hygiene, halal certification if applicable, and packaging.',
  CREATOR_AGENCY:
    'This is an agency or creator service (marketing agency, dev shop, content creation). Emphasize portfolio quality, turnaround time, and client ROI.',
};

const TONE_INSTRUCTIONS: Record<string, string> = {
  trust_builder: 'Use a warm, educational, and empathetic tone. Build trust gently. Mention guarantees and transparent process.',
  balanced: 'Use a professional and clear tone. Highlight key benefits concisely.',
  hard_sell: 'Use an urgent, high-energy tone. Emphasize scarcity, time-limited offers, and direct CTAs.',
};

function buildGeminiPrompt(req: GeneratePitchRequest, tenantName: string): string {
  const verticalCtx = VERTICAL_PROMPT_CONTEXT[req.vertical] || VERTICAL_PROMPT_CONTEXT['PHYSICAL'];
  const toneCtx = TONE_INSTRUCTIONS[req.tone || 'balanced'];
  const priceStr = req.price ? `Rp ${req.price.toLocaleString('id-ID')}` : 'not specified';

  return `You are BoonPilot, an expert product copywriter for Indonesian e-commerce merchants on the BoonTrack platform.

## Store Context
- Store: ${tenantName}
- Product Name: ${req.product_name}
- Vertical: ${req.vertical}
- Price: ${priceStr}
- Target Audience: ${req.target_audience || 'general buyers in Indonesia'}
- Key Benefits: ${req.key_benefits || 'infer from product name and vertical'}

## Vertical Guidelines
${verticalCtx}

## Tone
${toneCtx}

## Output
Return ONLY a JSON object with these exact fields (no markdown, no extra text):
{
  "tagline": "punchy headline max 15 words in Indonesian",
  "description": "2-3 sentence product description in Indonesian for WhatsApp catalog",
  "facilities": ["4-6 bullet points describing features/benefits in Indonesian, max 12 words each"],
  "promo_label": "short badge max 4 words or empty string",
  "cta_label": "CTA button text max 5 words adapted to vertical",
  "seo_slug_suggestion": "url-safe slug derived from product name: ${req.product_name}",
  "vertical_notes": "one sentence in Indonesian about fulfillment/checkout config for this vertical"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body: GeneratePitchRequest = await req.json();
    const { tenant_id, tenant_slug, product_name, vertical, price, target_audience, key_benefits, tone } = body;

    if (!tenant_id && !tenant_slug) {
      return NextResponse.json({ error: 'MISSING_TENANT', message: 'tenant_id atau tenant_slug wajib disertakan.' }, { status: 400 });
    }

    if (!product_name || product_name.trim().length < 2) {
      return NextResponse.json({ error: 'MISSING_PRODUCT_NAME', message: 'Nama produk wajib diisi (minimal 2 karakter).' }, { status: 400 });
    }

    const VALID_VERTICALS: CanonicalVertical[] = ['PHYSICAL', 'DIGITAL', 'FIELD_SERVICE', 'PROFESSIONAL_SERVICE', 'FOOD', 'CREATOR_AGENCY'];
    if (!vertical || !VALID_VERTICALS.includes(vertical)) {
      return NextResponse.json({ error: 'INVALID_VERTICAL', message: `Vertical tidak valid. Pilih: ${VALID_VERTICALS.join(', ')}.` }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB_UNAVAILABLE', message: 'Database tidak tersedia.' }, { status: 503 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let tenantQuery = supabase.from('tenants').select('id, slug, tier, metadata');
    if (tenant_id && UUID_REGEX.test(tenant_id)) {
      tenantQuery = tenantQuery.eq('id', tenant_id);
    } else if (tenant_slug) {
      tenantQuery = tenantQuery.eq('slug', tenant_slug.trim().toLowerCase());
    } else {
      tenantQuery = tenantQuery.eq('slug', (tenant_id || '').trim().toLowerCase());
    }

    const { data: tenantRow, error: tenantErr } = await tenantQuery.maybeSingle();

    if (tenantErr) {
      console.error('[BoonPilot/pitch] Supabase error:', tenantErr);
      return NextResponse.json({ error: 'TENANT_LOOKUP_ERROR', message: 'Gagal memverifikasi tenant.' }, { status: 500 });
    }

    if (!tenantRow) {
      return NextResponse.json({ error: 'TENANT_NOT_FOUND', message: 'Tenant tidak ditemukan.' }, { status: 404 });
    }

    const tenantTier = String(tenantRow.tier || '').toUpperCase();
    const featureFlags = tenantRow.metadata?.features || {};

    if (tenantTier === 'CHECKOUT_LITE' || featureFlags.boonpilot === false) {
      return NextResponse.json(
        { error: 'FEATURE_NOT_ENTITLED', message: 'BoonPilot Product Pitch Architect tidak tersedia untuk paket CHECKOUT_LITE. Upgrade ke Starter atau Pro Scale.', upgrade_required: true },
        { status: 403 }
      );
    }

    const tenantDisplayName = tenantRow.metadata?.store_name || tenantRow.metadata?.display_name || tenantRow.slug || 'Toko BoonTrack';
    const prompt = buildGeminiPrompt({ tenant_id: tenantRow.id, product_name, vertical, price, target_audience, key_benefits, tone }, tenantDisplayName);

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'AI_UNAVAILABLE', message: 'AI Engine tidak dikonfigurasi.' }, { status: 503 });
    }

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
      cache: 'no-store',
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text().catch(() => 'unknown');
      console.error('[BoonPilot/pitch] Gemini error:', geminiResponse.status, errText);
      return NextResponse.json({ error: 'AI_GENERATION_FAILED', message: 'Gagal menghasilkan pitch dari AI. Silakan coba lagi.' }, { status: 502 });
    }

    const geminiData = await geminiResponse.json();
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return NextResponse.json({ error: 'AI_EMPTY_RESPONSE', message: 'AI mengembalikan respons kosong.' }, { status: 502 });
    }

    let pitch: PitchOutput;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      pitch = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[BoonPilot/pitch] JSON parse error:', parseErr, rawText.slice(0, 200));
      return NextResponse.json({ error: 'AI_PARSE_ERROR', message: 'AI output tidak valid. Coba lagi dengan deskripsi lebih spesifik.' }, { status: 502 });
    }

    const result: PitchOutput = {
      tagline: String(pitch.tagline || '').slice(0, 200),
      description: String(pitch.description || '').slice(0, 1000),
      facilities: Array.isArray(pitch.facilities) ? pitch.facilities.map((f: unknown) => String(f)).filter(Boolean).slice(0, 10) : [],
      promo_label: pitch.promo_label ? String(pitch.promo_label).slice(0, 50) : undefined,
      cta_label: pitch.cta_label ? String(pitch.cta_label).slice(0, 50) : undefined,
      seo_slug_suggestion: String(pitch.seo_slug_suggestion || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80),
      vertical_notes: pitch.vertical_notes ? String(pitch.vertical_notes).slice(0, 300) : undefined,
    };

    return NextResponse.json({
      success: true,
      pitch: result,
      meta: { tenant_id: tenantRow.id, vertical, product_name, generated_at: new Date().toISOString() },
    }, { status: 200 });

  } catch (err) {
    console.error('[BoonPilot/pitch] Unhandled error:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal.' }, { status: 500 });
  }
}
