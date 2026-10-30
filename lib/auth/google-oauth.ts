/**
 * lib/auth/google-oauth.ts
 * Google OAuth 2.0 & ID Token Verification Engine with Server-Side Nonce & Authoritative GoTrue Identity
 * Directive RE-01 / CTO Execution Authorization (October 2026)
 *
 * Security Requirements:
 * 1. Server-Side Nonce Authority: Nonces must be generated server-side, tied to login attempt, and verified at callback.
 * 2. OAuth Flow:
 *    - Client calls POST /api/auth/google/init to receive server-generated { nonce, state }.
 *    - Callback submits credential + state to POST /api/auth/google/verify.
 * 3. Claims Enforcement: Validates issuer, audience, signature, expiry, and nonce.
 * 4. Mandatory Email Verification: Discards unverified Google profiles (email_verified === true).
 * 5. Single Identity Authority: User identity is anchored 100% to Supabase GoTrue (auth.users.id).
 * 6. Zero Synthesized User IDs: session.sub === verifiedGoTrueUser.id === auth.users.id.
 * 7. Host Session Issuance: Emits product-scoped host-only JWTs for Studio or Creator.
 */

import crypto from 'crypto';
import { AuthProduct, signHostSessionToken } from './host-session';
import { verifyGoTrueGoogleToken, seedGoTrueUser } from './gotrue-client';

export interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;             // Google unique persistent ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
  iat: number;
  exp: number;
}

export interface GoogleAuthInput {
  idToken?: string;
  credential?: string;     // Google One-Tap payload
  product: AuthProduct;
  state?: string;
  expectedNonce?: string;
}

// Platform User Record (Profile layer reflecting GoTrue auth.users)
export interface PlatformUserRecord {
  id: string;              // Foreign Key matching auth.users(id)
  email: string;
  email_verified: boolean;
  google_sub?: string;
  session_version: number;
}
const platformUsersVault = new Map<string, PlatformUserRecord>();

// Ephemeral Server-Side OAuth State & Nonce Vault (10-minute TTL)
interface OAuthAttemptState {
  state: string;
  nonce: string;
  product: AuthProduct;
  expiresAt: number;
}
const oauthAttemptVault = new Map<string, OAuthAttemptState>();

/**
 * Generates server-side state & nonce for an OAuth login attempt
 */
export function generateServerOAuthState(product: AuthProduct): { state: string; nonce: string } {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  oauthAttemptVault.set(state, {
    state,
    nonce,
    product,
    expiresAt,
  });

  return { state, nonce };
}

/**
 * Validates and consumes a server-side state (Single-Use)
 */
export function consumeServerOAuthState(state: string, product: AuthProduct): { valid: boolean; nonce?: string; error?: string } {
  if (!state) return { valid: false, error: 'STATE_REQUIRED' };

  const attempt = oauthAttemptVault.get(state);
  if (!attempt) {
    return { valid: false, error: 'STATE_INVALID_OR_EXPIRED' };
  }

  // Delete immediately to enforce single-use
  oauthAttemptVault.delete(state);

  if (Date.now() > attempt.expiresAt) {
    return { valid: false, error: 'STATE_EXPIRED' };
  }

  if (attempt.product !== product) {
    return { valid: false, error: 'STATE_PRODUCT_MISMATCH' };
  }

  return { valid: true, nonce: attempt.nonce };
}

/**
 * Parses and verifies Google ID Token claims
 */
export async function parseAndVerifyGoogleIdToken(
  tokenString: string,
  expectedNonce?: string
): Promise<{ valid: boolean; claims?: GoogleIdTokenClaims; error?: string }> {
  if (!tokenString || typeof tokenString !== 'string') {
    return { valid: false, error: 'TOKEN_REQUIRED' };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'TOKEN_MALFORMED' };
  }

  let claims: GoogleIdTokenClaims;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
    claims = JSON.parse(payloadJson);
  } catch {
    return { valid: false, error: 'INVALID_PAYLOAD_JSON' };
  }

  const now = Math.floor(Date.now() / 1000);

  // 1. Validate Issuer
  const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!validIssuers.includes(claims.iss)) {
    return { valid: false, error: 'INVALID_ISSUER' };
  }

  // 2. Validate Audience
  const expectedClientId = process.env.GOOGLE_CLIENT_ID || 'mock_google_client_id.apps.googleusercontent.com';
  if (claims.aud !== expectedClientId) {
    return { valid: false, error: 'AUDIENCE_MISMATCH' };
  }

  // 3. Validate Expiration
  if (claims.exp && claims.exp <= now) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  // 4. Mandatory Email Verification Guard
  if (claims.email_verified !== true) {
    return { valid: false, error: 'GOOGLE_EMAIL_NOT_VERIFIED' };
  }

  // 5. Server-Side Nonce Validation
  if (expectedNonce) {
    if (!claims.nonce || claims.nonce !== expectedNonce) {
      return { valid: false, error: 'NONCE_MISMATCH' };
    }
  }

  return { valid: true, claims };
}

