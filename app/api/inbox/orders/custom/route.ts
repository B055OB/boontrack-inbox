import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sanitizeOrderPayload } from '@/lib/order-sanitizer';
import { getStorefrontPayUrl } from '@/lib/utils/storefrontUrl';
import {
  extractMerchantSessionToken,
  verifyMerchantSessionToken,
  type MerchantSessionPayload,
} from '@/lib/auth/merchant-session';
import { extractTenantBankAccounts } from '@/lib/bank-accounts';

export const dynamic = 'force-dynamic';

/**
 * Maximum permitted nominal for manual bank transfer POS orders (Rp 500.000.000).
 */
export const MAX_MANUAL_BANK_AMOUNT = 500_000_000;

/**
 * Registered server-verified machine principal policy.
 */
export interface MachinePrincipal {
  id: string;
  name?: string;
  secret: string;
  allowedTenants: string[]; // List of tenant slugs or IDs, or '*'
  allowedScopes: string[];  // e.g. ['pos:create_order']
}

/**
 * Loads the server-side machine principal registry.
 * Sources:
 * 1. process.env.INTERNAL_MACHINE_PRINCIPALS (JSON map of principalId -> { secret, allowedTenants, allowedScopes, name })
 *
 * NOTE: Legacy global shared secrets (ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET)
 * WITHOUT explicit server-configured tenant binding are strictly rejected (fail-closed).
 */
export function getRegisteredMachinePrincipals(): Record<string, MachinePrincipal> {
  const registry: Record<string, MachinePrincipal> = {};

  const envJson = process.env.INTERNAL_MACHINE_PRINCIPALS?.trim();
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [id, cfg] of Object.entries(parsed)) {
          if (cfg && typeof cfg === 'object') {
            const anyCfg = cfg as any;
            if (anyCfg.secret) {
              registry[id] = {
                id,
                name: anyCfg.name || `Machine Principal (${id})`,
                secret: String(anyCfg.secret),
                allowedTenants: Array.isArray(anyCfg.allowedTenants) ? anyCfg.allowedTenants.map(String) : [],
                allowedScopes: Array.isArray(anyCfg.allowedScopes) ? anyCfg.allowedScopes.map(String) : [],
              };
            }
          }
        }
      }
    } catch (e) {
      console.error('[Machine Principal Registry Parse Error]:', e);
    }
  }

  return registry;
}

/**
 * Authenticates machine principal against server-side registry.
 * Fails closed if:
 * 1. No valid principal credentials provided
 * 2. Secret does not match verified principal in server registry
 * 3. Legacy shared secret provided without explicit principal binding
 */
export function authenticateMachinePrincipal(req: NextRequest): {
  hasCandidate: boolean;
  authenticated: boolean;
  principal?: MachinePrincipal;
  error?: string;
} {
  const authHeader = req.headers.get('authorization')?.trim() || '';
  const internalSecret = req.headers.get('x-internal-secret')?.trim() || '';
  const principalIdHeader = (
    req.headers.get('x-machine-principal-id') ||
    req.headers.get('x-principal-id') ||
    ''
  ).trim();

  let candidateSecret = internalSecret;
  if (!candidateSecret && authHeader.toLowerCase().startsWith('bearer ')) {
    candidateSecret = authHeader.slice(7).trim();
  }

  if (!candidateSecret) {
    return { hasCandidate: false, authenticated: false };
  }

  const registry = getRegisteredMachinePrincipals();
  const candidateBuf = Buffer.from(candidateSecret);

  // 1. If explicit principal ID header provided, verify secret against that principal
  if (principalIdHeader && registry[principalIdHeader]) {
    const p = registry[principalIdHeader];
    const secretBuf = Buffer.from(p.secret);
    if (candidateBuf.length === secretBuf.length && crypto.timingSafeEqual(candidateBuf, secretBuf)) {
      return { hasCandidate: true, authenticated: true, principal: p };
    }
    return {
      hasCandidate: true,
      authenticated: false,
      error: 'Forbidden: Secret tidak cocok untuk Machine Principal yang diklaim.',
    };
  }

  // 2. Check if candidate secret matches any registered principal in server registry
  for (const p of Object.values(registry)) {
    const secretBuf = Buffer.from(p.secret);
    if (candidateBuf.length === secretBuf.length && crypto.timingSafeEqual(candidateBuf, secretBuf)) {
      return { hasCandidate: true, authenticated: true, principal: p };
    }
  }

  // 3. If candidate matches legacy global shared secret without registered tenant binding, reject fail-closed
  const legacySecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();
  if (legacySecret && legacySecret.length >= 16) {
    const legacyBuf = Buffer.from(legacySecret);
    if (candidateBuf.length === legacyBuf.length && crypto.timingSafeEqual(candidateBuf, legacyBuf)) {
      return {
        hasCandidate: true,
        authenticated: false,
        error: 'Forbidden: Legacy shared machine secret dilarang tanpa registrasi principal dan binding tenant eksplisit di server (INTERNAL_MACHINE_PRINCIPALS).',
      };
    }
  }

  return {
    hasCandidate: true,
    authenticated: false,
    error: 'Forbidden: Kredensial mesin tidak valid atau Machine Principal tidak terdaftar.',
  };
}

