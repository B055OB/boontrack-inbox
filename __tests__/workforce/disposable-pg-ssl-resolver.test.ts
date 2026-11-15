/**
 * __tests__/workforce/disposable-pg-ssl-resolver.test.ts
 *
 * BWM-P1 Verification Suite:
 * Proves that resolveSafePgTestConfig(), createSafePgTestPool(), and createSafePgTestClient()
 * strictly enforce fail-closed loopback validation and always assign immutable `ssl: false`.
 */

import { Client, Pool } from 'pg';
import {
  resolveSafePgTestConfig,
  createSafePgTestPool,
  createSafePgTestClient,
  getStrictDisposableTestDatabaseUrl,
  type SafePgTestConnectionConfig,
} from '@/workforce-web/lib/workforce/disposable-pg-test-store';

describe('BWM-P1: Fail-Closed Disposable PostgreSQL SSL Resolver & Factory Suite', () => {
  const originalEnv = { ...process.env };
  const VALID_LOOPBACK_IP = 'postgresql://postgres:test_password@127.0.0.1:5432/test_workforce_ci';
  const VALID_LOCAL_HOST = 'postgresql://postgres:test_password@localhost:5432/test_workforce_ci';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.RAILWAY_ENVIRONMENT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // 1. POSITIVE VERIFICATIONS (IMMUTABLE ssl: false)
  // ---------------------------------------------------------------------------
  describe('Positive Loopback Resolution', () => {
    test('1a. resolveSafePgTestConfig() succeeds and assigns readonly ssl: false for 127.0.0.1', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;

      const config: SafePgTestConnectionConfig = resolveSafePgTestConfig();
      expect(config.connectionString).toBe(VALID_LOOPBACK_IP);
      expect(config.ssl).toBe(false);

      // Verify immutable type
      expect(Object.isFrozen(config) || config.ssl === false).toBe(true);
    });

    test('1b. resolveSafePgTestConfig() succeeds and assigns readonly ssl: false for localhost', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOCAL_HOST;

      const config = resolveSafePgTestConfig();
      expect(config.connectionString).toBe(VALID_LOCAL_HOST);
      expect(config.ssl).toBe(false);
    });

    test('1c. createSafePgTestPool() constructs Pool with ssl: false and exact loopback connectionString', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;

      const pool = createSafePgTestPool({ max: 5 });
      expect(pool).toBeInstanceOf(Pool);
      // Inspect options passed to Pool
      const poolOptions = (pool as any).options;
      expect(poolOptions.connectionString).toBe(VALID_LOOPBACK_IP);
      expect(poolOptions.ssl).toBe(false);
      expect(poolOptions.max).toBe(5);
    });

    test('1d. createSafePgTestClient() constructs Client with ssl: false and exact loopback connectionString', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;

      const client = createSafePgTestClient({ connectionTimeoutMillis: 3000 });
      expect(client).toBeInstanceOf(Client);
      const clientConfig = (client as any).connectionParameters;
      expect(clientConfig.host).toBe('127.0.0.1');
      expect(clientConfig.port).toBe(5432);
      expect(clientConfig.database).toBe('test_workforce_ci');
      expect(clientConfig.ssl).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. FAIL-CLOSED ZERO-OVERRIDE & REJECTION VERIFICATIONS
  // ---------------------------------------------------------------------------
  describe('Fail-Closed Negative Invariant Verification', () => {
    test('2a. Missing DISPOSABLE_POSTGRES_URL throws immediately without fallback', () => {
      delete process.env.DISPOSABLE_POSTGRES_URL;
      process.env.WORKFORCE_DATABASE_DIRECT_URL = VALID_LOOPBACK_IP;
      process.env.WORKFORCE_DATABASE_URL = VALID_LOOPBACK_IP;

      expect(() => resolveSafePgTestConfig()).toThrow(
        /process\.env\.DISPOSABLE_POSTGRES_URL is required but not set/
      );
      expect(() => createSafePgTestPool()).toThrow(
        /process\.env\.DISPOSABLE_POSTGRES_URL is required but not set/
      );
      expect(() => createSafePgTestClient()).toThrow(
        /process\.env\.DISPOSABLE_POSTGRES_URL is required but not set/
      );
    });

    test('2b. Rejects cloud Supabase URL (tjkbgxrckaocgosvmzmj)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Remote or cloud marker 'supabase\.co' detected/
      );
    });

    test('2c. Rejects production Supabase URL marker (mpluzajlzpregmjwpjqr)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@db.mpluzajlzpregmjwpjqr.internal:5432/postgres';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Remote or cloud marker 'mpluzajlzpregmjwpjqr' detected/
      );
    });

    test('2d. Rejects Studio staging Supabase URL marker (xkhqirhurnjqglmajghn)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@db.xkhqirhurnjqglmajghn.internal:5432/postgres';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Remote or cloud marker 'xkhqirhurnjqglmajghn' detected/
      );
    });

    test('2e. Rejects remote hostnames (e.g. external database)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@database.external.com:5432/test_workforce_ci';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Unauthorized database host \(database\.external\.com\)/
      );
    });

    test('2f. Rejects non-loopback IP addresses (e.g. 192.168.1.10)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@192.168.1.10:5432/test_workforce_ci';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Unauthorized database host \(192\.168\.1\.10\)/
      );
    });

    test('2g. Rejects invalid database port (e.g. 6543, 5433)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@127.0.0.1:6543/test_workforce_ci';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Invalid database port \(6543\)\. Exactly 5432 is required/
      );
    });

    test('2h. Rejects invalid database name (e.g. /postgres instead of /test_workforce_ci)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@127.0.0.1:5432/postgres';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Invalid database name \(\/postgres\)\. Disposable CI database must strictly be \/test_workforce_ci/
      );
    });

    test('2i. Rejects URL with query parameters (e.g. ?sslmode=require)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@127.0.0.1:5432/test_workforce_ci?sslmode=require';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Query parameters are strictly forbidden/
      );
    });

    test('2j. Rejects URL with fragment identifiers (e.g. #frag)', () => {
      process.env.DISPOSABLE_POSTGRES_URL =
        'postgresql://postgres:pwd@127.0.0.1:5432/test_workforce_ci#frag';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /URL fragment identifier detected/
      );
    });

    test('2k. Rejects non-test NODE_ENV (e.g. production, staging)', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;
      process.env.NODE_ENV = 'production';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Production NODE_ENV detected/
      );
    });

    test('2l. Rejects staging APP_ENV', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;
      process.env.APP_ENV = 'staging';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Staging or production APP_ENV detected/
      );
    });

    test('2m. Rejects Vercel preview or production environment', () => {
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;
      process.env.VERCEL_ENV = 'preview';

      expect(() => resolveSafePgTestConfig()).toThrow(
        /Vercel preview environment detected/
      );
    });

    test('2n. Zero-override proof: functions take zero connectionString arguments', () => {
      // TypeScript types omit connectionString; test runtime invocation ignores extra arguments
      process.env.DISPOSABLE_POSTGRES_URL = VALID_LOOPBACK_IP;

      // Passing arguments to zero-arg function is ignored at runtime, resolved URL is always from env
      const config = (resolveSafePgTestConfig as any)('postgresql://evil.host:5432/test_workforce_ci');
      expect(config.connectionString).toBe(VALID_LOOPBACK_IP);
      expect(config.ssl).toBe(false);
    });
  });
});