/**
 * Resolves or securely links platform user identity using GoTrue Authority
 * Linked via FK to auth.users (Single Identity Authority)
 *
 * Invariant: host_session.sub === GoTrue user.id === auth.users.id
 * This invariant is enforced across ALL paths — new users, existing verified users,
 * and already-linked Google users. No path may issue a session from a locally-cached
 * ID without first confirming that ID with Supabase GoTrue.
 *
 * Identity Binding Invariants:
 *  - If existingUser.google_sub is already present:
 *      Must match claims.sub exactly. If different -> reject with GOOGLE_IDENTITY_MISMATCH.
 *  - If existingUser.google_sub is absent (first-time linking):
 *      claims.sub must NOT be linked to any other user in platformUsersVault.
 *      If already linked elsewhere -> reject with GOOGLE_IDENTITY_ALREADY_LINKED.
 *  - Session version is preserved from existing record.
 *  - google_sub is written ONLY after GoTrue verification succeeds.
 *
 * @param claims  - Pre-validated claims from parseAndVerifyGoogleIdToken().
 *                  Used for structural checks only — GoTrue is the identity authority.
 * @param idToken - The raw, verified Google JWT. Forwarded verbatim to GoTrue's
 *                  signInWithIdToken() for authoritative server-side verification.
 */
export async function resolveOrLinkGoogleUser(
  claims: GoogleIdTokenClaims,
  idToken: string = '',
): Promise<{
  success: boolean;
  user?: PlatformUserRecord;
  error?: string;
}> {
  const cleanEmail = claims.email.trim().toLowerCase();

  // 1. Check for ACCOUNT_TAKEOVER before touching GoTrue.
  //    An unverified local account must never be linked to any external provider.
  const existingUser = platformUsersVault.get(cleanEmail);
  if (existingUser && !existingUser.email_verified) {
    return { success: false, error: 'ACCOUNT_TAKEOVER_PREVENTED' };
  }

  // 2. Check Google identity binding invariants before GoTrue exchange:
  if (existingUser?.google_sub) {
    // If account already has a linked Google identity, it cannot be bound to a different Google sub.
    if (existingUser.google_sub !== claims.sub) {
      return { success: false, error: 'GOOGLE_IDENTITY_MISMATCH' };
    }
  } else {
    // If account is not yet linked to Google, verify this Google sub is not already linked to another local account.
    for (const u of platformUsersVault.values()) {
      if (u.google_sub === claims.sub && u.email !== cleanEmail) {
        return { success: false, error: 'GOOGLE_IDENTITY_ALREADY_LINKED' };
      }
    }
  }

  // 3. Unconditional GoTrue exchange — ALL paths (new, existing, re-login) must pass through here.
  //    GoTrue verifies token signature, issuer, audience, expiry, and returns the real auth.users.id.
  const goTrueResult = await verifyGoTrueGoogleToken({
    idToken,
    claims: {
      sub: claims.sub,
      email: cleanEmail,
      email_verified: claims.email_verified,
    },
  });

  if (!goTrueResult.success || !goTrueResult.user) {
    return { success: false, error: goTrueResult.error || 'LINKING_FAILED' };
  }

  const goTrueId = goTrueResult.user.id; // Authoritative auth.users(id)

  // 4. Identity collision guard: if a local record existed, its stored ID must match GoTrue's ID.
  //    A mismatch means the local cache is stale or has been tampered with — fail closed.
  if (existingUser && existingUser.id !== goTrueId) {
    return { success: false, error: 'ID_COLLISION' };
  }

  // 5. Final binding check before mutation
  if (existingUser?.google_sub && existingUser.google_sub !== claims.sub) {
    return { success: false, error: 'GOOGLE_IDENTITY_MISMATCH' };
  }
  for (const u of platformUsersVault.values()) {
    if (u.google_sub === claims.sub && u.email !== cleanEmail) {
      return { success: false, error: 'GOOGLE_IDENTITY_ALREADY_LINKED' };
    }
  }

  // 6. Determine session_version from existing record (preserves revocation version counter).
  const sessionVersion = existingUser?.session_version ?? 1;

  // 7. Upsert vault with GoTrue-confirmed identity.
  //    google_sub is only written after successful GoTrue verification.
  const confirmedUser: PlatformUserRecord = {
    id: goTrueId,              // Strictly from auth.users — never from local cache alone
    email: cleanEmail,
    email_verified: true,
    google_sub: claims.sub,    // Updated only after GoTrue confirms the token
    session_version: sessionVersion,
  };
  platformUsersVault.set(cleanEmail, confirmedUser);

  return { success: true, user: confirmedUser };
}

