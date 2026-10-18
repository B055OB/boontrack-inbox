import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/creators/[handle]/reseller-applications
 * Mengambil daftar produk tenant yang membuka program reseller/komisi,
 * status kemitraan kreator saat ini (NONE / PENDING / APPROVED / REJECTED / REVOKED),
 * serta metrik dompet ringkas (Saldo Siap Tarik, Total Produk Terjual).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await context.params;
    const cleanHandle = (handle || '').replace(/^@+/, '').trim().toLowerCase();

    if (!cleanHandle) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Handle creator wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Creator Profile
    const baseHandle = cleanHandle.replace(/_+$/, '');
    const { data: creator, error: creatorErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, tenant_id, handle, display_name, avatar_url, bio, links')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creatorErr || !creator) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_NOT_FOUND', message: 'Profil kreator tidak ditemukan.' },
        { status: 404 }
      );
    }

    const creatorTenantId = creator.tenant_id;

    // 2. Resolve Creator Wallet Metrics (Saldo Siap Tarik & Total Terjual)
    let balanceReady = 0;
    let productsSold = 0;
    let totalEarned = 0;

    try {
      // Find reseller ID in store_resellers corresponding to this handle
      const { data: storeResellers } = await supabaseAdmin
        .from('store_resellers')
        .select('id')
        .eq('code', cleanHandle);

      const resellerIds = (storeResellers || []).map((sr: any) => sr.id);

      if (resellerIds.length > 0) {
        const { data: comms } = await supabaseAdmin
          .from('reseller_commissions')
          .select('commission_amount, status')
          .in('reseller_id', resellerIds);

        if (comms && comms.length > 0) {
          comms.forEach((c: any) => {
            const amt = Number(c.commission_amount || 0);
            if (c.status === 'APPROVED') {
              balanceReady += amt;
              productsSold += 1;
            } else if (c.status === 'PAID') {
              totalEarned += amt;
              productsSold += 1;
            }
          });
        }
      }
    } catch (wErr) {
      console.warn('[Creator Reseller Applications] Wallet metrics note:', wErr);
    }

    // 3. Fetch Existing Partnerships for this Creator
    const { data: partnerships } = await supabaseAdmin
      .from('reseller_partnerships')
      .select('*')
      .or(`creator_handle.eq.${cleanHandle}${creatorTenantId ? `,creator_id.eq.${creatorTenantId}` : ''}`);

    const partnershipMap = new Map<string, any>();
    (partnerships || []).forEach((p: any) => {
      partnershipMap.set(p.product_id, p);
    });

    // 4. Fetch Active Merchant Tenants and their Products
    // Exclude the creator's own tenant so creator doesn't resell their own products
    let productQuery = supabaseAdmin
      .from('products')
      .select('id, tenant_id, title, name, slug, price, promo_price, image_url, image, description, is_available, category, fulfillment_metadata')
      .eq('is_available', true);

    if (creatorTenantId) {
      productQuery = productQuery.neq('tenant_id', creatorTenantId);
    }

    const { data: allProducts, error: prodErr } = await productQuery
      .order('created_at', { ascending: false })
      .limit(50);

    if (prodErr) {
      console.error('[Creator Reseller Applications] Products query error:', prodErr);
      return NextResponse.json(
        { success: false, error: prodErr.code, message: prodErr.message },
        { status: 500 }
      );
    }

    // 5. Enrich with Tenant Info
    const tenantIds = Array.from(new Set((allProducts || []).map((p: any) => p.tenant_id).filter(Boolean)));
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, custom_domain, metadata')
      .in('id', tenantIds);

    const tenantMap = new Map<string, any>();
    (tenants || []).forEach((t: any) => {
      tenantMap.set(t.id, t);
    });

    // Also get tenant reseller settings to determine commission rate if not specified on product
    const { data: resellerSettings } = await supabaseAdmin
      .from('shop_reseller_settings')
      .select('*');

    const settingsMap = new Map<string, any>();
    (resellerSettings || []).forEach((s: any) => {
      settingsMap.set(s.tenant_slug, s);
    });

    // 6. Assemble Catalog with Creator's Application Status
    const productsWithStatus = (allProducts || []).map((p: any) => {
      const tenant = tenantMap.get(p.tenant_id);
      const tenantSlug = tenant?.slug || 'toko';
      const tenantName = tenant?.name || tenantSlug;
      const settings = settingsMap.get(tenantSlug);

      const existingPartnership = partnershipMap.get(p.id);
      const partnershipStatus = existingPartnership?.status || 'NONE';

      const rawPrice = Number(p.price || 0);
      const promoPrice = p.promo_price ? Number(p.promo_price) : undefined;
      const effectivePrice = promoPrice || rawPrice;

      // Determine commission rate & label
      let commissionType: 'FIXED' | 'PERCENTAGE' = 'FIXED';
      let commissionAmount = 0;

      if (existingPartnership) {
        commissionType = existingPartnership.commission_type;
        commissionAmount = Number(existingPartnership.commission_amount || 0);
      } else if (p.fulfillment_metadata?.reseller_commission_amount) {
        commissionType = 'FIXED';
        commissionAmount = Number(p.fulfillment_metadata.reseller_commission_amount);
      } else if (p.fulfillment_metadata?.commission_percentage) {
        commissionType = 'PERCENTAGE';
        commissionAmount = Number(p.fulfillment_metadata.commission_percentage);
      } else if (settings?.default_commission_value) {
        commissionType = (settings.commission_type as any) || 'FIXED';
        commissionAmount = Number(settings.default_commission_value);
      } else {
        // Default standard 10% commission
        commissionType = 'PERCENTAGE';
        commissionAmount = 10;
      }

      const estimatedNominal = commissionType === 'PERCENTAGE'
        ? Math.round((commissionAmount / 100) * effectivePrice)
        : commissionAmount;

      const commissionLabel = commissionType === 'PERCENTAGE'
        ? `Komisi ${commissionAmount}% (est. Rp ${estimatedNominal.toLocaleString('id-ID')})`
        : `Komisi Rp ${commissionAmount.toLocaleString('id-ID')}`;

      // Referral link when APPROVED
      const customDomain = tenant?.custom_domain || tenant?.metadata?.custom_domain;
      const baseStoreUrl = customDomain
        ? `https://${String(customDomain).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
        : `https://shop.boontrack.com/${tenantSlug}`;
      const referralUrl = `${baseStoreUrl}/p/${p.slug || p.id}?ref=${cleanHandle}`;

      return {
        id: p.id,
        tenant_id: p.tenant_id,
        tenant_slug: tenantSlug,
        tenant_name: tenantName,
        title: p.title || p.name || 'Produk',
        slug: p.slug,
        price: rawPrice,
        promo_price: promoPrice,
        image_url: p.image_url || p.image || '',
        description: p.description || '',
        category: p.category || 'digital',
        commission_type: commissionType,
        commission_amount: commissionAmount,
        estimated_commission_nominal: estimatedNominal,
        commission_label: commissionLabel,
        partnership_status: partnershipStatus,
        partnership_id: existingPartnership?.id || null,
        referral_url: referralUrl,
      };
    });

    return NextResponse.json({
      success: true,
      creator: {
        id: creator.id,
        tenant_id: creator.tenant_id,
        handle: creator.handle,
        display_name: creator.display_name,
        avatar_url: creator.avatar_url,
      },
      wallet: {
        balance_ready: balanceReady,
        products_sold: productsSold,
        total_earned: totalEarned,
      },
      products: productsWithStatus,
    });
  } catch (err: any) {
    console.error('[Creator Reseller Applications GET] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/creators/[handle]/reseller-applications
 * Mengajukan diri menjadi reseller untuk produk tenant tertentu.
 * Mencegah submit duplikat & menolak jika statusnya sudah PENDING atau APPROVED.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await context.params;
    const cleanHandle = (handle || '').replace(/^@+/, '').trim().toLowerCase();

    if (!cleanHandle) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Handle creator wajib disertakan.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const productId = String(body.product_id || '').trim();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'BAD_REQUEST', message: 'Parameter product_id wajib diisi.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Creator Profile
    const baseHandle = cleanHandle.replace(/_+$/, '');
    const { data: creator, error: creatorErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, tenant_id, handle, display_name')
      .or(`handle.eq.${cleanHandle},handle.eq.${baseHandle},handle.eq.${baseHandle}_`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creatorErr || !creator) {
      return NextResponse.json(
        { success: false, error: 'CREATOR_NOT_FOUND', message: 'Profil kreator tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Resolve Target Product & Tenant
    const { data: product, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, tenant_id, title, name, price, promo_price, fulfillment_metadata')
      .eq('id', productId)
      .maybeSingle();

    if (prodErr || !product) {
      return NextResponse.json(
        { success: false, error: 'PRODUCT_NOT_FOUND', message: 'Produk tidak ditemukan.' },
        { status: 404 }
      );
    }

    const targetTenantId = product.tenant_id;
    if (targetTenantId === creator.tenant_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'CANNOT_APPLY_OWN_PRODUCT',
          message: 'Kreator tidak dapat mengajukan diri menjadi reseller untuk produk toko sendiri.',
        },
        { status: 400 }
      );
    }

    // 3. Check Existing Partnership Application
    const { data: existing } = await supabaseAdmin
      .from('reseller_partnerships')
      .select('id, status, commission_type, commission_amount, created_at')
      .eq('tenant_id', targetTenantId)
      .eq('creator_id', creator.tenant_id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'PENDING') {
        return NextResponse.json(
          {
            success: false,
            error: 'ALREADY_PENDING',
            message: 'Permohonan Anda sedang menunggu persetujuan dari pemilik toko.',
          },
          { status: 400 }
        );
      }
      if (existing.status === 'APPROVED') {
        return NextResponse.json(
          {
            success: false,
            error: 'ALREADY_APPROVED',
            message: 'Kemitraan Anda untuk produk ini sudah disetujui.',
          },
          { status: 400 }
        );
      }
    }

    // 4. Calculate Proposed Commission
    let commType = 'FIXED';
    let commAmount = 10000;

    if (product.fulfillment_metadata?.reseller_commission_amount) {
      commType = 'FIXED';
      commAmount = Number(product.fulfillment_metadata.reseller_commission_amount);
    } else if (product.fulfillment_metadata?.commission_percentage) {
      commType = 'PERCENTAGE';
      commAmount = Number(product.fulfillment_metadata.commission_percentage);
    } else {
      // Check tenant shop_reseller_settings
      const { data: tRow } = await supabaseAdmin
        .from('tenants')
        .select('slug')
        .eq('id', targetTenantId)
        .maybeSingle();

      if (tRow?.slug) {
        const { data: rSettings } = await supabaseAdmin
          .from('shop_reseller_settings')
          .select('commission_type, default_commission_value')
          .eq('tenant_slug', tRow.slug)
          .maybeSingle();

        if (rSettings?.default_commission_value) {
          commType = rSettings.commission_type || 'FIXED';
          commAmount = Number(rSettings.default_commission_value);
        }
      }
    }

    const nowIso = new Date().toISOString();

    // 5. Upsert Reseller Partnership (Atomic P0)
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('reseller_partnerships')
      .upsert(
        {
          ...(existing?.id ? { id: existing.id } : {}),
          tenant_id: targetTenantId,
          creator_id: creator.tenant_id,
          creator_handle: cleanHandle,
          product_id: productId,
          status: 'PENDING',
          commission_type: commType,
          commission_amount: commAmount,
          created_at: existing?.created_at || nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'tenant_id,creator_id,product_id' }
      )
      .select();

    if (insertErr || !inserted || inserted.length === 0) {
      console.error('[Creator Reseller Applications POST] Insert error:', insertErr);
      return NextResponse.json(
        {
          success: false,
          error: 'INSERT_FAILED',
          message: insertErr?.message || 'Gagal mengajukan permohonan kemitraan reseller.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Permohonan kemitraan berhasil dikirim ke pemilik toko. Menunggu persetujuan.',
      partnership: inserted[0],
    });
  } catch (err: any) {
    console.error('[Creator Reseller Applications POST] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
