/**
 * scripts/disposable-database-guard.mjs
 * BWM Phase 6.1N.7.6R — Single Authoritative Disposable Database Guard
 *
 * Requirements:
 * 1. Loopback host only (localhost or 127.0.0.1).
 * 2. Port 5432 only.
 * 3. Database test_workforce_ci only.
 * 4. Username postgres or authenticator only.
 * 5. No .env.local fallback.
 * 6. No staging, production, pooler, or external database target.
 * 7. Reject unexpected query parameters and URL fragments.
 * 8. NEVER include passwords or complete connection strings in error messages.
 */

import { assertDisposableDatabaseTarget } from './verify-disposable-postgres-ci.mjs';

export { assertDisposableDatabaseTarget };

/**
 * Retrieves and validates the connection string from WORKFORCE_DATABASE_DIRECT_URL.
 * Throws DISPOSABLE_DB_REQUIRED if the variable is unset or empty.
 *
 * @returns {string} Sanitized connection string
 */
export function getDisposableDatabaseConnectionString() {
  const directUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;
  if (!directUrl || !directUrl.trim()) {
    throw new Error('DISPOSABLE_DB_REQUIRED: WORKFORCE_DATABASE_DIRECT_URL environment variable is required for tenant operational regression test');
  }
  return assertDisposableDatabaseTarget(directUrl);
}
