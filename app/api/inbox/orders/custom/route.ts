import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sanitizeOrderPayload } from '@/lib/order-sanitizer';
import { getStorefrontPayUrl } from '@/lib/utils/storefrontUrl';
import {
  extractMerchantSessionToken,
  verifyMerchantSessionToken,
  isInternalMachineAuthorized,
  type MerchantSessionPayload,
} from '@/lib/auth/merchant-session';
import { extractTenantBankAccounts } from '@/lib/bank-accounts';

export const dynamic = 'force-dynamic';

/**
 * Strict Integer Rupiah Nominal Parser & ASPI Standard Enforcement (SEC-P5-03).
 *
 * Rules:
 * 1. Rejects non-finite numbers, NaN, and negative/zero values.
 * 2. Rejects fractional/decimal numbers and strings (e.g. 25000.50, "25000.50", "25000,50").
 * 3. Rejects strings with trailing or non-numeric characters (e.g. "25000abc").
 * 4. Accepts clean whole integers (25000, "25000") or standard thousand-separator integers ("25.000", "25,000").
 */
export function parseStrictRupiahAmount(rawAmount: any): { valid: boolean; amount: number; error?: string } {
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
    return { valid: false, amount: 0, error: 'Nominal transaksi wajib diisi.' };
  }

  let numVal: number;

  if (typeof rawAmount === 'number') {
    if (!Number.isFinite(rawAmount) || Number.isNaN(rawAmount)) {
      return { valid: false, amount: 0, error: 'Nominal harus berupa angka yang valid.' };
    }
    if (rawAmount < 0) {
      return { valid: false, amount: 0, error: 'Nominal tidak boleh bernilai negatif.' };
    }
    if (!Number.isInteger(rawAmount)) {
      return { valid: false, amount: 0, error: 'Nominal tidak boleh mengandung angka pecahan/desimal.' };
    }
    numVal = rawAmount;
  } else if (typeof rawAmount === 'string') {
    let s = rawAmount.trim();
    if (!s || s.toLowerCase() === 'nan' || s.toLowerCase() === 'infinity' || s.toLowerCase() === '-infinity') {
      return { valid: false, amount: 0, error: 'Nominal harus berupa angka yang valid.' };
    }

    // Strip optional currency prefix ("Rp", "IDR", "Rp.")
    s = s.replace(/^(rp\.?|idr)\s*/i, '').trim();

    // Check for negative signs
    if (s.startsWith('-')) {
      return { valid: false, amount: 0, error: 'Nominal tidak boleh bernilai negatif.' };
    }

    // Reject non-numeric characters (e.g. "25000abc", "abc")
    if (/[a-zA-Z]/.test(s)) {
      return { valid: false, amount: 0, error: 'Format nominal tidak valid. Mengandung karakter non-angka.' };
    }

    // Reject decimal strings with 1-2 digits after separator (e.g. "25000.50", "25000,50", "100.5")
    if (/\.\d{1,2}$/.test(s) || /,\d{1,2}$/.test(s)) {
      return { valid: false, amount: 0, error: 'Nominal tidak boleh mengandung angka pecahan/desimal.' };
    }

    // Match pure digits: "25000"
    if (/^\d+$/.test(s)) {
      numVal = parseInt(s, 10);
    }
    // Match Indonesian standard thousands format: "25.000", "1.000.000"
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      numVal = parseInt(s.replace(/\./g, ''), 10);
    }
    // Match English standard thousands format: "25,000", "1,000,000"
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      numVal = parseInt(s.replace(/,/g, ''), 10);
    } else {
      return { valid: false, amount: 0, error: 'Format nominal tidak valid. Masukkan angka bulat tanpa karakter tambahan.' };
    }
  } else {
    return { valid: false, amount: 0, error: 'Tipe data nominal tidak valid.' };
  }

  if (numVal < 0) {
    return { valid: false, amount: 0, error: 'Nominal tidak boleh bernilai negatif.' };
  }

  return { valid: true, amount: numVal };
}

