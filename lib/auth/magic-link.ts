/**
 * lib/auth/magic-link.ts
 * Passwordless Magic Link Engine for Studio & Creator Global Onboarding
 * Authoritative Supabase GoTrue Identity Integration
 * Directive RE-01 / CTO Execution Authorization (October 2026)
 *
 * Security Requirements:
 * 1. Single Identity Authority: Delegated 100% to Supabase GoTrue (admin.generateLink & verifyOtp).
 * 2. Zero Synthesized User IDs: session.sub === verifiedGoTrueUser.id === auth.users.id.
 * 3. Single-Use & Expiry: 15-minute TTL, atomic redemption, replay protection.
 * 4. Rate Limiting: Max 3 requests per identifier per 15 minutes.
 * 5. Zero Account Enumeration: Generic success response prevents email discovery.
 * 6. Link-Scanner Safe: Token is NEVER consumed by GET pre-fetching; redemption requires explicit POST.
 * 7. Internal Redirect Allowlist: Strict validation prevents open-redirect phishing.
 */

import crypto from 'crypto';
import { AuthProduct, signHostSessionToken } from './host-session';
import {
  generateGoTrueMagicLink,
  verifyGoTrueMagicLink,
  inspectGoTrueMagicLinkReadOnly,
} from './gotrue-client';
import {
  dispatchMagicLinkEmail,
  buildMagicLinkConfirmationUrl,
  type MagicLinkDispatchResult,
} from './magic-link-email';

export interface MagicLinkRequestInput {
  email: string;
  product: AuthProduct;
  redirectUrl?: string;
  clientIp?: string;
}

export interface MagicLinkRedemptionInput {
  token: string;
  product: AuthProduct;
}

// In-memory rate-limiter bucket
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();

/**
 * Computes SHA-256 hash of plaintext token (helper for diagnostics)
 */
export function hashMagicToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Generates high-entropy token for local testing
 */
export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Evaluates rate limit: max 3 requests per 15-min window
 */
export function checkRateLimit(key: string, maxAllowed: number = 3, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxAllowed) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/**
 * Reset rate limit bucket (used for test teardown)
 */
export function resetRateLimitBuckets() {
  rateLimitMap.clear();
}

/**
 * Validates redirect URL against strict internal allowlist
 * Prevents Open-Redirect / Phishing vulnerabilities
 */
export function validateRedirectUrl(url: string | undefined | null, product: AuthProduct): string {
  const defaultFallback = product === 'studio' ? '/desk' : '/admin';
  if (!url || typeof url !== 'string') return defaultFallback;

  const trimmed = url.trim();

  // 1. Disallow protocol-relative URLs (e.g. //evil.com)
  if (trimmed.startsWith('//')) {
    return defaultFallback;
  }

  // 2. Relative URLs starting with /
  if (trimmed.startsWith('/') && !trimmed.startsWith('/\\')) {
    return trimmed;
  }

  // 3. Absolute URLs matching authorized BoonTrack domains
  try {
    const parsed = new URL(trimmed);
    const validOrigins = [
      'https://studio.boontrack.com',
      'https://creator.boontrack.com',
      'https://dashboard.boontrack.com',
      'http://localhost:3000',
      'http://studio.localhost:3000',
      'http://creator.localhost:3000',
    ];

    if (validOrigins.includes(parsed.origin)) {
      return parsed.pathname + parsed.search;
    }
  } catch {}

  return defaultFallback;
}

/**
 * Requests a Magic Link dispatch (Delegated to GoTrue Authority)
 *
 * P0-A: Actual email delivery is now wired via dispatchMagicLinkEmail().
 * The confirmation URL is constructed from the exact GoTrue hashed_token.
 * Failure modes:
 * - GoTrue link generation failure → returns failure (no email sent).
 * - Email dispatch failure → returns failure with generic external message;
 *   internal error is NOT forwarded to the caller response (avoid enumeration).
 * - Test environment (NODE_ENV === 'test') → skips live dispatch, returns debugToken.
 */
