/**
 * __tests__/security/fetch_mock_safety.test.ts
 *
 * Verification Suite for CTO Work Order BWM Phase 6.1N.2:
 * - Gate A: Global Fetch Mock Safety (Host, path, and method allowlist; negative tests; zero egress)
 * - Gate B: Database Target Safety Guard (assertStagingDatabaseTarget against real function)
 */

import fs from 'fs';
import path from 'path';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';

let assertDisposableDatabaseTarget: (connStr: string) => boolean;

describe('BWM Phase 6.1N.2 — Gate A: Global Fetch Mock Safety', () => {
  it('A.1 Rejects unrecognized external hostname and fails closed with fatal error', async () => {
    const maliciousHost = 'https://malicious-external-api.com/v1/exfiltrate-tokens';
    await expect(fetch(maliciousHost)).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Blocked unapproved network request: GET https://malicious-external-api.com/v1/exfiltrate-tokens'
    );
  });

  it('A.2 Rejects unapproved path on an allowlisted host (Gemini & Telegram fail-closed)', async () => {
    // Unapproved path on generativelanguage.googleapis.com
    await expect(
      fetch('https://generativelanguage.googleapis.com/v1beta/unapproved_path', { method: 'POST' })
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Unapproved path on generativelanguage.googleapis.com');

    // Unapproved path on api.telegram.org
    await expect(
      fetch('https://api.telegram.org/bot12345/unapproved_endpoint', { method: 'POST' })
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Unapproved path on api.telegram.org');
  });

  it('A.3 Rejects unapproved HTTP method on allowlisted paths (Gemini GET, QuickChart POST, Xendit GET)', async () => {
    // Gemini with GET instead of POST
    await expect(
      fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent', { method: 'GET' })
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Method GET not permitted for Gemini API');

    // QuickChart with POST instead of GET
    await expect(
      fetch('https://quickchart.io/qr?text=hello', { method: 'POST' })
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Method POST not permitted for QuickChart');

    // Xendit with GET instead of POST
    const xenditGetRes = await fetch('https://api.xendit.co/qr_codes', {
      method: 'GET',
      headers: { Authorization: 'Basic eG5kX21vY2s6' },
    });
    expect(xenditGetRes.status).toBe(405);
    const xenditGetData = await xenditGetRes.json();
    expect(xenditGetData.error_code).toBe('METHOD_NOT_ALLOWED');
  });

  it('A.4 Rejects unapproved payment endpoint on payment gateway (403 Forbidden)', async () => {
    const unapprovedPaymentUrl = 'https://api.xendit.co/v2/unapproved_payout_drain';
    const res = await fetch(unapprovedPaymentUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic eG5kX21vY2tfa2V5Og==',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 1000000 }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error_code).toBe('UNAPPROVED_ENDPOINT');
  });

  it('A.5 Rejects payment request missing Authorization header (401 Unauthorized)', async () => {
    const res = await fetch('https://api.xendit.co/qr_codes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 249000, reference_id: 'REF-TEST-001' }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error_code).toBe('UNAUTHORIZED');
  });

  it('A.6 Rejects invalid financial amount <= 0 (400 Bad Request)', async () => {
    const resZero = await fetch('https://api.xendit.co/qr_codes', {
      method: 'POST',
      headers: {
        Authorization: 'Basic eG5kX21vY2tfa2V5Og==',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, reference_id: 'REF-ZERO' }),
    });

    expect(resZero.ok).toBe(false);
    expect(resZero.status).toBe(400);
    const dataZero = await resZero.json();
    expect(dataZero.error_code).toBe('INVALID_AMOUNT');

    const resNegative = await fetch('https://api.xendit.co/qr_codes', {
      method: 'POST',
      headers: {
        Authorization: 'Basic eG5kX21vY2tfa2V5Og==',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: -50000, reference_id: 'REF-NEG' }),
    });

    expect(resNegative.ok).toBe(false);
    expect(resNegative.status).toBe(400);
    const dataNeg = await resNegative.json();
    expect(dataNeg.error_code).toBe('INVALID_AMOUNT');
  });

  it('A.7 Accepts authorized payment request and preserves financial assertions', async () => {
    const res = await fetch('https://api.xendit.co/qr_codes', {
      method: 'POST',
      headers: {
        Authorization: 'Basic eG5kX21vY2tfa2V5Og==',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 159000, reference_id: 'ORDER-STAGING-999' }),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.amount).toBe(159000);
    expect(data.reference_id).toBe('ORDER-STAGING-999');
    expect(data.qr_string).toContain('000201010212');
  });

  it('A.8 Allows authorized internal endpoints and mock providers with exact paths and methods', async () => {
    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent', {
      method: 'POST',
    });
    expect(geminiRes.ok).toBe(true);

    const telegramRes = await fetch('https://api.telegram.org/bot12345/sendMessage', {
      method: 'POST',
    });
    expect(telegramRes.ok).toBe(true);

    const quickchartRes = await fetch('https://quickchart.io/qr?text=test', {
      method: 'GET',
    });
    expect(quickchartRes.ok).toBe(true);

    const internalRes = await fetch('http://localhost:3000/api/v1/tenants/demo/ping');
    expect(internalRes.ok).toBe(true);
  });
});

describe('BWM Phase 6.1N.7.1 — Mission C: Adversarial Fetch Interceptor Hardening', () => {
  const originalEnv = process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP;

  afterEach(() => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = originalEnv;
  });

  it('C.1 Rejects malicious host attempting substring path spoofing https://evil.example/localhost:3000/', async () => {
    await expect(
      fetch('https://evil.example/localhost:3000/auth/v1/signup')
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Blocked unapproved network request: GET https://evil.example/localhost:3000/auth/v1/signup');
  });

  it('C.2 Rejects malicious subdomain attempting substring host spoofing http://localhost:3000.evil.example/', async () => {
    await expect(
      fetch('http://localhost:3000.evil.example/rest/v1/tenants')
    ).rejects.toThrow(/\[SECURITY FAIL-CLOSED\]/);

    // Also test valid DNS subdomain spoofing
    await expect(
      fetch('http://localhost.evil.example/rest/v1/tenants')
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Blocked unapproved network request: GET http://localhost.evil.example/rest/v1/tenants');
  });

  it('C.3 Rejects external host with query string target spoofing ?target=api.boontrack.com', async () => {
    await expect(
      fetch('https://evil-analytics.org/log?target=api.boontrack.com')
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Blocked unapproved network request: GET https://evil-analytics.org/log?target=api.boontrack.com');
  });

  it('C.4 Rejects non-standard port on localhost (e.g. localhost:3001)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('http://localhost:3001/rest/v1/tenants')
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Blocked unapproved network request: GET http://localhost:3001/rest/v1/tenants');
  });

  it('C.5 Rejects invalid protocol on ephemeral gateway (https://localhost:3000)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('https://localhost:3000/rest/v1/tenants')
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Blocked unapproved network request: GET https://localhost:3000/rest/v1/tenants');
  });

  it('C.6 Rejects unapproved internal path outside allowlist (e.g. /admin/v1/secret)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('http://localhost:3000/admin/v1/secret')
    ).rejects.toThrow('[SECURITY FAIL-CLOSED] Unapproved internal path: GET /admin/v1/secret');
  });

  it('C.7 Rejects ephemeral gateway call when BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP is not enabled', async () => {
    delete process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP;
    await expect(
      fetch('http://localhost:3000/rest/v1/tenants')
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Ephemeral Supabase gateway request blocked: BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP is not enabled: GET http://localhost:3000/rest/v1/tenants'
    );
  });

  it('C.8 Rejects unapproved method on approved endpoint (DELETE /rest/v1/tenants)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('http://localhost:3000/rest/v1/tenants', { method: 'DELETE' })
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Unapproved endpoint or method on ephemeral gateway: DELETE /rest/v1/tenants'
    );
  });

  it('C.9 Rejects unapproved method on auth endpoint (GET /auth/v1/admin/users)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('http://localhost:3000/auth/v1/admin/users', { method: 'GET' })
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Unapproved endpoint or method on ephemeral gateway: GET /auth/v1/admin/users'
    );
  });

  it('C.10 Rejects unapproved endpoint on ephemeral gateway (GET /rest/v1/unapproved_table)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('http://localhost:3000/rest/v1/unapproved_table', { method: 'GET' })
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Unapproved endpoint or method on ephemeral gateway: GET /rest/v1/unapproved_table'
    );
  });

  it('C.11 Rejects non-UUID path on DELETE /auth/v1/admin/users/{uuid}', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    await expect(
      fetch('http://localhost:3000/auth/v1/admin/users/not-a-valid-uuid', { method: 'DELETE' })
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Unapproved endpoint or method on ephemeral gateway: DELETE /auth/v1/admin/users/not-a-valid-uuid'
    );
  });

  it('C.12 Respects Request object method extraction (prefers init.method, falls back to input.method)', async () => {
    process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
    // input is an object with method 'DELETE', but init overrides with 'POST' -> rejected with 'POST'
    await expect(
      fetch({ url: 'http://localhost:3000/rest/v1/tenants', method: 'DELETE' } as any, { method: 'POST' })
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Unapproved endpoint or method on ephemeral gateway: POST /rest/v1/tenants'
    );

    // input has method 'DELETE' and no init -> rejected with 'DELETE'
    await expect(
      fetch({ url: 'http://localhost:3000/rest/v1/tenants', method: 'DELETE' } as any)
    ).rejects.toThrow(
      '[SECURITY FAIL-CLOSED] Unapproved endpoint or method on ephemeral gateway: DELETE /rest/v1/tenants'
    );
  });
});

