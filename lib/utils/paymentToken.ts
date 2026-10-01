/**
 * Secure Public Payment Token Generator
 * 
 * Rules:
 * Generates an opaque, URL-safe payment token (e.g. pay_k7m4v9w2q8x5n1p3).
 * Protects database privacy: never exposes raw UUID or internal IDs in public URLs.
 */

export function generatePaymentToken(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let token = 'pay_';

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length; i++) {
      token += chars.charAt(array[i] % chars.length);
    }
  } else {
    for (let i = 0; i < 16; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  return token;
}