export async function requestMagicLink(input: MagicLinkRequestInput): Promise<{
  success: boolean;
  message: string;
  /** Debug-only token: only present when NODE_ENV === 'test'. Never expose to production. */
  debugToken?: string;
  /** Internal delivery result for observability. Not forwarded to HTTP responses. */
  _dispatchResult?: MagicLinkDispatchResult;
}> {
  const cleanEmail = (input.email || '').trim().toLowerCase();

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return {
      success: false,
      message: 'Format alamat email tidak valid.',
    };
  }

  // 1. Rate Limiting by Email and Product
  const rateLimitKey = `req:${cleanEmail}:${input.product}`;
  if (!checkRateLimit(rateLimitKey, 3, 15 * 60 * 1000)) {
    return {
      success: false,
      message: 'Terlalu banyak permintaan login. Silakan tunggu 15 menit sebelum mencoba kembali.',
    };
  }

  const safeRedirectUrl = validateRedirectUrl(input.redirectUrl, input.product);

  // 2. Generate Authoritative GoTrue Magic Link
  const linkResult = await generateGoTrueMagicLink({
    email: cleanEmail,
    redirectTo: safeRedirectUrl,
    product: input.product,
  });

  if (!linkResult.success || !linkResult.tokenHash) {
    return {
      success: false,
      message: 'Gagal membuat tautan masuk aman. Silakan coba sesaat lagi.',
    };
  }

  // 3. Dispatch email (skip in test environment; use debugToken for test redemption)
  if (process.env.NODE_ENV === 'test') {
    // Test mode: return raw token hash for programmatic redemption in test suites.
    // Never use debugToken in production — it bypasses email delivery verification.
    return {
      success: true,
      message: 'Tautan login aman telah dikirimkan ke email Anda. Silakan periksa kotak masuk atau spam.',
      debugToken: linkResult.tokenHash,
    };
  }

  // 4. Live dispatch via Resend (BoonPilot email infrastructure)
  // hashedToken is NOT logged here — it would allow session hijack if leaked.
  const dispatchResult = await dispatchMagicLinkEmail({
    email: cleanEmail,
    hashedToken: linkResult.tokenHash,
    product: input.product,
  });

  if (!dispatchResult.dispatched) {
    // Email dispatch failed. Fail closed — do NOT claim delivery success.
    // Log internal error for observability (no token values in log).
    console.error(
      '[MagicLink] Email dispatch failed for product=%s internalError=%s',
      input.product,
      dispatchResult.internalError || 'UNKNOWN',
    );
    return {
      success: false,
      message: 'Gagal mengirimkan tautan login. Silakan coba lagi sesaat.',
      _dispatchResult: dispatchResult,
    };
  }

  // 5. Generic success response (zero account enumeration)
  return {
    success: true,
    message: 'Tautan login aman telah dikirimkan ke email Anda. Silakan periksa kotak masuk atau spam.',
    _dispatchResult: dispatchResult,
  };
}

/**
 * Inspects a Magic Link token in READ-ONLY mode (for GET confirmation landing page)
 * DOES NOT consume or alter the single-use token state! Safe against email link scanners.
 *
 * P0-C: GoTrue does not expose a non-consuming token validation endpoint.
 * In live mode, the GET landing page is rendered without claiming authoritative token validity.
 * This is safer than a secondary custom engine. Tokens are only definitively validated
 * via POST → verifyOtp(), which is the single atomic redemption path.
 *
 * In test mode, the in-memory mock store allows read-only inspection without mutation.
 */
