/**
 * lib/auth/magic-link-email.ts
 * Magic Link Email Dispatch Adapter (P0-A Fix — CTO Directive Final Auth Blocker Closure)
 *
 * Reuses the existing Resend-backed BoonPilot email infrastructure.
 * Constructs the confirmation URL from the exact GoTrue hashed_token.
 * Never logs tokens, action links, or credentials.
 * Fail-closed: never claims delivery success if dispatch actually failed.
 * Returns generic messaging to callers; internal delivery status is tracked separately.
 *
 * Host mapping:
 *   studio  → https://studio.boontrack.com
 *   creator → https://creator.boontrack.com
 *
 * Confirmation URL format (scanner-safe GET landing):
 *   https://<product-host>/api/auth/magic-link/verify?token=<hashed_token>&product=<product>
 */

import { AuthProduct } from './host-session';
import {
  sendBoonPilotVerificationEmail,
  getResendApiKey,
  type SendEmailResult,
} from '@/lib/boonpilot-email';

/** Internal dispatch result — never surfaced verbatim to external callers */
export interface MagicLinkDispatchResult {
  dispatched: boolean;
  /** Resend message ID if delivery succeeded */
  messageId?: string;
  /**
   * Internal error reason for observability — MUST NOT be forwarded to HTTP responses
   * to avoid account enumeration or token leakage.
   */
  internalError?: string;
}

/**
 * Authoritative product-to-host mapping.
 * Must match the redirect allowlist in lib/auth/magic-link.ts.
 */
const PRODUCT_HOSTS: Record<AuthProduct, string> = {
  studio: 'https://studio.boontrack.com',
  creator: 'https://creator.boontrack.com',
};

/**
 * Constructs the scanner-safe confirmation URL for the email link.
 * The recipient opens this URL, which renders the confirmation page (GET).
 * The POST redemption is only triggered by the human-visible button.
 *
 * Token is embedded in the URL as `token` query param.
 * This is the GoTrue hashed_token as returned by admin.generateLink().
 *
 * @param hashedToken - The exact GoTrue hashed_token. Must NOT be logged.
 * @param product     - 'studio' | 'creator'
 */
export function buildMagicLinkConfirmationUrl(hashedToken: string, product: AuthProduct): string {
  const host = PRODUCT_HOSTS[product];
  const url = new URL('/api/auth/magic-link/verify', host);
  url.searchParams.set('token', hashedToken);
  url.searchParams.set('product', product);
  return url.toString();
}

/**
 * Dispatches the Magic Link email via the existing Resend (BoonPilot) infrastructure.
 *
 * Security invariants:
 * - hashedToken is NEVER logged (token would allow session hijack in production).
 * - confirmationUrl is NEVER logged (contains token in query string).
 * - Returns a generic boolean dispatched flag — callers return generic user-facing messages.
 * - If RESEND_API_KEY is absent (test / offline / staging without credentials), returns
 *   dispatched: false with an internal error note. The caller decides how to surface this.
 *
 * @param email       - Recipient email address (already normalised by caller)
 * @param hashedToken - The exact GoTrue hashed_token. Not logged.
 * @param product     - 'studio' | 'creator'
 * @param recipientName - Optional display name for the greeting line
 */
export async function dispatchMagicLinkEmail(params: {
  email: string;
  hashedToken: string;
  product: AuthProduct;
  recipientName?: string;
}): Promise<MagicLinkDispatchResult> {
  const { email, hashedToken, product, recipientName } = params;

  // Guard: refuse to proceed if Resend key is not available
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return {
      dispatched: false,
      internalError: 'RESEND_API_KEY_MISSING',
    };
  }

  // Construct the confirmation URL (contains token — never log this value)
  const confirmationUrl = buildMagicLinkConfirmationUrl(hashedToken, product);

  const productLabel = product === 'studio' ? 'BoonTrack Studio' : 'BoonTrack Creator';

  const result: SendEmailResult = await sendBoonPilotVerificationEmail({
    to: email,
    name: recipientName,
    // Re-use the 'seller' role for Studio/Creator — the BoonPilot template is generic enough.
    // The verificationUrl carries the scanner-safe confirmation URL.
    role: 'seller',
    verificationUrl: confirmationUrl,
    storeName: productLabel,
    expiresInHours: 0.25, // 15-minute TTL matches the GoTrue token lifetime
  });

  if (!result.success) {
    return {
      dispatched: false,
      internalError: result.error || 'EMAIL_PROVIDER_FAILED',
    };
  }

  return {
    dispatched: true,
    messageId: result.messageId,
  };
}
