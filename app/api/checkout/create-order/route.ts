/**
 * POST /api/checkout/create-order
 *
 * Server-side proxy untuk createOrderAndInvoice.
 * Menggunakan SUPABASE_SERVICE_ROLE_KEY (server-only, tidak pernah exposed ke browser).
 * Ini memastikan checkout tidak pernah gagal karena NEXT_PUBLIC_SUPABASE_ANON_KEY
 * tidak tersedia atau tidak ter-inject di environment browser/Vercel.
 *
 * ARSITEKTUR: Route ini adalah pure gateway — tidak ada business logic hardcoded.
 * Semua validasi dan harga diproses oleh checkout-service.ts (server-side).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createOrderAndInvoice } from '@/lib/checkout-service';
import { normalizePhoneToE164 } from '@/lib/phone';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request payload', code: 'INVALID_PAYLOAD' },
        { status: 400 }
      );
    }

    // Validasi field wajib
    const requiredFields = ['tenantSlug', 'productId', 'productTitle', 'customerName', 'customerPhone'];
    const missingFields = requiredFields.filter((f) => !payload[f]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: `Field wajib tidak lengkap: ${missingFields.join(', ')}`,
          code: 'MISSING_REQUIRED_FIELDS',
          missingFields,
        },
        { status: 400 }
      );
    }

    // Wajibkan field email divalidasi dan disimpan (tidak boleh null / format tidak valid)
    const rawEmail = (payload.customerEmail || payload.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      return NextResponse.json(
        {
          error: 'Field email wajib diisi dengan alamat email yang valid dan tidak boleh kosong.',
          code: 'INVALID_CUSTOMER_EMAIL',
          field: 'customerEmail',
        },
        { status: 400 }
      );
    }

    // Normalisasi dan validasi nomor telepon pelanggan ke format baku E.164 (628xxxxxxxxxx)
    const normalizedPhone = normalizePhoneToE164(payload.customerPhone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json(
        {
          error: 'Nomor WhatsApp tidak valid. Masukkan nomor WhatsApp aktif (contoh: 08123456789).',
          code: 'INVALID_PHONE_NUMBER',
        },
        { status: 400 }
      );
    }

    // Tambahkan client IP dari header request (untuk CAPI tracking)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    // GUARDRAIL P0: Bypass Unique Code untuk OnlineBoost / Xendit Dynamic QRIS
    // Paksa unique_code = 0 dan gunakan nominal bulat pas tanpa mutasi 3 digit
    const isOnlineboost = String(payload.tenantSlug || '').trim().toLowerCase() === 'onlineboost';
    const isXenditGateway =
      isOnlineboost ||
      String(payload.paymentMethod || '').trim().toLowerCase().includes('xendit') ||
      Boolean(payload.isGateway || payload.isXendit);

    const enrichedPayload = {
      ...payload,
      customerPhone: normalizedPhone,
      customerEmail: rawEmail,
      ...(isXenditGateway ? { uniqueCode: 0, unique_code: 0 } : {}),
      tracking_context: {
        ...payload.tracking_context,
        client_ip_address: payload.tracking_context?.client_ip_address || clientIp,
        client_user_agent: payload.tracking_context?.client_user_agent || userAgent,
      },
    };

    const result = await createOrderAndInvoice(enrichedPayload);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[POST /api/checkout/create-order] Error:', error);

    // Propagate trial quota error ke client dengan kode spesifik
    if (error?.code === 'TRIAL_LIMIT_EXCEEDED' || error?.isTrial) {
      return NextResponse.json(
        {
          error: error.message || 'Batas kuota trial tercapai.',
          code: error.code || 'TRIAL_LIMIT_EXCEEDED',
          currentUsage: error.currentUsage,
          limit: error.limit,
          isTrial: true,
        },
        { status: 402 }
      );
    }

    return NextResponse.json(
      {
        error: error?.message || 'Terjadi kesalahan saat membuat order.',
        code: error?.code || 'CHECKOUT_ERROR',
      },
      { status: 500 }
    );
  }
}
