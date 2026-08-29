import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { DEFAULT_TENANT_CONFIGS, normalizeTenantSlug } from '@/lib/tenant-config';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // 1. Query Supabase tenants table
    try {
      const supabase = getSupabase();
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (tenantRow) {
        const metadata = tenantRow.metadata || {};
        const product = metadata.product || {};

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
            const isProdDigital = prod.type === 'digital' || tenantRow.category === 'digital';
            packages.push({
              id: prod.id || `${slug}-prod-${idx}`,
              name: prod.name,
              price: Number(prod.price || 0),
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

        return NextResponse.json({
          success: true,
          tenant: {
            slug,
            name: tenantRow.name,
            category: tenantRow.category,
            metadata,
            packages:
              packages.length > 0
                ? packages
                : [
                    {
                      id: `${slug}-default`,
                      name: `${tenantRow.name} Paket Utama`,
                      price: Number(product.price || 50000),
                      description: 'Paket / Layanan Resmi',
                    },
                  ],
            persona: {
              ai_name: `${tenantRow.name} AI`,
              greeting_message: `Halo! Selamat datang di ${tenantRow.name} ✨ Ada yang bisa kami bantu seputar produk kami?`,
              system_prompt: `Anda adalah AI Assistant untuk ${tenantRow.name}. Jawab ramah seputar produk ${product.name || ''}.`,
            },
          },
        });
      }
    } catch (dbErr) {
      console.warn('Supabase tenant fetch skipped/error:', dbErr);
    }

    // 2. Query DEFAULT_TENANT_CONFIGS
    const defCfg = DEFAULT_TENANT_CONFIGS[slug];
    if (defCfg) {
      return NextResponse.json({
        success: true,
        tenant: {
          slug: defCfg.slug,
          name: defCfg.name,
          category: defCfg.category,
          metadata: {
            wa_number: defCfg.health.wa_gateway,
          },
          packages: defCfg.pricing.custom_packages,
          persona: defCfg.persona,
        },
      });
    }

    // 3. Fallback for dynamic arbitrary slug
    const cleanTitle = slug
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return NextResponse.json({
      success: true,
      tenant: {
        slug,
        name: cleanTitle,
        category: 'retail',
        metadata: {},
        packages: [
          {
            id: `${slug}-default`,
            name: `Produk Unggulan ${cleanTitle}`,
            price: 50000,
            description: 'Produk & Layanan Resmi Toko',
          },
        ],
        persona: {
          ai_name: `${cleanTitle} Assistant`,
          greeting_message: `Halo! Selamat datang di ${cleanTitle}. Ada yang bisa kami bantu?`,
          system_prompt: `Anda adalah asisten AI resmi untuk ${cleanTitle}.`,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching tenant';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
