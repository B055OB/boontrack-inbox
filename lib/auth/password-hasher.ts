/**
 * lib/auth/password-hasher.ts
 * Standard Cryptographic Hashing for Passwords and PINs.
 *
 * Security Requirement (P0 CTO Directive):
 * - Eliminates plaintext password storage in database and jsonb metadata.
 * - Produces deterministic SHA-256 hash representation.
 */

import crypto from 'crypto';

/**
 * Hash a plain password or PIN string using standard SHA-256.
 */
export function hashPassword(plainText: string): string {
  const clean = String(plainText || '').trim();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Verify a plaintext password against a stored SHA-256 hash.
 */
export function verifyPassword(plainText: string, storedHash: string): boolean {
  if (!plainText || !storedHash) return false;
  const computed = hashPassword(plainText);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  } catch {
    return false;
  }
}
