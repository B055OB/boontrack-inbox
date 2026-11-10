/**
 * __tests__/security/fetch_mock_safety.test.ts
 *
 * Verification Suite for CTO Work Order BWM Phase 6.1N.2:
 * - Gate A: Global Fetch Mock Safety (Host, path, and method allowlist; negative tests; zero egress)
 * - Gate B: Database Target Safety Guard (assertStagingDatabaseTarget against real function)
 */

import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';

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
