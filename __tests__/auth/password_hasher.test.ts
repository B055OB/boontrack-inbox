/**
 * __tests__/auth/password_hasher.test.ts
 * Unit Tests: Standard Salted Password Hashing via bcryptjs (Blocker 2).
 */

import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
} from '@/lib/auth/password-hasher';

describe('Standard Salted Password Hashing (bcryptjs - Blocker 2)', () => {
  const plainPassword = 'SuperSecretPassword123!';

  describe('1. Asynchronous Hashing (hashPassword & verifyPassword)', () => {
    it('generates a valid bcrypt hash starting with $2a$ or $2b$', async () => {
      const hash = await hashPassword(plainPassword);

      expect(typeof hash).toBe('string');
      // bcrypt hashes are 60 characters long and format: $2[ab]$<rounds>$<22 salt + 31 hash>
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/);
      expect(hash).toHaveLength(60);

      // Verify NO trace of 64-char raw SHA-256 hex string
      expect(hash).not.toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates different hashes for identical passwords due to random salting', async () => {
      const hash1 = await hashPassword(plainPassword);
      const hash2 = await hashPassword(plainPassword);

      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(60);
      expect(hash2).toHaveLength(60);
    });

    it('verifies correct password returns true and incorrect password returns false', async () => {
      const hash = await hashPassword(plainPassword);

      const isValid = await verifyPassword(plainPassword, hash);
      const isInvalid = await verifyPassword('WrongPassword999!', hash);

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    it('handles empty or malformed inputs safely without throwing', async () => {
      expect(await verifyPassword('', '')).toBe(false);
      expect(await verifyPassword('test', '')).toBe(false);
      expect(await verifyPassword('', '$2a$10$abcdefghijklmnopqrstuu')).toBe(false);
      expect(await verifyPassword('test', 'not-a-valid-hash')).toBe(false);
    });
  });

  describe('2. Synchronous Hashing (hashPasswordSync & verifyPasswordSync)', () => {
    it('generates a valid bcrypt hash synchronously', () => {
      const hash = hashPasswordSync(plainPassword);

      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/);
      expect(hash).toHaveLength(60);
      expect(hash).not.toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates different hashes for identical passwords synchronously', () => {
      const hash1 = hashPasswordSync(plainPassword);
      const hash2 = hashPasswordSync(plainPassword);

      expect(hash1).not.toBe(hash2);
    });

    it('verifies passwords synchronously', () => {
      const hash = hashPasswordSync(plainPassword);

      expect(verifyPasswordSync(plainPassword, hash)).toBe(true);
      expect(verifyPasswordSync('WrongPassword', hash)).toBe(false);
    });

    it('interoperates between sync and async hashing and verification', async () => {
      const asyncHash = await hashPassword(plainPassword);
      const syncHash = hashPasswordSync(plainPassword);

      expect(verifyPasswordSync(plainPassword, asyncHash)).toBe(true);
      expect(await verifyPassword(plainPassword, syncHash)).toBe(true);
    });
  });
});
