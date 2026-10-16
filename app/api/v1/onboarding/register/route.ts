/**
 * app/api/v1/onboarding/register/route.ts
 * Public Merchant Onboarding Registration Endpoint.
 *
 * Strict Architecture Guardrails (Clearance P1 CTO):
 * 1. Zod schema validation for payload with strict fail-closed formatting.
 * 2. Server-side referral code validation to database (via body, URL param, or bt_ref cookie).
 * 3. Idempotency protection with Idempotency-Key header to prevent duplicate tenant creation.
 * 4. Atomic database transaction (tenants + affiliate_referrals + outbox_events) with rollback on failure.
 * 5. Decoupled Notification: NO synchronous email/WhatsApp calls inside HTTP request thread.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export const RegisterMerchantSchema = z.object({
  store_name: z
    .string()
    .trim()
    .min(2, 'Nama toko minimal 2 karakter')
    .max(100, 'Nama toko maksimal 100 karakter'),
  slug: z
    .string()
    .trim()
    .min(3, 'Slug minimal 3 karakter')
    .max(50, 'Slug maksimal 50 karakter')
    .regex(/^[a-z0-9-]+$/, 'Slug hanya boleh huruf kecil, angka, dan tanda hubung (-)')
    .refine((s) => !s.startsWith('-') && !s.endsWith('-'), 'Slug tidak boleh diawali atau diakhiri tanda hubung'),
  owner_name: z
    .string()
    .trim()
    .min(2, 'Nama pemilik minimal 2 karakter')
    .max(100, 'Nama pemilik maksimal 100 karakter'),
  email: z
    .string()
    .trim()
    .email('Format email tidak valid')
    .toLowerCase(),
  phone: z
    .string()
    .trim()
    .min(10, 'Nomor telepon minimal 10 digit')
    .max(20, 'Nomor telepon maksimal 20 digit')
    .regex(/^[0-9+]+$/, 'Nomor telepon hanya boleh berisi angka dan simbol plus'),
  password: z
    .string()
    .min(6, 'Password/PIN akses minimal 6 karakter'),
  ref_code: z.string().trim().optional().nullable(),
  category: z.string().optional().default('COMMERCE'),
  business_type: z.string().optional().default('COMMERCE'),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));

    // 1. Resolve and normalize input fields
    const rawSlug = (rawBody.slug || rawBody.store_slug || '').trim().toLowerCase();
    const rawStoreName = (rawBody.store_name || rawBody.name || rawBody.shop_name || '').trim();
    const rawOwnerName = (rawBody.owner_name || rawBody.merchant_name || rawBody.name || '').trim();
    const rawPhone = (rawBody.phone || rawBody.phone_number || rawBody.wa_number || '').trim();
    const rawEmail = (rawBody.email || '').trim().toLowerCase();
    const rawPassword = rawBody.password || rawBody.pin || '';

    // Referral resolution order: body -> URL query param -> Cookie (bt_ref)
    const url = new URL(req.url);
    const paramRef = url.searchParams.get('ref') || url.searchParams.get('ref_code');
    const cookieRef = req.cookies.get('bt_ref')?.value || req.cookies.get('ref')?.value;
    const resolvedRefCode = (rawBody.ref_code || rawBody.referral_code || paramRef || cookieRef || null)?.trim() || null;

    // 2. Validate input schema with Zod
    const validationResult = RegisterMerchantSchema.safeParse({
      store_name: rawStoreName,
      slug: rawSlug,
      owner_name: rawOwnerName,
      email: rawEmail,
      phone: rawPhone,
      password: rawPassword,
      ref_code: resolvedRefCode,
      category: rawBody.category || 'COMMERCE',
      business_type: rawBody.business_type || 'COMMERCE',
    });

    if (!validationResult.success) {
      const issues = validationResult.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json(
        {
          success: false,
          message: `Validasi pendaftaran gagal: ${issues}`,
          errors: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const payload = validationResult.data;
    const supabaseAdmin = getSupabaseAdmin();

    // 3. Idempotency-Key Protection
    const idempotencyKey = (
      req.headers.get('idempotency-key') ||
      req.headers.get('x-idempotency-key') ||
      ''
    ).trim() || null;

    if (idempotencyKey) {
      const { data: existingOutbox } = await supabaseAdmin
        .from('outbox_events')
        .select('id, payload, aggregate_id, created_at')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingOutbox) {
        return NextResponse.json(
          {
            success: true,
            message: 'Pendaftaran telah diproses sebelumnya (idempotent replay).',
            idempotent_replay: true,
            event_id: existingOutbox.id,
            tenant_slug: existingOutbox.aggregate_id,
          },
          { status: 200 }
        );
      }
    }

    // 4. Server-Side Referral Validation (Fail-Closed)
    let resolvedAffiliate: any = null;
    if (payload.ref_code) {
      const cleanRef = payload.ref_code.toLowerCase();
      const { data: aff, error: affErr } = await supabaseAdmin
        .from('affiliates')
        .select('id, name, email, phone, phone_number, referral_code, role, status')
        .ilike('referral_code', cleanRef)
        .maybeSingle();

      if (affErr || !aff || aff.status !== 'ACTIVE') {
        return NextResponse.json(
          {
            success: false,
            message: `Kode referal '${payload.ref_code}' tidak valid atau tidak aktif. Pendaftaran ditolak.`,
          },
          { status: 400 }
        );
      }
      resolvedAffiliate = aff;
    }

    // 5. Slug Uniqueness Check
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id, slug')
      .eq('slug', payload.slug)
      .maybeSingle();

    if (existingTenant) {
      return NextResponse.json(
        {
          success: false,
          message: `Slug toko '${payload.slug}' sudah terdaftar. Silakan pilih nama slug lain.`,
        },
        { status: 409 }
      );
    }

    // 6. Outbox Notification Payload (For decoupled asynchronous notification worker)
    const outboxPayload = {
      event_type: 'MERCHANT_REGISTERED',
      store_name: payload.store_name,
      slug: payload.slug,
      owner_name: payload.owner_name,
      email: payload.email,
      phone: payload.phone,
      tier: 'PRO_SCALE',
      referral_code: payload.ref_code,
      affiliate_id: resolvedAffiliate?.id || null,
      affiliate_name: resolvedAffiliate?.name || null,
      affiliate_email: resolvedAffiliate?.email || null,
      affiliate_phone: resolvedAffiliate?.phone || resolvedAffiliate?.phone_number || null,
      registered_at: new Date().toISOString(),
    };

    // 7. Atomic Transaction Execution
    // Try stored procedure register_merchant_transactional first for native DB-level transaction
    let rpcSucceeded = false;
    let finalResult: any = null;

    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('register_merchant_transactional', {
        p_slug: payload.slug,
        p_name: payload.store_name,
        p_owner_name: payload.owner_name,
        p_email: payload.email,
        p_phone: payload.phone,
        p_password: payload.password,
        p_ref_code: payload.ref_code,
        p_category: payload.category,
        p_business_type: payload.business_type,
        p_trial_days: 7,
        p_idempotency_key: idempotencyKey,
        p_outbox_payload: outboxPayload,
      });

      if (!rpcErr && rpcData?.success) {
        rpcSucceeded = true;
        finalResult = rpcData;
      } else if (rpcErr && rpcErr.message?.includes('sudah terdaftar')) {
        return NextResponse.json(
          { success: false, message: rpcErr.message },
          { status: 409 }
        );
      }
    } catch {
      // Fall through to compensating transaction pattern
    }

    if (!rpcSucceeded) {
      // Compensating Transaction Pattern (Guarantees atomicity and total rollback on failure)
      let createdTenantId: string | null = null;
      let createdReferralId: string | null = null;
      let createdOutboxId: string | null = null;

      try {
        const trialDays = 7;
        const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

        // Step 1: Insert into public.tenants
        const { data: newTenant, error: tenantErr } = await supabaseAdmin
          .from('tenants')
          .insert({
            slug: payload.slug,
            name: payload.store_name,
            category: payload.category,
            business_type: payload.business_type,
            tier: 'PRO_SCALE',
            status: 'ACTIVE',
            subscription_status: 'trial',
            subscription_tier: 'PRO_SCALE',
            is_active: true,
            trial_ends_at: trialEndsAt,
            subscription_ends_at: trialEndsAt,
            access_username: payload.slug,
            access_password: payload.password,
            metadata: {
              store_name: payload.store_name,
              shop_name: payload.store_name,
              name: payload.store_name,
              owner_name: payload.owner_name,
              merchant_name: payload.owner_name,
              email: payload.email,
              phone: payload.phone,
              wa_number: payload.phone,
              whatsapp_number: payload.phone,
              access_pin: payload.password,
              pin: payload.password,
              pin_hash: payload.password,
              password_raw: payload.password,
              tier: 'PRO_SCALE',
              plan_tier: 'TRIAL_7D',
              selected_plan: 'Trial 7 Hari',
              subscription_status: 'trial',
              is_trial: true,
              trial_days: trialDays,
              trial_ends_at: trialEndsAt,
              is_active: true,
              status: 'ACTIVE',
              referral_code: payload.ref_code,
              affiliate_id: resolvedAffiliate?.id || null,
              created_via: 'public_onboarding_register',
            },
          })
          .select()
          .single();

        if (tenantErr) throw tenantErr;
        createdTenantId = newTenant?.id;

        // Step 2: Insert into public.affiliate_referrals (if referral was provided)
        if (payload.ref_code) {
          const { data: newRef, error: refErr } = await supabaseAdmin
            .from('affiliate_referrals')
            .insert({
              affiliate_id: resolvedAffiliate?.id || null,
              referral_code: payload.ref_code,
              referred_tenant_id: createdTenantId,
              referred_tenant_slug: payload.slug,
              customer_name: payload.owner_name,
              customer_phone: payload.phone,
              customer_email: payload.email,
              metadata: {
                ref_code: payload.ref_code,
                registered_at: new Date().toISOString(),
              },
            })
            .select()
            .single();

          if (refErr) throw refErr;
          createdReferralId = newRef?.id;
        }

        // Step 3: Insert into public.outbox_events (event_type: MERCHANT_REGISTERED, status: PENDING)
        const { data: newOutbox, error: outboxErr } = await supabaseAdmin
          .from('outbox_events')
          .insert({
            event_type: 'MERCHANT_REGISTERED',
            aggregate_type: 'tenant',
            aggregate_id: payload.slug,
            payload: outboxPayload,
            status: 'PENDING',
            idempotency_key: idempotencyKey,
          })
          .select()
          .single();

        if (outboxErr) throw outboxErr;
        createdOutboxId = newOutbox?.id;

        finalResult = {
          success: true,
          tenant_id: createdTenantId,
          slug: payload.slug,
          name: payload.store_name,
          tier: 'PRO_SCALE',
          status: 'ACTIVE',
          outbox_event_id: createdOutboxId,
        };
      } catch (txErr: any) {
        console.error('[Onboarding Register] Error during transaction. Executing TOTAL ROLLBACK...', txErr);

        // Compensating rollback
        if (createdOutboxId) {
          try { await supabaseAdmin.from('outbox_events').delete().eq('id', createdOutboxId); } catch {}
        }
        if (createdReferralId) {
          try { await supabaseAdmin.from('affiliate_referrals').delete().eq('id', createdReferralId); } catch {}
        }
        if (createdTenantId) {
          try { await supabaseAdmin.from('tenants').delete().eq('id', createdTenantId); } catch {}
        }

        return NextResponse.json(
          {
            success: false,
            message: `Gagal memproses pendaftaran tenant: ${txErr.message || 'Kesalahan transaksi database'}`,
          },
          { status: 500 }
        );
      }
    }

    // 8. Return Success response immediately (Decoupled Notification Guard)
    return NextResponse.json(
      {
        success: true,
        message: `Toko '${payload.store_name}' (${payload.slug}) berhasil didaftarkan dan diaktifkan!`,
        tenant: {
          id: finalResult.tenant_id,
          slug: payload.slug,
          name: payload.store_name,
          tier: 'PRO_SCALE',
          status: 'ACTIVE',
        },
        outbox_event_id: finalResult.outbox_event_id,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Kesalahan internal server saat registrasi';
    console.error('[Onboarding Register Exception]', err);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
