/**
 * lib/auth/rate-limiter.ts
 *
 * Dedicated Brute-Force Rate Limiter for Merchant and CS Authentication.
 *
 * Security Invariants:
 * 1. SCOPED DEFENSE: Limits are scoped per (TenantSlug + Source IP) and per (Source IP)
 *    to prevent distributed dictionary attacks while preventing easy lockout-based Denial-of-Service.
 * 2. SLIDING WINDOW: Failed attempts expire dynamically after the configured window duration.
 * 3. NO CREDENTIAL LOGGING: Passwords, PINs, and sensitive payload tokens are NEVER logged.
 * 4. CLEAR OPERATIONAL HEADERS: Returns retryAfterSeconds for HTTP 429 Retry-After compliance.
 *
 * ARCHITECTURAL NOTICE / BLOCKER FOR MULTI-INSTANCE DEPLOYMENTS:
 * This module maintains an in-memory sliding window cache suitable for single-instance or local execution.
 * In a distributed, multi-container or serverless environment (e.g., multi-region Vercel / Railway replicas),
 * an external centralized store (such as Upstash Redis or a dedicated Supabase `auth_rate_limits` table)
 * is REQUIRED before multi-instance production deployment is authorized.
 */

import type { NextRequest } from 'next/server';

interface AttemptRecord {
  timestamps: number[];
}

const memoryStore = new Map<string, AttemptRecord>();

// Default configuration: 5 failed attempts per 15-minute sliding window
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 5;

// Global IP threshold: 20 failed attempts across all tenants within 15 minutes
const GLOBAL_IP_MAX_ATTEMPTS = 20;

/**
 * Extracts the real client IP address from request headers.
 */
export function extractClientIp(req: NextRequest): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  return '127.0.0.1';
}

/**
 * Checks whether an action for a given identifier is currently rate limited.
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  windowMs: number = DEFAULT_WINDOW_MS
): { isLimited: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const now = Date.now();
  const record = memoryStore.get(identifier);

  if (!record) {
    return {
      isLimited: false,
      remainingAttempts: maxAttempts,
      retryAfterSeconds: 0,
    };
  }

  // Filter out timestamps outside the active sliding window
  const activeTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  record.timestamps = activeTimestamps;

  if (activeTimestamps.length === 0) {
    memoryStore.delete(identifier);
    return {
      isLimited: false,
      remainingAttempts: maxAttempts,
      retryAfterSeconds: 0,
    };
  }

  if (activeTimestamps.length >= maxAttempts) {
    // Oldest active timestamp determines when the earliest slot frees up
    const oldest = activeTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      isLimited: true,
      remainingAttempts: 0,
      retryAfterSeconds,
    };
  }

  return {
    isLimited: false,
    remainingAttempts: maxAttempts - activeTimestamps.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Records a failed authentication attempt.
 */
export function recordFailedAttempt(
  identifier: string,
  windowMs: number = DEFAULT_WINDOW_MS
): void {
  const now = Date.now();
  const record = memoryStore.get(identifier) || { timestamps: [] };
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  record.timestamps.push(now);
  memoryStore.set(identifier, record);
}

/**
 * Resets failed attempts upon a successful login.
 */
export function resetAttempts(identifier: string): void {
  memoryStore.delete(identifier);
}

/**
 * Convenience helper to enforce rate limiting on login routes.
 * Checks both tenant-scoped and IP-level limits.
 */
export function enforceLoginRateLimit(
  req: NextRequest,
  tenantSlug: string
): { isLimited: boolean; retryAfterSeconds: number; error?: string } {
  const ip = extractClientIp(req);
  const scopedKey = `login:${tenantSlug.toLowerCase().trim()}:${ip}`;
  const ipKey = `login_ip:${ip}`;

  // 1. Check IP-wide threshold
  const ipCheck = checkRateLimit(ipKey, GLOBAL_IP_MAX_ATTEMPTS, DEFAULT_WINDOW_MS);
  if (ipCheck.isLimited) {
    return {
      isLimited: true,
      retryAfterSeconds: ipCheck.retryAfterSeconds,
      error: `Terlalu banyak percobaan login dari alamat IP Anda. Silakan coba kembali dalam ${ipCheck.retryAfterSeconds} detik.`,
    };
  }

  // 2. Check Tenant-specific threshold
  const tenantCheck = checkRateLimit(scopedKey, DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS);
  if (tenantCheck.isLimited) {
    return {
      isLimited: true,
      retryAfterSeconds: tenantCheck.retryAfterSeconds,
      error: `Terlalu banyak percobaan PIN yang salah untuk toko ini. Akun dikunci sementara untuk keamanan. Silakan coba lagi dalam ${tenantCheck.retryAfterSeconds} detik.`,
    };
  }

  return {
    isLimited: false,
    retryAfterSeconds: 0,
  };
}

/**
 * Records a failed attempt for both tenant-scoped and IP-level keys.
 */
export function recordLoginFailure(req: NextRequest, tenantSlug: string): void {
  const ip = extractClientIp(req);
  const scopedKey = `login:${tenantSlug.toLowerCase().trim()}:${ip}`;
  const ipKey = `login_ip:${ip}`;

  recordFailedAttempt(scopedKey, DEFAULT_WINDOW_MS);
  recordFailedAttempt(ipKey, DEFAULT_WINDOW_MS);
}

/**
 * Resets attempts on successful authentication.
 */
export function recordLoginSuccess(req: NextRequest, tenantSlug: string): void {
  const ip = extractClientIp(req);
  const scopedKey = `login:${tenantSlug.toLowerCase().trim()}:${ip}`;
  resetAttempts(scopedKey);
}

/**
 * For testing and test isolation only: clears all rate limit states.
 */
export function clearAllRateLimits(): void {
  memoryStore.clear();
}