export async function inspectMagicLinkReadOnly(token: string, product: AuthProduct): Promise<{
  valid: boolean;
  status: string;
  email?: string;
  redirectUrl?: string;
  /** When true, the token has not been checked against GoTrue — only mock store was inspected */
  unverifiedLivePlaceholder?: boolean;
}> {
  if (!token) return { valid: false, status: 'TOKEN_REQUIRED' };

  const inspection = await inspectGoTrueMagicLinkReadOnly({
    tokenHash: token,
    product,
  });

  if (!inspection.valid) {
    return { valid: false, status: inspection.error || 'TOKEN_INVALID' };
  }

  // In live mode, inspectGoTrueMagicLinkReadOnly returns { valid: true } as a placeholder
  // because GoTrue offers no non-consuming validation endpoint. The GET page is rendered
  // to provide a human-clickable confirmation step. The actual GoTrue validation only
  // occurs at POST via verifyOtp(). The `unverifiedLivePlaceholder` flag signals this.
  const isLiveMode =
    process.env.NODE_ENV !== 'test' &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('mock');

  return {
    valid: true,
    status: 'READY_FOR_CONFIRMATION',
    email: inspection.email || undefined,
    redirectUrl: product === 'studio' ? '/desk' : '/admin',
    ...(isLiveMode ? { unverifiedLivePlaceholder: true } : {}),
  };
}

/**
 * Atomically redeems a Magic Link token (POST ONLY) via GoTrue verifyOtp
 * Enforces single-use consumption and issues host-only session bound to real auth.users.id
 */
export async function redeemMagicLink(input: MagicLinkRedemptionInput): Promise<{
  success: boolean;
  status: string;
  sessionToken?: string;
  userId?: string;
  tenantId?: string;
  tenantSlug?: string;
  redirectUrl?: string;
  product?: AuthProduct;
  message?: string;
}> {
  const cleanToken = (input.token || '').trim();
  if (!cleanToken) {
    return { success: false, status: 'TOKEN_REQUIRED', message: 'Token verifikasi wajib disertakan.' };
  }

  // Rate limit verification attempts (Anti-Brute Force)
  const verifyLimitKey = `ver:${cleanToken.slice(0, 16)}`;
  if (!checkRateLimit(verifyLimitKey, 10, 5 * 60 * 1000)) {
    return { success: false, status: 'RATE_LIMIT_EXCEEDED', message: 'Terlalu banyak percobaan verifikasi.' };
  }

  // 1. Authoritative GoTrue OTP Verification
  const verification = await verifyGoTrueMagicLink({
    tokenHash: cleanToken,
    product: input.product,
  });

  if (!verification.success || !verification.user) {
    const status = verification.error || 'TOKEN_INVALID';
    let message = 'Tautan login tidak valid atau telah kedaluwarsa.';
    if (status === 'ALREADY_CONSUMED') {
      message = 'Tautan login ini telah digunakan sebelumnya. Silakan minta tautan baru.';
    } else if (status === 'TOKEN_EXPIRED') {
      message = 'Tautan login telah kedaluwarsa (berlaku 15 menit).';
    } else if (status === 'PRODUCT_MISMATCH') {
      message = `Tautan ini tidak valid untuk produk ${input.product}.`;
    }

    return {
      success: false,
      status,
      message,
    };
  }

  // 2. Authoritative GoTrue Identity Verification (Real auth.users.id)
  const user = verification.user;
  const userId = user.id; // Strictly real UUID from auth.users(id)
  const email = user.email;

  // 3. Resolve Workspace Tenant for Requested Product
  const baseSlug = email.split('@')[0].replace(/[^a-z0-9]/g, '-').slice(0, 16) || 'creator';
  const tenantSlug = `${input.product}-${baseSlug}-${userId.slice(0, 6)}`;
  const tenantId = crypto.createHash('sha256').update(`ten:${tenantSlug}`).digest('hex').slice(0, 32);

  // 4. Sign Host-Only Session Token (session.sub === verifiedGoTrueUser.id === auth.users.id)
  const sessionToken = signHostSessionToken({
    product: input.product,
    userId: user.id, // Strictly real GoTrue UUID
    tenantId,
    tenantSlug,
    role: input.product === 'studio' ? 'STUDIO_PARTICIPANT' : 'CREATOR_OWNER',
    version: 1,
  });

  return {
    success: true,
    status: 'AUTHENTICATED',
    sessionToken,
    userId: user.id,
    tenantId,
    tenantSlug,
    redirectUrl: input.product === 'studio' ? '/desk' : '/admin',
    product: input.product,
    message: 'Verifikasi berhasil. Anda dialihkan ke ruang kerja.',
  };
}