describe('BWM Phase 6.1N.2 — Gate B: Database Target Safety Guard (Real Implementation)', () => {
  it('B.1 Accepts Disposable PostgreSQL connection strictly when using dedicated database test_workforce_ci', () => {
    const disposableUrl1 = 'postgres://postgres:disposable_ci_password_2026@localhost:5432/test_workforce_ci';
    expect(() => assertStagingDatabaseTarget(disposableUrl1)).not.toThrow();

    const disposableUrl2 = 'postgresql://postgres:disposable_ci_password_2026@127.0.0.1:5432/test_workforce_ci';
    expect(() => assertStagingDatabaseTarget(disposableUrl2)).not.toThrow();
  });

  it('B.2 Rejects generic loopback database name "postgres" (prevents generic acceptance by hostname alone)', () => {
    const genericLoopbackUrl = 'postgres://postgres:pass@localhost:5432/postgres';
    expect(() => assertStagingDatabaseTarget(genericLoopbackUrl)).toThrow(
      '[STAGING GUARD FATAL] Invalid database name (postgres) for disposable local container. Disposable CI database must strictly use dedicated name \'test_workforce_ci\'.'
    );
  });

  it('B.3 Rejects arbitrary loopback database name "my_local_db"', () => {
    const arbitraryDbUrl = 'postgresql://postgres:pass@localhost:5432/my_local_db';
    expect(() => assertStagingDatabaseTarget(arbitraryDbUrl)).toThrow(
      '[STAGING GUARD FATAL] Invalid database name (my_local_db) for disposable local container.'
    );
  });

  it('B.4 Strictly rejects production database connection string (mpluzajlzpregmjwpjqr)', () => {
    const prodUrl = 'postgresql://postgres:prodpassword@db.mpluzajlzpregmjwpjqr.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(prodUrl)).toThrow(
      '[STAGING GUARD FATAL] Connection string targets production database (mpluzajlzpregmjwpjqr)'
    );
  });

  it('B.5 Strictly rejects Studio staging database connection string (xkhqirhurnjqglmajghn)', () => {
    const studioUrl = 'postgresql://postgres:studiopassword@db.xkhqirhurnjqglmajghn.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(studioUrl)).toThrow(
      '[STAGING GUARD FATAL] Connection string targets Studio staging (xkhqirhurnjqglmajghn)'
    );
  });

  it('B.6 Strictly rejects malformed database connection URL', () => {
    expect(() => assertStagingDatabaseTarget('not-a-valid-connection-string')).toThrow(
      '[STAGING GUARD FATAL] Malformed database connection URL'
    );
    expect(() => assertStagingDatabaseTarget('')).toThrow(
      '[STAGING GUARD FATAL] Database connection string is empty'
    );
  });

  it('B.7 Strictly rejects rogue third-party database host', () => {
    const rogueUrl = 'postgresql://postgres:roguepass@db.rogueattackerproject.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(rogueUrl)).toThrow(
      '[STAGING GUARD FATAL] Connection string hostname'
    );
  });

  it('B.8 Strictly rejects disposable local container with non-standard port (5433)', () => {
    const badPortDisposable = 'postgres://postgres:pass@localhost:5433/test_workforce_ci';
    expect(() => assertStagingDatabaseTarget(badPortDisposable)).toThrow(
      '[STAGING GUARD FATAL] Invalid port (5433) for disposable local container. Expected 5432. Abort.'
    );
  });
});