/**
 * INBOX-POS-01 / Patch 2: Dedicated Server Gateway for Custom POS Order Generation
 * Resolves SEC-01 & SEC-03 & CTO Security Remediation Order (SEC-P5-01, SEC-P5-02, SEC-P5-03):
 * 1. SEC-P5-01: Canonical Server-Side Authentication & Authorization via bt_merchant_token HMAC.
 * 2. SEC-P5-02: Authoritative Server Data (Identity, DB Entity Isolation, Server-Side Bank Selection, Server Unique Code).
 * 3. SEC-P5-03: Strict Integer Rupiah Validation (ASPI / BI limits, zero decimals, zero trailing chars).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database admin unavailable' },
        { status: 500 }
      );
    }

    // -------------------------------------------------------------------------
    // 1. SEC-P5-01: Server-Side Authentication (AuthN)
    // -------------------------------------------------------------------------
    let sessionPayload: MerchantSessionPayload | null = null;
    const isMachine = isInternalMachineAuthorized(req);

    if (isMachine) {
      // Machine-to-machine internal authorization
      sessionPayload = {
        tenantSlug: '',
        role: 'OWNER',
        name: 'Internal Machine',
        iat: Date.now(),
        exp: Date.now() + 60000,
        nonce: 'internal_machine',
      };
    } else {
      const token = extractMerchantSessionToken(req);
      if (!token) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Sesi autentikasi diperlukan (bt_merchant_token).' },
          { status: 401 }
        );
      }

      const authRes = verifyMerchantSessionToken(token);
      if (!authRes.valid || !authRes.payload) {
        return NextResponse.json(
          { success: false, error: authRes.error || 'Unauthorized: Token sesi tidak sah atau kedaluwarsa.' },
          { status: 401 }
        );
      }
      sessionPayload = authRes.payload;
    }

    // -------------------------------------------------------------------------
    // 2. SEC-P5-01: Tenant Membership Verification (Zero Trust on Client Tenant)
    // -------------------------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const {
      tenantSlug,
      conversationId,
      customerPhone,
      customerName,
      itemName,
      rawAmount,
      billingType = 'QRIS', // 'QRIS' | 'MANUAL_BANK'
      uniqueCode,
      bankAccountIndex,
      selectedBankIndex,
      isWalkIn = false,
      contactId,
    } = body;

    const sessionTenantSlug = String(sessionPayload.tenantSlug || '').toLowerCase().trim();
    const sessionTenantId = String(sessionPayload.tenantId || '').toLowerCase().trim();

    if (!isMachine && !sessionTenantSlug && !sessionTenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Sesi tidak terikat pada tenant yang valid.' },
        { status: 403 }
      );
    }

    // If client supplied tenantSlug, verify it strictly matches session tenant
    const requestedSlug = String(tenantSlug || '').toLowerCase().trim();
    if (requestedSlug && !isMachine) {
      const matchesSlug = sessionTenantSlug && requestedSlug === sessionTenantSlug;
      const matchesId = sessionTenantId && requestedSlug === sessionTenantId;
      if (!matchesSlug && !matchesId) {
        return NextResponse.json(
          {
            success: false,
            error: `Forbidden: Sesi pengguna ('${sessionTenantSlug || sessionTenantId}') tidak diizinkan mengakses tenant target ('${requestedSlug}').`,
          },
          { status: 403 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 3. SEC-P5-01: Server-Side Role Authorization (AuthZ)
    // -------------------------------------------------------------------------
    const role = String(sessionPayload.role || '').toUpperCase().trim();
    const isOwnerOrAdmin = ['OWNER', 'MERCHANT', 'ADMIN', 'SUPERADMIN'].includes(role);
    const isCs = ['CS', 'OPERATOR'].includes(role);

    if (!isOwnerOrAdmin && !isCs) {
      return NextResponse.json(
        { success: false, error: `Forbidden: Peran '${sessionPayload.role || role}' tidak memiliki wewenang untuk membuat pesanan POS.` },
        { status: 403 }
      );
    }

    if (isCs) {
      // Check explicit POS order-creation permission
      const allowedPerms = ['pos', 'orders', 'create_order', 'create_orders', 'orders:create', 'pos:create', 'pos_orders', 'all', '*'];
      let hasOrderPermission = false;

      const anyPayload = sessionPayload as any;
      if (anyPayload.canCreateOrders === false || anyPayload.can_create_orders === false) {
        hasOrderPermission = false;
      } else if (Array.isArray(anyPayload.permissions)) {
        hasOrderPermission = anyPayload.permissions.some((p: string) => allowedPerms.includes(String(p).toLowerCase().trim()));
      } else if (
        anyPayload.access_level === 'FULL_DASHBOARD' ||
        anyPayload.access_level === 'ALL_ACCESS' ||
        anyPayload.access_level === 'POS'
      ) {
        hasOrderPermission = true;
      } else if (anyPayload.canCreateOrders === true || anyPayload.can_create_orders === true) {
        hasOrderPermission = true;
      } else if (sessionPayload.userId || sessionPayload.phone) {
        // Query database tenant_users for explicit permission
        try {
          let uQuery = supabase.from('tenant_users').select('*');
          if (sessionPayload.userId) {
            uQuery = uQuery.eq('id', sessionPayload.userId);
          } else if (sessionPayload.phone) {
            uQuery = uQuery.eq('phone', sessionPayload.phone);
          }
          const { data: dbUser } = await uQuery.maybeSingle();
          if (dbUser && dbUser.is_active !== false) {
            const dbPerms = dbUser.permissions || dbUser.metadata?.permissions;
            if (
              dbUser.role === 'OWNER_LEAD' ||
              dbUser.access_level === 'FULL_DASHBOARD' ||
              dbUser.can_create_orders === true ||
              dbUser.metadata?.can_create_orders === true ||
              (Array.isArray(dbPerms) && dbPerms.some((p: string) => allowedPerms.includes(String(p).toLowerCase().trim())))
            ) {
              hasOrderPermission = true;
            }
          }
        } catch (_) {}
      }

      if (!hasOrderPermission) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: CS tidak memiliki izin untuk membuat pesanan POS (Order creation permission required).' },
          { status: 403 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 4. Resolve Authoritative Tenant Record from Database
    // -------------------------------------------------------------------------
    const effectiveTenantKey = !isMachine ? (sessionTenantSlug || sessionTenantId) : requestedSlug;
    if (!effectiveTenantKey) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant slug / tenant ID wajib diisi.' },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectiveTenantKey);
    let tQuery = supabase.from('tenants').select('id, slug, name, tier, metadata');
    if (isUuid) {
      tQuery = tQuery.or(`id.eq.${effectiveTenantKey},slug.eq.${effectiveTenantKey}`);
    } else {
      tQuery = tQuery.or(`slug.eq.${effectiveTenantKey},id.eq.${effectiveTenantKey}`);
    }

    const { data: tenant, error: tenantErr } = await tQuery.maybeSingle();
    if (!tenant || tenantErr) {
      return NextResponse.json(
        { success: false, error: 'Toko/Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    // -------------------------------------------------------------------------
    // 5. SEC-P5-02: Authoritative Server Data & Cross-Tenant Entity Checks
    // -------------------------------------------------------------------------
    // Strict CS user identity resolved exclusively from authenticated session (ignore forged client values)
    const authoritativeCsUserId = sessionPayload.userId || null;
    const authoritativeCsUserName = sessionPayload.name || (sessionPayload.role === 'CS' ? 'CS Officer' : 'Store Admin');

    // Conversation ID validation & cross-tenant isolation
    if (conversationId) {
      const cleanConvId = String(conversationId).trim();
      const { data: convData, error: convErr } = await supabase
        .from('conversations')
        .select('id, tenant_id, tenant_slug')
        .eq('id', cleanConvId)
        .maybeSingle();

      if (convErr || !convData) {
        return NextResponse.json(
          { success: false, error: 'Conversation tidak ditemukan.' },
          { status: 404 }
        );
      }

      const convTenantId = String(convData.tenant_id || '').toLowerCase().trim();
      const convTenantSlug = String(convData.tenant_slug || '').toLowerCase().trim();
      const targetTenantId = tenant.id.toLowerCase().trim();
      const targetTenantSlug = tenant.slug.toLowerCase().trim();

      if (
        convTenantId !== targetTenantId &&
        convTenantSlug !== targetTenantSlug &&
        convTenantId !== targetTenantSlug
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Conversation tidak terdaftar pada tenant ini.' },
          { status: 403 }
        );
      }
    }

    // Contact ID validation & cross-tenant isolation
    if (contactId) {
      const cleanContactId = String(contactId).trim();
      const { data: contactData, error: contactErr } = await supabase
        .from('contacts')
        .select('id, tenant_id')
        .eq('id', cleanContactId)
        .maybeSingle();

      if (contactErr || !contactData) {
        return NextResponse.json(
          { success: false, error: 'Kontak tidak ditemukan.' },
          { status: 404 }
        );
      }

      const contactTenantId = String(contactData.tenant_id || '').toLowerCase().trim();
      const targetTenantId = tenant.id.toLowerCase().trim();
      const targetTenantSlug = tenant.slug.toLowerCase().trim();

      if (
        contactTenantId !== targetTenantId &&
        contactTenantId !== targetTenantSlug
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Kontak tidak terdaftar pada tenant ini.' },
          { status: 403 }
        );
      }
    }

    // -------------------------------------------------------------------------
    // 6. Mandatory Customer Info Validation
    // -------------------------------------------------------------------------
    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp pelanggan wajib diisi.' },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 7. SEC-P5-03: Strict Nominal Parsing & ASPI Standards Validation
    // -------------------------------------------------------------------------
    const amountRes = parseStrictRupiahAmount(rawAmount);
    if (!amountRes.valid) {
      return NextResponse.json(
        { success: false, error: amountRes.error || 'Nominal tidak valid.' },
        { status: 400 }
      );
    }

    const parsedAmount = amountRes.amount;
    if (parsedAmount < 1000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nominal tidak valid. Minimal transaksi adalah Rp 1.000',
        },
        { status: 400 }
      );
    }

    const isQris = billingType === 'QRIS';
    if (isQris && parsedAmount > 10000000) {
      return NextResponse.json(
        {
          success: false,
          error: 'Batas maksimum transaksi QRIS adalah Rp 10.000.000 per transaksi (Regulasi BI/ASPI)',
        },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 8. SEC-P5-02: Trusted Server-Side Bank Selection & Unique Code
    // -------------------------------------------------------------------------
    let finalUniqueCode = 0;
    let selectedBankAccount: any = null;

    if (billingType === 'MANUAL_BANK') {
      // Ignore/reject forged client bankAccount object; extract strictly from database tenant record
      const trustedAccounts = extractTenantBankAccounts(tenant);
      if (!trustedAccounts || trustedAccounts.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Toko belum mengonfigurasi rekening bank untuk pembayaran manual.' },
          { status: 400 }
        );
      }

      let chosenIdx = 0;
      const rawIdx = bankAccountIndex ?? selectedBankIndex;
      if (rawIdx !== undefined && rawIdx !== null) {
        const parsedIdx = Number(rawIdx);
        if (Number.isInteger(parsedIdx) && parsedIdx >= 0 && parsedIdx < trustedAccounts.length) {
          chosenIdx = parsedIdx;
        }
      }
      selectedBankAccount = trustedAccounts[chosenIdx];

      // Generate or strictly validate uniqueCode (1..999 integer) server-side
      if (uniqueCode !== undefined && uniqueCode !== null && uniqueCode !== '') {
        const parsedCode = Number(uniqueCode);
        if (!Number.isInteger(parsedCode) || parsedCode < 1 || parsedCode > 999) {
          return NextResponse.json(
            { success: false, error: 'Kode unik harus berupa bilangan bulat antara 1 dan 999.' },
            { status: 400 }
          );
        }
        finalUniqueCode = parsedCode;
      } else {
        finalUniqueCode = crypto.randomInt(1, 1000); // Server-side random integer 1..999
      }
    }

    const finalTotalAmount = billingType === 'MANUAL_BANK' ? parsedAmount + finalUniqueCode : parsedAmount;

    // -------------------------------------------------------------------------
    // 9. Catalog Resolution & Collision-Proof ID Generation
    // -------------------------------------------------------------------------
    const cleanItemName = String(itemName || 'Layanan / Proyek').trim();
    const productsList: any[] = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
    const matchedProd = productsList.find((p: any) =>
      p && ((p.name && cleanItemName && p.name.toLowerCase().includes(cleanItemName.toLowerCase())) ||
            (cleanItemName && p.name && cleanItemName.toLowerCase().includes(p.name.toLowerCase())))
    );
    const resolvedProductId = String(matchedProd?.id || productsList[0]?.id || 'srv_custom_chat');

    const now = new Date();
    const nowIso = now.toISOString();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePart = `${yy}${mm}${dd}`;
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const displayOrderNumber = `ORD-POS-${datePart}-${randomSuffix}`;
    const internalOrderId = crypto.randomUUID();
    const paymentToken = `pay_${crypto.randomBytes(16).toString('hex')}`;
    const rawPayUrl = getStorefrontPayUrl(tenant.slug, paymentToken);
    const payUrl = rawPayUrl.startsWith('http') ? rawPayUrl : `https://shop.boontrack.com${rawPayUrl}`;

    // -------------------------------------------------------------------------
    // 10. Server-Side Atomic Insert into 'orders' with Single Source of Truth
    // -------------------------------------------------------------------------
    const cleanCustomerPhone = customerPhone.trim();
    const cleanCustomerName = String(customerName || 'Pelanggan').trim();

    const rawOrderPayload = {
      id: internalOrderId,
      order_number: displayOrderNumber,
      correlation_id: paymentToken,
      tenant_slug: tenant.slug,
      tenant_id: tenant.id,
      customer_phone: cleanCustomerPhone,
      customer_name: cleanCustomerName,
      product_id: resolvedProductId,
      product_title: cleanItemName,
      gross_amount: finalTotalAmount,
      status: 'PENDING',
      payment_status: 'PENDING',
      order_status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso,
      metadata: {
        order_number: displayOrderNumber,
        internal_id: internalOrderId,
        conversation_id: conversationId || null,
        contact_id: contactId || null,
        created_by_cs_id: authoritativeCsUserId,
        created_by_cs_name: authoritativeCsUserName,
        public_payment_token: paymentToken,
        payment_token: paymentToken,
        payment_method: isQris ? 'qris' : 'MANUAL_BANK',
        pay_url: payUrl,
        source: isWalkIn ? 'QUICK_POS_WALKIN' : 'INBOX_QUICK_POS',
        is_walk_in: Boolean(isWalkIn),
        ...(billingType === 'MANUAL_BANK' ? {
          unique_code: finalUniqueCode,
          base_amount: parsedAmount,
          bank_account: selectedBankAccount,
        } : {}),
      },
    };

    const sanitizedPayload = sanitizeOrderPayload(rawOrderPayload);
    const { data: insertedOrder, error: insertOrderErr } = await supabase
      .from('orders')
      .insert(sanitizedPayload)
      .select('*')
      .maybeSingle();

    if (insertOrderErr) {
      console.error('[Inbox Custom Order Gateway Error]:', insertOrderErr);
      return NextResponse.json(
        { success: false, error: `Gagal membuat data pesanan: ${insertOrderErr.message || 'Database error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: insertedOrder || sanitizedPayload,
      orderId: internalOrderId,
      orderNumber: displayOrderNumber,
      paymentToken,
      amount: finalTotalAmount,
      baseAmount: parsedAmount,
      uniqueCode: finalUniqueCode,
      payUrl,
    });
  } catch (err: any) {
    console.error('[Inbox Custom Order Gateway Exception]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
