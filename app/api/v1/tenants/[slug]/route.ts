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
        const isDigital = product.type === 'digital' || tenantRow.category === 'digital';

        const packages = [];
        if (product.name) {
          packages.push({
            id: `${slug}-main`,
            name: product.name,
            price: Number(product.price || 0),
            description:
              [
                product.variants ? `Varian: ${product.variants}` : '',
                product.promo ? `Promo: ${product.promo}` : '',
                isDigital ? 'Format Digital' : 'Barang Fisik',
              ]
                .filter(Boolean)
                .join(' • ') || 'Produk Unggulan',
          });

          if (product.promo) {
            packages.push({
              id: `${slug}-bundle`,
              name: `Paket Bundling: ${product.name}`,
              price: Math.round(Number(product.price || 0) * 1.8),
              description: product.promo,
            });
          }
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