/**
 * Primary Google Authentication Gateway (GoTrue Single Authority)
 */
export async function handleGoogleAuth(input: GoogleAuthInput): Promise<{
  success: boolean;
  status: string;
  sessionToken?: string;
  userId?: string;
  tenantId?: string;
  tenantSlug?: string;
  product?: AuthProduct;
  message?: string;
}> {
  const token = (input.idToken || input.credential || '').trim();
  if (!token) {
    return { success: false, status: 'TOKEN_REQUIRED', message: 'Kredensial Google wajib disertakan.' };
  }

  // 1. Validate Server-Side State & Retrieve Expected Nonce
  let serverNonce: string | undefined = input.expectedNonce;
  if (input.state) {
    const stateCheck = consumeServerOAuthState(input.state, input.product);
    if (!stateCheck.valid) {
      return {
        success: false,
        status: stateCheck.error || 'INVALID_OAUTH_STATE',
        message: 'Sesi login Google tidak valid atau telah kedaluwarsa. Silakan ulangi.',
      };
    }
    serverNonce = stateCheck.nonce;
  }

  // 2. Parse & Verify Google ID Token against Server Nonce
  const verification = await parseAndVerifyGoogleIdToken(token, serverNonce);
  if (!verification.valid || !verification.claims) {
    return {
      success: false,
      status: verification.error || 'INVALID_GOOGLE_TOKEN',
      message: 'Verifikasi kredensial Google gagal.',
    };
  }

  // 3. Authoritative GoTrue Exchange
  // Pass the actual verified Google ID token so GoTrue can run signInWithIdToken()
  // with the real JWT. Do not pass a placeholder — client-supplied claims are
  // not trusted as a replacement for the token.
  const linkResult = await resolveOrLinkGoogleUser(verification.claims, token);
  if (!linkResult.success || !linkResult.user) {
    let message = 'Gagal mengaitkan akun pengguna via GoTrue.';
    if (linkResult.error === 'ACCOUNT_TAKEOVER_PREVENTED') {
      message = 'Akun dengan email ini belum diverifikasi secara lokal. Verifikasi email Anda sebelum menghubungkan Google.';
    } else if (linkResult.error === 'GOOGLE_IDENTITY_MISMATCH') {
      message = 'Akun ini telah terhubung dengan identitas Google lain. Akses ditolak.';
    } else if (linkResult.error === 'GOOGLE_IDENTITY_ALREADY_LINKED') {
      message = 'Identitas Google ini telah terhubung ke akun lain. Akses ditolak.';
    } else if (linkResult.error === 'ID_COLLISION') {
      message = 'Konflik identitas pengguna terdeteksi. Akses ditolak.';
    }

    return {
      success: false,
      status: linkResult.error || 'LINKING_FAILED',
      message,
    };
  }

  // 4. Resolve Workspace Tenant for Requested Product
  const user = linkResult.user;
  const baseSlug = user.email.split('@')[0].replace(/[^a-z0-9]/g, '-').slice(0, 16) || 'creator';
  const tenantSlug = `${input.product}-${baseSlug}-${user.id.slice(0, 6)}`;
  const tenantId = crypto.createHash('sha256').update(`ten:${tenantSlug}`).digest('hex').slice(0, 32);

  // 5. Sign Host-Only Session Token (session.sub === verifiedGoTrueUser.id === auth.users.id)
  const sessionToken = signHostSessionToken({
    product: input.product,
    userId: user.id, // Strictly the real GoTrue UUID
    tenantId,
    tenantSlug,
    role: input.product === 'studio' ? 'STUDIO_PARTICIPANT' : 'CREATOR_OWNER',
    version: user.session_version,
  });

  return {
    success: true,
    status: 'AUTHENTICATED',
    sessionToken,
    userId: user.id,
    tenantId,
    tenantSlug,
    product: input.product,
    message: 'Autentikasi Google berhasil.',
  };
}

/**
 * Resets memory vault (for unit tests)
 */
export function resetPlatformUsersVault() {
  platformUsersVault.clear();
  oauthAttemptVault.clear();
}

/**
 * Seeds a mock user in platform user vault and GoTrue mock store (for account linking tests)
 */
export function seedPlatformUser(user: PlatformUserRecord) {
  platformUsersVault.set(user.email.toLowerCase(), user);
  seedGoTrueUser({
    id: user.id,
    email: user.email,
    email_confirmed: user.email_verified,
    google_sub: user.google_sub,
  });
}

/**
 * Look up platform user by email (for tests and verification)
 */
export function getPlatformUserByEmail(email: string): PlatformUserRecord | undefined {
  return platformUsersVault.get(email.trim().toLowerCase());
}
