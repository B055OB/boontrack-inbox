import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedWorkforceSession } from '@/workforce-web/lib/auth/session';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';

// Authoritative Wholesale Packages Allowlist (USD)
export const DODO_WHOLESALE_ALLOWLIST: Record<number, { priceUsd: number; tier: string; productId?: string }> = {
  25: { priceUsd: 102, tier: 'Starter Fleet (25 Passes)' },
  50: { priceUsd: 190, tier: 'Growth Fleet (50 Passes)' },
  100: { priceUsd: 350, tier: 'Scale Fleet (100 Passes)' },
  250: { priceUsd: 750, tier: 'Enterprise Sovereign (250 Passes)' },
};

export async function POST(req: NextRequest) {
  // 1. Authenticate Request
  const auth = await getAuthenticatedWorkforceSession(req);
  if (!auth.session) {
    return NextResponse.json(
      { success: false, error: auth.error || 'UNAUTHORIZED', message: 'Autentikasi sesi BWM diperlukan.' },
      { status: auth.status || 401 }
    );
  }

  const session = auth.session;
  const tenantId = session.tenantId;

  try {
    const body = await req.json().catch(() => ({}));
    const qty = Number(body.quantity || body.qty || 25);

    // 2. Allowlist Validation
    const pkg = DODO_WHOLESALE_ALLOWLIST[qty];
    if (!pkg) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_PACKAGE_QUANTITY',
          message: `Jumlah pass ${qty} tidak valid. Pilih dari paket resmi: 25, 50, 100, atau 250 passes.`,
        },
        { status: 400 }
      );
    }

    const internalPaymentRef = `bwm_dodo_${session.tenantSlug}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const amountGross = pkg.priceUsd;
    const currency = 'USD';

    // 3. Register Order in Database as INITIATED/PENDING before checkout session
    const supabaseAdmin = getSupabaseAdmin();
    const orderRecord = {
      tenant_id: tenantId,
      internal_order_id: internalPaymentRef,
      provider: 'DODO_PAYMENTS',
      currency: currency,
      expected_amount: amountGross,
      status: 'INITIATED',
      metadata: {
        quantity: qty,
        tier: pkg.tier,
        user_id: session.userId,
        user_name: session.name,
        tenant_slug: session.tenantSlug,
      },
    };

    const { error: insertErr } = await supabaseAdmin
      .schema('workforce_staging')
      .from('workforce_payment_registry')
      .insert(orderRecord);

    if (insertErr && !insertErr.message.includes('relation "workforce_staging.workforce_payment_registry" does not exist')) {
      console.error('[DODO CHECKOUT] Registry insert failed:', insertErr.message);
      return NextResponse.json(
        { success: false, error: 'PAYMENT_REGISTRY_ERROR', message: insertErr.message },
        { status: 500 }
      );
    }

    // 4. Server-Side Dodo Checkout Session Creation (Test Mode)
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    const providerPaymentId = `dodo_test_pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let checkoutUrl = `https://test.dodopayments.com/buy/${providerPaymentId}`;

    if (apiKey && apiKey.startsWith('dodo_')) {
      try {
        const response = await fetch('https://test.dodopayments.com/checkouts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            amount: amountGross * 100, // cents
            currency: 'USD',
            payment_link: true,
            metadata: {
              internal_payment_ref: internalPaymentRef,
              tenant_id: tenantId,
              quantity: qty,
            },
          }),
        });

        if (response.ok) {
          const dodoRes = await response.json();
          if (dodoRes.checkout_url) {
            checkoutUrl = dodoRes.checkout_url;
          }
        }
      } catch (err: any) {
        console.warn('[DODO API] Live test API call warning, using sandbox URL:', err.message);
      }
    }

    // 5. Update Registry to BOUND with provider payment ID
    try {
      await supabaseAdmin
        .schema('workforce_staging')
        .from('workforce_payment_registry')
        .update({
          provider_transaction_id: providerPaymentId,
          status: 'BOUND',
          updated_at: new Date().toISOString(),
        })
        .eq('internal_order_id', internalPaymentRef);
    } catch {
      // Ignored if table not yet present in test mode
    }

    return NextResponse.json(
      {
        success: true,
        checkout_url: checkoutUrl,
        internal_payment_ref: internalPaymentRef,
        amount_usd: amountGross,
        quantity: qty,
        tier: pkg.tier,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'CHECKOUT_INITIALIZATION_ERROR', message: err.message },
      { status: 500 }
    );
  }
}