describe('BWM Phase 6.1N.7.2 — Mission B: Disposable Database Target Guard Allowlist (assertDisposableDatabaseTarget)', () => {
  beforeAll(() => {
    const fileContent = fs.readFileSync(
      path.resolve('scripts/verify-disposable-postgres-ci.mjs'),
      'utf8'
    );
    const fnMatch = fileContent.match(/export function assertDisposableDatabaseTarget[\s\S]*?\n\}/);
    if (!fnMatch) {
      throw new Error('Could not find assertDisposableDatabaseTarget in verify-disposable-postgres-ci.mjs');
    }
    const fnCode = fnMatch[0].replace('export function', 'function');
    const createFn = new Function(`${fnCode}\nreturn assertDisposableDatabaseTarget;`);
    assertDisposableDatabaseTarget = createFn();
  });

  it('D.1 Accepts valid disposable connection string with user postgres', () => {
    const valid1 = 'postgres://postgres:disposable_ci_password_2026@localhost:5432/test_workforce_ci';
    expect(() => assertDisposableDatabaseTarget(valid1)).not.toThrow();

    const valid2 = 'postgresql://postgres:disposable_ci_password_2026@127.0.0.1:5432/test_workforce_ci';
    expect(() => assertDisposableDatabaseTarget(valid2)).not.toThrow();
  });

  it('D.2 Accepts valid disposable connection string with user authenticator', () => {
    const validAuth = 'postgresql://authenticator:authenticator_password_disposable_ci_2026@localhost:5432/test_workforce_ci';
    expect(() => assertDisposableDatabaseTarget(validAuth)).not.toThrow();

    const validAuthLoopback = 'postgres://authenticator:authenticator_password_disposable_ci_2026@127.0.0.1:5432/test_workforce_ci';
    expect(() => assertDisposableDatabaseTarget(validAuthLoopback)).not.toThrow();
  });

  it('D.3 Rejects invalid protocol (http, mysql, etc.)', () => {
    expect(() =>
      assertDisposableDatabaseTarget('http://postgres:pass@localhost:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Invalid protocol (http:). Expected postgres: or postgresql:.');

    expect(() =>
      assertDisposableDatabaseTarget('mysql://postgres:pass@localhost:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Invalid protocol (mysql:). Expected postgres: or postgresql:.');
  });

  it('D.4 Rejects unauthorized hosts (staging Supabase, production, cloud hosts)', () => {
    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Unauthorized database host (db.tjkbgxrckaocgosvmzmj.supabase.co). Only localhost or 127.0.0.1 is authorized.');

    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@db.mpluzajlzpregmjwpjqr.supabase.co:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Unauthorized database host (db.mpluzajlzpregmjwpjqr.supabase.co). Only localhost or 127.0.0.1 is authorized.');

    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Unauthorized database host');
  });

  it('D.5 Rejects non-5432 port or missing port', () => {
    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@localhost:5433/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Invalid database port (5433). Exactly 5432 is required.');

    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@localhost/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Invalid database port (default). Exactly 5432 is required.');
  });

  it('D.6 Rejects generic or unauthorized database name (e.g. postgres, production)', () => {
    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@localhost:5432/postgres')
    ).toThrow('[DISPOSABLE GUARD FATAL] Invalid database name (/postgres). Disposable CI database must strictly be /test_workforce_ci.');

    expect(() =>
      assertDisposableDatabaseTarget('postgres://postgres:pass@localhost:5432/production_db')
    ).toThrow('[DISPOSABLE GUARD FATAL] Invalid database name (/production_db). Disposable CI database must strictly be /test_workforce_ci.');
  });

  it('D.7 Rejects unauthorized database username (e.g. root, service_role, anon)', () => {
    expect(() =>
      assertDisposableDatabaseTarget('postgres://root:pass@localhost:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Unauthorized database user (root). Only postgres or authenticator is permitted.');

    expect(() =>
      assertDisposableDatabaseTarget('postgres://service_role:pass@localhost:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Unauthorized database user (service_role). Only postgres or authenticator is permitted.');

    expect(() =>
      assertDisposableDatabaseTarget('postgres://anon:pass@localhost:5432/test_workforce_ci')
    ).toThrow('[DISPOSABLE GUARD FATAL] Unauthorized database user (anon). Only postgres or authenticator is permitted.');
  });

  it('D.8 Rejects empty, whitespace, or malformed connection strings', () => {
    expect(() => assertDisposableDatabaseTarget('')).toThrow(
      '[DISPOSABLE GUARD FATAL] Database connection string is empty or invalid.'
    );
    expect(() => assertDisposableDatabaseTarget('   ')).toThrow(
      '[DISPOSABLE GUARD FATAL] Database connection string is empty or invalid.'
    );
    expect(() => assertDisposableDatabaseTarget('not-a-valid-url')).toThrow(
      '[DISPOSABLE GUARD FATAL] Malformed database connection URL'
    );
  });

  it('D.9 Strictly rejects manipulative query parameters attempting to override host, hostaddr, port, or user (Mission A)', () => {
    expect(() =>
      assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?hostaddr=1.2.3.4')
    ).toThrow('[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "hostaddr"');

    expect(() =>
      assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?host=remote.db')
    ).toThrow('[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "host"');

    expect(() =>
      assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?port=5433')
    ).toThrow('[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "port"');

    expect(() =>
      assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?user=root')
    ).toThrow('[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "user"');

    expect(() =>
      assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?dbname=evil_db')
    ).toThrow('[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "dbname"');

    expect(() =>
      assertDisposableDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_workforce_ci?HostAddr=1.2.3.4')
    ).toThrow('[DISPOSABLE GUARD FATAL] Manipulative query parameter detected: "HostAddr"');
  });
});
