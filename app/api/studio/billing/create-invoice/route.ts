import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { getStudioTokenPackage } from '@/lib/config/studio-pricing';

/**
 * POST /api/studio/billing/create-invoice
 * Menerbitkan Invoice resmi Xendit (QRIS, VA, E-Wallet) untuk pembelian Token Render Studio.
 * 
 * STRICT ARCHITECTURE GUARDRAILS:
 * 1. Zero Hardcoding: Mengambil harga dan kredit dari SSOT `lib/config/studio-pricing.ts`.
 * 2. Database SSOT: Memvalidasi tenant langsung dari tabel `tenants` di Supabase.
 * 3. Format external_id: `TOPUP-STUDIO-{tenantSlug}-{credits}-{timestamp}` agar langsung dikenali oleh Webhook.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const {
      packageId,
      customerName,
      customerPhone,
      customerEmail,
    } = body;

    // 1. Validasi Paket Harga dari SSOT
    const pkg = getStudioTokenPackage(packageId);
    if (!pkg) {
      return NextResponse.json(
        {
          success: false,
          error: `Paket token '${packageId}' tidak valid. Pilihan tersedia: starter, creator, pro_monthly.`,
        },
        { status: 400 }
      );
    }

    // 2. Resolusi Tenant Slug dari body / cookie
    const cookieSlug =
      req.cookies.get('bt_tenant')?.value ||
      req.cookies.get('merchant_store')?.value ||
      req.cookies.get('merchant_session')?.value;

    const rawSlug = String(body.tenantSlug || cookieSlug || '').trim().toLowerCase();
    if (!rawSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenantSlug wajib disertakan.' },
        { status: 400 }
      );
    }

    // 3. Verifikasi Tenant di Supabase
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Koneksi database tidak tersedia.' },
        { status: 503 }
      );
    }

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', rawSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { success: false, error: `Tenant dengan slug '${rawSlug}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const tenantMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};

    // 4. Resolusi Affiliate Referral Code (Cross-domain cookie / metadata)
    const referralCookie = req.cookies.get('bt_ref')?.value || req.cookies.get('boontrack_referral')?.value;
    const affiliateCode =
      body.affiliateCode ||
      referralCookie ||
      tenantMeta.affiliate_code ||
      tenantMeta.referral_code ||
      null;

    // 5. Format external_id dan Informasi Invoice
    const externalId = `TOPUP-STUDIO-${tenant.slug}-${pkg.credits}-${Date.now()}`;
    const invoiceDescription = `Top-Up ${pkg.credits} Token Render Studio - ${pkg.name} (${tenant.name || tenant.slug})`;

    const appDomain =
      process.env.NEXT_PUBLIC_STUDIO_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://studio.boontrack.com';

    const xenditKey = (process.env.XENDIT_SECRET_KEY || process.env.XENDIT_API_KEY || '').trim();
    if (!xenditKey) {
      console.error('[Studio Billing] Payment gateway configuration is missing on server: XENDIT_SECRET_KEY or XENDIT_API_KEY is not configured.');
      return NextResponse.json(
        { error: 'Payment gateway configuration is missing on server' },
        { status: 500 }
      );
    }

    const xenditApiUrl = (process.env.XENDIT_API_URL || 'https://api.xendit.co').replace(/\/$/, '');
    const authHeader = `Basic ${Buffer.from(`${xenditKey}:`).toString('base64')}`;

    const effectivePhone = customerPhone || tenantMeta.whatsapp || '';
    const effectiveEmail = customerEmail || tenantMeta.email || '';
    const effectiveName = customerName || tenant.name || 'Studio Creator';

    const xenditPayload: Record<string, any> = {
      external_id: externalId,
      amount: pkg.price,
      description: invoiceDescription,
      invoice_duration: 86400, // 24 jam
      currency: 'IDR',
      success_redirect_url: `${appDomain}/studio/desk?topup=success&package=${pkg.id}`,
      failure_redirect_url: `${appDomain}/studio/desk?topup=cancelled`,
      items: [
        {
          name: pkg.name,
          quantity: 1,
          price: pkg.price,
          category: 'STUDIO_TOKEN',
        },
      ],
      metadata: {
        tenant_slug: tenant.slug,
        tenant_id: tenant.id,
        credits: pkg.credits,
        package_id: pkg.id,
        affiliate_code: affiliateCode,
        product_type: 'STUDIO',
      },
    };

    if (effectivePhone) {
      const cleanPhone = String(effectivePhone).replace(/[^0-9]/g, '');
      const formattedPhone = cleanPhone.startsWith('62')
        ? `+${cleanPhone}`
        : cleanPhone.startsWith('0')
        ? `+62${cleanPhone.slice(1)}`
        : `+${cleanPhone}`;

      xenditPayload.customer = {
        given_names: effectiveName,
        mobile_number: formattedPhone,
        ...(effectiveEmail ? { email: effectiveEmail } : {}),
      };
    } else if (effectiveEmail) {
      xenditPayload.payer_email = effectiveEmail;
    }

    // 6. Request ke Xendit Invoice API
    const xenditRes = await fetch(`${xenditApiUrl}/v2/invoices`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(xenditPayload),
    });

    if (!xenditRes.ok) {
      const errText = await xenditRes.text();
      console.error('[Studio Billing] Xendit Invoice Error:', errText);
      return NextResponse.json(
        { success: false, error: `Gagal menerbitkan invoice Xendit: ${errText}` },
        { status: 502 }
      );
    }

    const invoiceData = await xenditRes.json();
    const invoiceUrl = invoiceData.invoice_url || invoiceData.web_pay_url;

    return NextResponse.json({
      success: true,
      invoice_id: invoiceData.id,
      invoice_url: invoiceUrl,
      external_id: externalId,
      credits: pkg.credits,
      amount: pkg.price,
      package_id: pkg.id,
      tenant_slug: tenant.slug,
      message: `Invoice Xendit untuk +${pkg.credits} Token Render Studio berhasil diterbitkan.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Studio Billing] Exception in create-invoice:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
