import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawSlug = body.tenant_slug || body.tenant_id || '';
    const slug = normalizeTenantSlug(rawSlug);

    const selectedPackage = body.package_id || 'topup_100';
    const additionalSessions = Number(
      body.sessions || (selectedPackage === 'topup_250' ? 250 : 100)
    );
    const price = Number(
      body.price || (selectedPackage === 'topup_250' ? 99000 : 49000)
    );

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug wajib diisi' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantName = tenant.name || slug;
    const metadata = tenant.metadata || {};
    const customerPhone = body.customer_phone || metadata.whatsapp_number || metadata.phone;
    const customerEmail = body.customer_email || metadata.email;

    // 1. Coba teruskan ke backend Core FastAPI jika online
    const coreApiUrl = (
      process.env.CORE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      'http://127.0.0.1:8000'
    ).replace(/\/$/, '');

    try {
      const coreRes = await fetch(`${coreApiUrl}/api/v1/billing/topup-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: slug,
          package_id: selectedPackage,
          sessions: additionalSessions,
          price,
          customer_phone: customerPhone,
          customer_email: customerEmail,
        }),
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        return NextResponse.json({
          success: true,
          ...coreData,
        });
      }
    } catch (_coreErr) {
      // Backend core unreachable, fallback to direct Xendit Invoice API
    }

    // 2. Direct Xendit Invoice API Integration (PT BoonTrack Inovasi Digital)
    const xenditKey = (
      process.env.XENDIT_API_KEY ||
      process.env.XENDIT_SECRET_KEY ||
      'xnd_development_2itAoTg8FOAdr8Vk7jKpU0MksgDSAjaWzlLHzEMkPuHcRyf5IUxfvO7MG1KPe'
    ).trim();

    const xenditApiUrl = (process.env.XENDIT_API_URL || 'https://api.xendit.co').replace(/\/$/, '');
    const externalId = `TOPUP-${slug}-${additionalSessions}-${Date.now()}`;
    const productTitle = `Top-Up Kuota Sesi AI (+${additionalSessions} Sesi) - ${tenantName}`;

    const authHeader = `Basic ${Buffer.from(`${xenditKey}:`).toString('base64')}`;
    const appDomain = process.env.NEXT_PUBLIC_APP_URL || 'https://shop.boontrack.com';

    const xenditPayload: Record<string, any> = {
      external_id: externalId,
      amount: price,
      description: productTitle,
      invoice_duration: 86400,
      currency: 'IDR',
      success_redirect_url: `${appDomain}/${slug}/dashboard?topup=success`,
      failure_redirect_url: `${appDomain}/${slug}/dashboard?topup=cancelled`,
    };

    if (customerPhone) {
      const p = String(customerPhone).trim();
      xenditPayload.customer = { mobile_number: p.startsWith('+') ? p : `+${p}` };
    }
    if (customerEmail) {
      xenditPayload.payer_email = customerEmail;
    }

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
      sessions: additionalSessions,
      amount: price,
      package_id: selectedPackage,
      tenant_slug: slug,
      message: `Invoice Xendit untuk +${additionalSessions} sesi AI berhasil diterbitkan.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error processing billing topup';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
