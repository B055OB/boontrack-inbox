/**
 * lib/auth/password-hasher.ts
 * Standard Salted Password Hashing via bcryptjs.
 *
 * Security Requirements (CTO Directive P1 - Blocker 2):
 * - Eliminates fast-hash SHA-256 for passwords/PINs (prevents rainbow table & brute-force attacks).
 * - Standard salted bcrypt hashing with configurable work factor (minimum 10 salt rounds).
 * - Exports asynchronous and synchronous hashing and verification utilities.
 */

import bcrypt from 'bcryptjs';

const DEFAULT_SALT_ROUNDS = 10;

/**
 * Hash a plain password or PIN string using bcrypt with salt rounds.
 */
export async function hashPassword(plainText: string, saltRounds: number = DEFAULT_SALT_ROUNDS): Promise<string> {
  const clean = String(plainText || '').trim();
  const salt = await bcrypt.genSalt(saltRounds);
  return bcrypt.hash(clean, salt);
}

/**
 * Synchronous variant of hashPassword using bcryptjs.
 */
export function hashPasswordSync(plainText: string, saltRounds: number = DEFAULT_SALT_ROUNDS): string {
  const clean = String(plainText || '').trim();
  const salt = bcrypt.genSaltSync(saltRounds);
  return bcrypt.hashSync(clean, salt);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(plainText: string, storedHash: string): Promise<boolean> {
  if (!plainText || !storedHash) return false;
  try {
    return await bcrypt.compare(String(plainText).trim(), storedHash);
  } catch {
    return false;
  }
}

/**
 * Synchronous variant of verifyPassword using bcryptjs.
 */
export function verifyPasswordSync(plainText: string, storedHash: string): boolean {
  if (!plainText || !storedHash) return false;
  try {
    return bcrypt.compareSync(String(plainText).trim(), storedHash);
  } catch {
    return false;
  }
}
