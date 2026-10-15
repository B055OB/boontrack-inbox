import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

type ProductRecord = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  let slug = '';

  try {
    const { slug: rawSlug } = await params;
    slug = normalizeTenantSlug(rawSlug || '');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant slug wajib diisi', tenant: null },
        { status: 400 }
      );
    }

    // The database is the source of truth. Never turn a failed or invisible
    // database lookup into a synthetic/default tenant response.
    let tenantRow: Record<string, unknown> | null = null;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (error) {
        console.error('[Tenant API] Database lookup failed', {
          slug,
          code: error.code || '',
        });
        return NextResponse.json(
          { success: false, error: 'Tenant data is temporarily unavailable', tenant: null },
          { status: 503 }
        );
      }

      tenantRow = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    } catch (dbErr) {
      console.error('[Tenant API] Database lookup threw an exception', {
        slug,
        error: dbErr instanceof Error ? dbErr.message : 'unknown error',
      });
      return NextResponse.json(
        { success: false, error: 'Tenant data is temporarily unavailable', tenant: null },
        { status: 503 }
      );
    }

    // A missing row can mean the tenant does not exist or is not visible under
    // the current database policy. Do not disclose which; most importantly,
    // do not return a successful fabricated tenant.
    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found or unavailable', tenant: null },
        { status: 404 }
      );
    }

    const metadata = asRecord(tenantRow.metadata);
    const product = asRecord(metadata.product);
    const productCandidates = Array.isArray(metadata.products)
      ? metadata.products
      : Object.keys(product).length > 0
        ? [product]
        : [];
    const productsList = productCandidates.filter(
      (candidate): candidate is ProductRecord =>
        candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)
    );

    const category = asString(tenantRow.category);
    const tenantName = asString(tenantRow.name);
    const packages = productsList.map((prod, idx) => {
      const isProdDigital =
        asString(prod.type).toLowerCase() === 'digital' ||
        asString(prod.product_type).toLowerCase() === 'digital' ||
        asString(prod.category).toLowerCase().includes('digital') ||
        category.toLowerCase().includes('digital');

      const details = [
        prod.variants ? `Varian: ${asString(prod.variants)}` : '',
        prod.promo ? `Promo: ${asString(prod.promo)}` : '',
        isProdDigital ? 'Format Digital' : 'Barang Fisik',
      ].filter(Boolean);

      return {
        id: asString(prod.id, `${slug}-prod-${idx}`) || `${slug}-prod-${idx}`,
        name: asString(prod.name),
        price: Math.max(0, asFiniteNumber(prod.price)),
        description: details.join(' • ') || 'Produk Unggulan',
      };
    });

    const rawTier = asString(
      tenantRow.tier || metadata.tier || metadata.plan_tier,
      'SOLO_TRIAL'
    );
    const isTrial = rawTier.toLowerCase().includes('trial') || rawTier.toUpperCase() === 'SOLO_TRIAL';

    let trialEndsAt = '';
    let daysLeft = 0;
    let isExpired = false;

    if (isTrial) {
      const storedTrialEnd = tenantRow.trial_ends_at || metadata.trial_ends_at;
      const storedTrialEndDate = storedTrialEnd ? new Date(String(storedTrialEnd)) : null;
      const createdAtDate = tenantRow.created_at ? new Date(String(tenantRow.created_at)) : null;
      const validStoredDate = storedTrialEndDate && Number.isFinite(storedTrialEndDate.getTime());
      const validCreatedDate = createdAtDate && Number.isFinite(createdAtDate.getTime());
      const trialEndDate = validStoredDate
        ? storedTrialEndDate
        : validCreatedDate
          ? new Date(createdAtDate.getTime() + 7 * 86400000)
          : null;

      if (trialEndDate) {
        trialEndsAt = trialEndDate.toISOString();
        daysLeft = Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86400000));
      }
      isExpired = daysLeft <= 0;
    }

    return NextResponse.json({
      success: true,
      tenant: {
        slug: asString(tenantRow.slug, slug) || slug,
        name: tenantName,
        category,
        tier: rawTier,
        is_trial: isTrial,
        trial_ends_at: trialEndsAt,
        days_left: daysLeft,
        is_expired: isExpired,
        metadata,
        packages,
        persona: {
          ai_name: tenantName ? `${tenantName} AI` : 'AI Assistant',
          greeting_message: tenantName
            ? `Halo! Selamat datang di ${tenantName} ✨ Ada yang bisa kami bantu seputar produk kami?`
            : '',
          system_prompt: tenantName
            ? `Anda adalah AI Assistant untuk ${tenantName}. Jawab ramah seputar produk ${asString(product.name)}.`
            : '',
        },
      },
    });
  } catch (err: unknown) {
    console.error('[Tenant API] Unexpected error', {
      slug,
      error: err instanceof Error ? err.message : 'unknown error',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error', tenant: null },
      { status: 500 }
    );
  }
}
