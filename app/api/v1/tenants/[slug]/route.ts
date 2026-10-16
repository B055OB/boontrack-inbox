import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'TENANT_IDENTIFIER_REQUIRED', message: 'Identifier tenant wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Koneksi database tidak tersedia.' },
        { status: 503 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    let query = supabase.from('tenants').select('*');
    if (isUuid) {
      query = query.eq('id', slug);
    } else {
      query = query.eq('slug', slug);
    }

    const { data: tenantRow, error: dbErr } = await query.maybeSingle();

    if (dbErr) {
      console.error('[Tenant API] Database lookup error:', { code: dbErr.code, message: dbErr.message });
      return NextResponse.json(
        { success: false, error: 'TENANT_LOOKUP_FAILED', message: dbErr.message },
        { status: 503 }
      );
    }

    // Fail-Closed: Strictly return 404 if tenant does not exist in Supabase (No Fake Fallback §0.12)
    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant tidak ditemukan untuk: ${slug}` },
        { status: 404 }
      );
    }

    // Validated DTO Mapper (Ensures all fields expected by frontend contract are normalized)
    const metadata = (typeof tenantRow.metadata === 'object' && tenantRow.metadata !== null) ? tenantRow.metadata : {};
    const product = (typeof metadata.product === 'object' && metadata.product !== null) ? metadata.product : {};

    const productsList =
      Array.isArray(metadata.products) && metadata.products.length > 0
        ? metadata.products
        : product.name
        ? [product]
        : [];

    const packages: Array<{
      id: string;
      name: string;
      price: number;
      description: string;
    }> = [];

    if (productsList.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productsList.forEach((prod: any, idx: number) => {
        if (!prod) return;
        const isProdDigital =
          String(prod.type ?? '').toLowerCase() === 'digital' ||
          String(prod.product_type ?? '').toLowerCase() === 'digital' ||
          String(prod.category ?? '').toLowerCase().includes('digital') ||
          String(tenantRow.category ?? '').toLowerCase().includes('digital');

        packages.push({
          id: String(prod.id ?? `${slug}-prod-${idx}`),
          name: String(prod.name ?? prod.title ?? 'Produk Unggulan'),
          price: Number(prod.price ?? 0),
          description:
            [
              prod.variants ? `Varian: ${prod.variants}` : '',
              prod.promo ? `Promo: ${prod.promo}` : '',
              isProdDigital ? 'Format Digital' : 'Barang Fisik',
            ]
              .filter(Boolean)
              .join(' • ') || 'Produk Unggulan',
        });
      });
    }

    const rawTier = String(tenantRow.tier || metadata.tier || metadata.plan_tier || 'STARTER');
    const isTrial = Boolean(
      rawTier.toLowerCase().includes('trial') ||
      rawTier.toUpperCase() === 'SOLO_TRIAL' ||
      metadata.is_trial === true
    );

    let trialEndsAt: string | null = null;
    let daysLeft: number | null = null;
    let isExpired = false;

    if (isTrial) {
      if (tenantRow.trial_ends_at) {
        trialEndsAt = new Date(tenantRow.trial_ends_at).toISOString();
      } else if (metadata.trial_ends_at) {
        trialEndsAt = new Date(metadata.trial_ends_at).toISOString();
      } else if (tenantRow.created_at) {
        trialEndsAt = new Date(new Date(tenantRow.created_at).getTime() + 7 * 86400000).toISOString();
      } else {
        trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
      }

      const diffMs = new Date(trialEndsAt).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      isExpired = daysLeft <= 0;
    }

    const tenantName = String(tenantRow.name ?? slug);

    return NextResponse.json({
      success: true,
      tenant: {
        id: String(tenantRow.id ?? ''),
        slug: String(tenantRow.slug ?? slug),
        name: tenantName,
        category: String(tenantRow.category ?? 'retail'),
        tier: rawTier,
        is_trial: isTrial,
        trial_ends_at: trialEndsAt,
        days_left: daysLeft,
        is_expired: isExpired,
        metadata,
        packages:
          packages.length > 0
            ? packages
            : [
                {
                  id: `${slug}-default`,
                  name: `${tenantName} Paket Utama`,
                  price: Number(product.price ?? 50000),
                  description: 'Paket / Layanan Resmi',
                },
              ],
        persona: {
          ai_name: `${tenantName} AI`,
          greeting_message: `Halo! Selamat datang di ${tenantName} ✨ Ada yang bisa kami bantu seputar produk kami?`,
          system_prompt: `Anda adalah AI Assistant untuk ${tenantName}. Jawab ramah seputar produk ${product.name || ''}.`,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching tenant';
    console.error('[Tenant API Exception]:', err);
    return NextResponse.json({ success: false, error: 'INTERNAL_SERVER_ERROR', message: msg }, { status: 500 });
  }
}