/**
 * Strict Integer Rupiah Nominal Parser & ASPI Standard Enforcement (SEC-P5-03).
 *
 * Rules:
 * 1. Rejects non-finite numbers, NaN, and negative/zero values.
 * 2. Rejects fractional/decimal numbers and strings (e.g. 25000.50, "25000.50", "25000,50").
 * 3. Rejects strings with trailing or non-numeric characters (e.g. "25000abc").
 * 4. Accepts clean whole integers (25000, "25000") or standard thousand-separator integers ("25.000", "25,000").
 * 5. Rejects values exceeding Number.MAX_SAFE_INTEGER or non-safe integers.
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
    if (!Number.isSafeInteger(rawAmount) || rawAmount > Number.MAX_SAFE_INTEGER) {
      return { valid: false, amount: 0, error: 'Nominal melebihi batas aman integer sistem (MAX_SAFE_INTEGER).' };
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
      if (s.length > 16) {
        return { valid: false, amount: 0, error: 'Nominal melebihi batas aman integer sistem (MAX_SAFE_INTEGER).' };
      }
      numVal = parseInt(s, 10);
    }
    // Match Indonesian standard thousands format: "25.000", "1.000.000"
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      const cleanDigits = s.replace(/\./g, '');
      if (cleanDigits.length > 16) {
        return { valid: false, amount: 0, error: 'Nominal melebihi batas aman integer sistem (MAX_SAFE_INTEGER).' };
      }
      numVal = parseInt(cleanDigits, 10);
    }
    // Match English standard thousands format: "25,000", "1,000,000"
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
      const cleanDigits = s.replace(/,/g, '');
      if (cleanDigits.length > 16) {
        return { valid: false, amount: 0, error: 'Nominal melebihi batas aman integer sistem (MAX_SAFE_INTEGER).' };
      }
      numVal = parseInt(cleanDigits, 10);
    } else {
      return { valid: false, amount: 0, error: 'Format nominal tidak valid. Masukkan angka bulat tanpa karakter tambahan.' };
    }
  } else {
    return { valid: false, amount: 0, error: 'Tipe data nominal tidak valid.' };
  }

  if (numVal < 0) {
    return { valid: false, amount: 0, error: 'Nominal tidak boleh bernilai negatif.' };
  }

  if (!Number.isSafeInteger(numVal) || numVal > Number.MAX_SAFE_INTEGER) {
    return { valid: false, amount: 0, error: 'Nominal melebihi batas aman integer sistem (MAX_SAFE_INTEGER).' };
  }

  return { valid: true, amount: numVal };
}

/**
 * INBOX-POS-01 / Patch 6: Dedicated Server Gateway for Custom POS Order Generation
 * Resolves SEC-01 & SEC-03 & CTO Security Remediation Orders (SEC-P5-01, SEC-P5-02, SEC-P5-03, P5-01, P5-02, Patch 6):
 * 1. P5-01 / Patch 6: Authoritative active membership check based on verified schema (is_active === true fail-closed; status nullable/non-authoritative unless non-active).
 * 2. P5-02 / Patch 6: Membership Role Integrity & Zero Implicit Bypass (Allowed CS/OPERATOR DB roles, explicit DB order permissions with zero OWNER_LEAD/FULL_DASHBOARD bypass, authoritative DB identity metadata).
 * 3. SEC-P5-01: Server-Enforced Machine Principal Authorization (No self-asserted header authority).
 * 4. SEC-P5-03: Strict Integer Rupiah Validation (Safe-Integer enforcement, MAX_MANUAL_BANK_AMOUNT cap, BI/ASPI limits).
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

    // -------------------------------------------------------------------------
    // 1. SEC-P5-01: Machine Principal vs. Merchant Session Authentication
    // -------------------------------------------------------------------------
    const machineAuth = authenticateMachinePrincipal(req);

    if (machineAuth.hasCandidate && !machineAuth.authenticated) {
      return NextResponse.json(
        { success: false, error: machineAuth.error || 'Forbidden: Autentikasi mesin gagal.' },
        { status: 403 }
      );
    }

    let isMachine = false;
    let machinePrincipal: MachinePrincipal | null = null;
    let sessionPayload: MerchantSessionPayload | null = null;
    let targetTenantKey = '';

    if (machineAuth.authenticated && machineAuth.principal) {
      isMachine = true;
      machinePrincipal = machineAuth.principal;

      // Machine callers determine target tenant from request (body or header),
      // which will then be strictly validated against machinePrincipal.allowedTenants
      const requestedTarget = (
        body.tenantSlug ||
        req.headers.get('x-target-tenant') ||
        req.headers.get('x-internal-tenant') ||
        ''
      ).toLowerCase().trim();

      if (!requestedTarget) {
        return NextResponse.json(
          { success: false, error: 'Parameter tenant wajib diisi untuk operasi mesin.' },
          { status: 400 }
        );
      }

      targetTenantKey = requestedTarget;
    } else {
      // Human merchant session flow
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

      const sessionTenantSlug = String(sessionPayload.tenantSlug || '').toLowerCase().trim();
      const sessionTenantId = String(sessionPayload.tenantId || '').toLowerCase().trim();

      if (!sessionTenantSlug && !sessionTenantId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Sesi tidak terikat pada tenant yang valid.' },
          { status: 403 }
        );
      }

      // If client supplied tenantSlug, verify it strictly matches session tenant
      const requestedSlug = String(tenantSlug || '').toLowerCase().trim();
      if (requestedSlug) {
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

      targetTenantKey = sessionTenantSlug || sessionTenantId;
    }

    // -------------------------------------------------------------------------
    // 2. Resolve Authoritative Tenant Record from Database
    // -------------------------------------------------------------------------
    if (!targetTenantKey) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant slug / tenant ID wajib diisi.' },
        { status: 400 }
      );
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetTenantKey);
    let tQuery = supabase.from('tenants').select('id, slug, name, tier, metadata');
    if (isUuid) {
      tQuery = tQuery.or(`id.eq.${targetTenantKey},slug.eq.${targetTenantKey}`);
    } else {
      tQuery = tQuery.or(`slug.eq.${targetTenantKey},id.eq.${targetTenantKey}`);
    }

    const { data: tenant, error: tenantErr } = await tQuery.maybeSingle();
    if (!tenant || tenantErr) {
      return NextResponse.json(
        { success: false, error: 'Toko/Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    // -------------------------------------------------------------------------
    // 3. SEC-P5-01: Server-Side Authorization Enforcement
    // -------------------------------------------------------------------------
    let authoritativeCsUserId: string | null = null;
    let authoritativeCsUserName = 'Store Admin';

    if (isMachine && machinePrincipal) {
      // A. Machine Principal Authorization:
      // 1. Verify operation scope against server policy
      const allowedMachineScopes = ['pos:create_order', 'inbox:custom_order', 'orders:create'];
      const hasAllowedScope = machinePrincipal.allowedScopes.some((s) =>
        allowedMachineScopes.includes(s.toLowerCase().trim())
      );

      if (!hasAllowedScope) {
        return NextResponse.json(
          {
            success: false,
            error: `Forbidden: Machine Principal '${machinePrincipal.id}' tidak diizinkan untuk operasi POS ('pos:create_order').`,
          },
          { status: 403 }
        );
      }

      // 2. Verify target tenant against server principal policy (NEVER trust caller headers)
      const targetSlugLower = tenant.slug.toLowerCase().trim();
      const targetIdLower = tenant.id.toLowerCase().trim();
      const isTenantPermitted = machinePrincipal.allowedTenants.some((allowed) => {
        const a = allowed.toLowerCase().trim();
        return a === targetSlugLower || a === targetIdLower || a === '*';
      });

      if (!isTenantPermitted) {
        return NextResponse.json(
          {
            success: false,
            error: `Forbidden: Machine Principal '${machinePrincipal.id}' tidak memiliki hak akses untuk tenant '${tenant.slug}'. Akses lintas tenant ditolak.`,
          },
          { status: 403 }
        );
      }

      authoritativeCsUserId = `machine:${machinePrincipal.id}`;
      authoritativeCsUserName = machinePrincipal.name || `Machine Principal (${machinePrincipal.id})`;
    } else if (sessionPayload) {
      // B. Human Merchant Session Authorization:
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
        // SEC-P5-02 (Patch 4): Mandatory Active DB Membership & Permission Check
        // Zero token-claim short-circuits. Always query tenant_users for this tenant.id.
        let uQuery = supabase
          .from('tenant_users')
          .select('*')
          .eq('tenant_id', tenant.id);

        if (sessionPayload.userId) {
          uQuery = uQuery.eq('id', sessionPayload.userId);
        } else if (sessionPayload.phone) {
          uQuery = uQuery.eq('phone', sessionPayload.phone);
        } else {
          return NextResponse.json(
            { success: false, error: 'Forbidden: CS session wajib memiliki userId atau phone terdaftar.' },
            { status: 403 }
          );
        }

        const { data: dbUser, error: dbUserErr } = await uQuery.maybeSingle();
        if (dbUserErr || !dbUser) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Akun CS tidak terdaftar sebagai anggota tenant target.' },
            { status: 403 }
          );
        }

        // P5-01: Strict Authoritative Active Membership Check (Fail-Closed)
        // 1. is_active must be strictly boolean true (rejects null, undefined, missing, false, non-boolean)
        if (dbUser.is_active !== true) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Status keanggotaan CS tidak aktif (is_active bukan true).' },
            { status: 403 }
          );
        }

        // 2. If status is defined/present, require exact active enum (e.g. 'ACTIVE').
        // Reject unknown, inactive, and suspended states. Do NOT infer active membership from absence of suspension marker.
        if (dbUser.status !== undefined && dbUser.status !== null) {
          const normStatus = String(dbUser.status).toUpperCase().trim();
          if (normStatus !== 'ACTIVE') {
            return NextResponse.json(
              { success: false, error: `Forbidden: Status keanggotaan CS '${dbUser.status}' tidak valid atau tidak aktif.` },
              { status: 403 }
            );
          }
        }

        // P5-02: Membership Role Integrity
        // Require the database membership role to be an allowed CS/OPERATOR role. Never trust token claims to grant DB roles.
        const allowedCsRoles = ['CS', 'OPERATOR', 'CUSTOMER_SERVICE', 'CS_AGENT', 'AGENT', 'OWNER_LEAD'];
        const dbRole = String(dbUser.role || '').toUpperCase().trim();
        if (!dbRole || !allowedCsRoles.includes(dbRole)) {
          return NextResponse.json(
            { success: false, error: `Forbidden: Peran anggota pada database ('${dbUser.role || 'NONE'}') tidak diizinkan untuk operasional CS/POS.` },
            { status: 403 }
          );
        }

        // Explicit, authoritative order-creation permission required on the same membership record.
        // Zero implicit role/access-level bypasses (OWNER_LEAD and FULL_DASHBOARD require explicit order permission).
        const allowedPerms = ['pos', 'orders', 'create_order', 'create_orders', 'orders:create', 'pos:create', 'pos_orders', 'all', '*'];
        const dbPerms = dbUser.permissions || dbUser.metadata?.permissions;
        const hasDbOrderPerm =
          dbUser.can_create_orders === true ||
          dbUser.metadata?.can_create_orders === true ||
          (Array.isArray(dbPerms) && dbPerms.some((p: string) => allowedPerms.includes(String(p).toLowerCase().trim())));

        if (!hasDbOrderPerm) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: CS tidak memiliki izin pembuatan pesanan POS pada keanggotaan tenant ini.' },
            { status: 403 }
          );
        }

        // Preserve restrictive token claims: explicit token denial must still fail closed
        const anyPayload = sessionPayload as any;
        if (anyPayload.canCreateOrders === false || anyPayload.can_create_orders === false) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Izin pembuatan pesanan ditolak oleh token konteks sesi.' },
            { status: 403 }
          );
        }

        // Authoritative DB identity/name for audit metadata (DB record takes precedence over session claims)
        authoritativeCsUserId = dbUser.id || sessionPayload.userId || null;
        authoritativeCsUserName = dbUser.name || sessionPayload.name || 'CS Officer';
      } else {
        // Owner or Admin
        authoritativeCsUserId = sessionPayload.userId || null;
        authoritativeCsUserName = sessionPayload.name || 'Store Admin';
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi autentikasi tidak tersedia.' },
        { status: 401 }
      );
    }

    // -------------------------------------------------------------------------
    // 4. SEC-P5-02: Authoritative Server Data & Cross-Tenant Entity Checks
    // -------------------------------------------------------------------------
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
    // 5. Mandatory Customer Info Validation
    // -------------------------------------------------------------------------
    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp pelanggan wajib diisi.' },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 6. SEC-P5-03: Strict Nominal Parsing & ASPI Standards Validation
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

    const isManualBank = billingType === 'MANUAL_BANK';
    if (isManualBank && parsedAmount > MAX_MANUAL_BANK_AMOUNT) {
      return NextResponse.json(
        {
          success: false,
          error: `Batas maksimum transaksi transfer manual POS adalah Rp ${MAX_MANUAL_BANK_AMOUNT.toLocaleString('id-ID')} per transaksi.`,
        },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 7. SEC-P5-02: Trusted Server-Side Bank Selection & Unique Code
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
    if (!Number.isSafeInteger(finalTotalAmount) || finalTotalAmount > Number.MAX_SAFE_INTEGER) {
      return NextResponse.json(
        { success: false, error: 'Total nominal pembayaran melebihi batas aman integer sistem.' },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 8. Catalog Resolution & Collision-Proof ID Generation
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
    // 9. Server-Side Atomic Insert into 'orders' with Single Source of Truth
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
