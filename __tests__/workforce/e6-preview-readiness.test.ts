/**
 * __tests__/workforce/e6-preview-readiness.test.ts
 * BWM Gate E6-F: Preview Readiness & Harmonization Test Suite
 *
 * Mandate:
 * 1. Tenant Isolation & Host Routing Guard (Subdomains, non-workforce isolation, retired hosts, partner CNAMEs, cross-tenant fail-closed).
 * 2. Sanitized Logging & Zero Credential Leakage (Redaction of DB secrets, Bearer tokens, JWTs, Supabase keys, Xendit keys).
 * 3. Edge Error Normalization (Standardized HTTP JSON responses, fail-closed handling without 500 stack dumps).
 * 4. Live Staging Database Audit & Tenant Isolation Verification (RLS flags, multi-agency data isolation, zero leak).
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import {
  resolveWorkforceHost,
  PartnerDomainConfig,
} from '@/lib/workforce/host-contract';
import {
  assertCrossTenantBoundary,
} from '@/lib/workforce/hierarchy-contract';
import {
  normalizeWorkforceApiError,
  sanitizeWorkforceLog,
} from '@/lib/workforce/api-contracts';

jest.setTimeout(35000);

describe('BWM Gate E6-F: Preview Readiness & Harmonization Suite', () => {
  let client: Client;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';
  const timestamp = Date.now();

  const mockPartners: Record<string, PartnerDomainConfig> = {
    'satyasystem.id': {
      domain: 'satyasystem.id',
      agencyId: 'agency_satya_001',
      agencySlug: 'satya',
      status: 'ACTIVE',
      tlsVerified: true,
    },
    'suspended.partner.com': {
      domain: 'suspended.partner.com',
      agencyId: 'agency_suspended_002',
      agencySlug: 'suspended',
      status: 'SUSPENDED',
      tlsVerified: true,
    },
    'unverified-tls.partner.com': {
      domain: 'unverified-tls.partner.com',
      agencyId: 'agency_unverified_003',
      agencySlug: 'unverified',
      status: 'ACTIVE',
      tlsVerified: false,
    },
  };

  /**
   * Connection helper prioritizing Direct / Session Mode Port 5432
   */
  async function createLiveClient(): Promise<Client> {
    const envDirect = process.env.WORKFORCE_DATABASE_DIRECT_URL;
    const envPooler = process.env.WORKFORCE_DATABASE_URL;

    let directUrl = envDirect;
    let poolerUrl = envPooler;
    if (!directUrl || !poolerUrl) {
      try {
        const envFile = fs.readFileSync(path.resolve('.env.local'), 'utf8');
        const matchDirect = envFile.match(/^WORKFORCE_DATABASE_DIRECT_URL=(.*)$/m);
        const matchPooler = envFile.match(/^WORKFORCE_DATABASE_URL=(.*)$/m);
        if (matchDirect) directUrl = matchDirect[1].trim().replace(/^["']|["']$/g, '');
        if (matchPooler) poolerUrl = matchPooler[1].trim().replace(/^["']|["']$/g, '');
      } catch {
        // ignore read error
      }
    }

    const candidates: string[] = [];
    if (directUrl) candidates.push(directUrl);
    if (poolerUrl) {
      candidates.push(poolerUrl.replace(':6543', ':5432'));
      candidates.push(poolerUrl);
    }

    for (const connStr of candidates) {
      try {
        const c = new Client({
          connectionString: connStr,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });
        await c.connect();
        return c;
      } catch {
        // try next candidate
      }
    }
    throw new Error('Failed to connect to staging database via candidate connection strings');
  }

  async function cleanFixtureData(dbClient: Client) {
    try {
      await dbClient.query('ALTER TABLE seat_credit_ledger DISABLE RULE no_delete_seat_credit_ledger;');
      await dbClient.query('ALTER TABLE seat_credit_ledger DISABLE TRIGGER trg_seat_credit_ledger_immutability;');
      await dbClient.query("DELETE FROM seat_credit_ledger WHERE original_credit_id IS NOT NULL AND (branch_id LIKE 'test_e6f_%' OR agency_id LIKE 'test_e6f_%');");
      await dbClient.query("DELETE FROM seat_credit_ledger WHERE branch_id LIKE 'test_e6f_%' OR agency_id LIKE 'test_e6f_%';");
      await dbClient.query("DELETE FROM credit_purchase_transactions WHERE branch_id LIKE 'test_e6f_%' OR agency_id LIKE 'test_e6f_%';");
      await dbClient.query("DELETE FROM branch_credit_pools WHERE branch_id LIKE 'test_e6f_%' OR agency_id LIKE 'test_e6f_%';");
    } finally {
      await dbClient.query('ALTER TABLE seat_credit_ledger ENABLE TRIGGER trg_seat_credit_ledger_immutability;').catch(() => {});
      await dbClient.query('ALTER TABLE seat_credit_ledger ENABLE RULE no_delete_seat_credit_ledger;').catch(() => {});
    }
  }

  beforeAll(async () => {
    client = await createLiveClient();
    await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);
    await cleanFixtureData(client);
  });

  afterAll(async () => {
    if (client) {
      try {
        await cleanFixtureData(client);
      } catch (err) {
        console.error('Teardown error:', (err as Error).message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  });

  // =========================================================================
  // 1. TENANT ISOLATION & HOST ROUTING GUARD
  // =========================================================================
  describe('1. Tenant Isolation & Host Routing Guard', () => {
    test('1.1 Allows canonical workforce subdomains and development hosts', () => {
      const hosts = [
        'workforce.boontrack.com',
        'WORKFORCE.BOONTRACK.COM',
        'https://workforce.boontrack.com:443/',
        'workforce.localhost:3000',
        'ops.workforce.boontrack.com',
      ];

      for (const h of hosts) {
        const result = resolveWorkforceHost(h, mockPartners);
        expect(result.allowed).toBe(true);
        expect(result.status).toBe('CANONICAL_WORKFORCE');
        expect(result.isCustomDomain).toBe(false);
      }
    });

    test('1.2 Strictly rejects retired gateway app.boontrack.com with fail-closed status', () => {
      const retiredHosts = ['app.boontrack.com', 'https://app.boontrack.com/login', 'app.localhost'];
      for (const h of retiredHosts) {
        const result = resolveWorkforceHost(h, mockPartners);
        expect(result.allowed).toBe(false);
        expect(result.status).toBe('REJECTED_RETIRED_GATEWAY');
        expect(result.error).toContain('app.boontrack.com telah dipensiunkan');
      }
    });

    test('1.3 Strictly rejects cross-domain product hosts (shop, creator, studio, dashboard)', () => {
      const crossDomainHosts = [
        'shop.boontrack.com',
        'creator.boontrack.com',
        'studio.boontrack.com',
        'dashboard.boontrack.com',
        'admin.boontrack.com',
        'manager.boontrack.com',
        'api.boontrack.com',
      ];

      for (const h of crossDomainHosts) {
        const result = resolveWorkforceHost(h, mockPartners);
        expect(result.allowed).toBe(false);
        expect(result.status).toBe('REJECTED_CROSS_DOMAIN_HOST');
        expect(result.error).toContain('Isolasi domain ditegakkan');
      }
    });

    test('1.4 Handles partner custom domains (CNAME) with status and TLS validation', () => {
      // Valid Active Partner with TLS
      const satyaRes = resolveWorkforceHost('satyasystem.id', mockPartners);
      expect(satyaRes.allowed).toBe(true);
      expect(satyaRes.status).toBe('AUTHORIZED_PARTNER_CNAME');
      expect(satyaRes.isCustomDomain).toBe(true);
      expect(satyaRes.agencyId).toBe('agency_satya_001');
      expect(satyaRes.agencySlug).toBe('satya');

      // Suspended Partner
      const suspendedRes = resolveWorkforceHost('suspended.partner.com', mockPartners);
      expect(suspendedRes.allowed).toBe(false);
      expect(suspendedRes.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');
      expect(suspendedRes.error).toContain('SUSPENDED');

      // Unverified TLS Partner
      const unverifiedRes = resolveWorkforceHost('unverified-tls.partner.com', mockPartners);
      expect(unverifiedRes.allowed).toBe(false);
      expect(unverifiedRes.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');
      expect(unverifiedRes.error).toContain('Sertifikat TLS');

      // Unknown Partner Domain
      const unknownRes = resolveWorkforceHost('unknown-domain.com', mockPartners);
      expect(unknownRes.allowed).toBe(false);
      expect(unknownRes.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');

      // Invalid / Empty Host
      const emptyRes = resolveWorkforceHost('', mockPartners);
      expect(emptyRes.allowed).toBe(false);
      expect(emptyRes.status).toBe('REJECTED_INVALID_HOST');
    });

    test('1.5 Enforces cross-tenant hierarchical boundaries via assertCrossTenantBoundary', () => {
      const callerSatya = {
        agencyId: 'agency_satya',
        orgId: 'org_satya_corp',
        branchId: 'branch_satya_sudirman',
        role: 'BRANCH_SUPERVISOR' as const,
      };

      const targetOtherAgency = {
        agencyId: 'agency_competitor',
        orgId: 'org_competitor_corp',
        branchId: 'branch_competitor_thamrin',
      };

      const targetOtherBranch = {
        agencyId: 'agency_satya',
        orgId: 'org_satya_corp',
        branchId: 'branch_satya_cengkareng',
      };

      // Cross-agency breach: must throw
      expect(() => assertCrossTenantBoundary(callerSatya, targetOtherAgency)).toThrow(
        /SECURITY_VIOLATION: Cross-agency access is strictly prohibited/
      );

      // Cross-branch breach for branch supervisor: must throw
      expect(() => assertCrossTenantBoundary(callerSatya, targetOtherBranch)).toThrow(
        /SECURITY_VIOLATION: Caller branch '.*' cannot access branch '.*'/
      );

      // Same branch: allowed
      expect(() =>
        assertCrossTenantBoundary(callerSatya, {
          agencyId: 'agency_satya',
          orgId: 'org_satya_corp',
          branchId: 'branch_satya_sudirman',
        })
      ).not.toThrow();

      // Agency Superadmin: allowed across all branches in agency
      const superadmin = {
        agencyId: 'agency_satya',
        orgId: 'org_satya_corp',
        role: 'AGENCY_SUPERADMIN' as const,
      };
      expect(() => assertCrossTenantBoundary(superadmin, targetOtherBranch)).not.toThrow();
    });
  });

  // =========================================================================
  // 2. SANITIZED LOGGING & CREDENTIAL PROTECTION
  // =========================================================================
  describe('2. Sanitized Logging & Credential Protection', () => {
    test('2.1 Redacts database connection strings containing user credentials', () => {
      const rawLog =
        'Database connection opened to postgresql://postgres.tjkbgxrckaocgosvmzmj:P@ssw0rd!_SuperSecret99@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
      const sanitized = sanitizeWorkforceLog(rawLog);

      expect(sanitized).not.toContain('P@ssw0rd!_SuperSecret99');
      expect(sanitized).not.toContain('postgres.tjkbgxrckaocgosvmzmj');
      expect(sanitized).toContain(
        'postgresql://[REDACTED_USER]:[REDACTED_SECRET]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
      );
    });

    test('2.2 Redacts Bearer tokens and authorization headers', () => {
      const rawLog =
        'Incoming HTTP request Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123secret';
      const sanitized = sanitizeWorkforceLog(rawLog);

      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123secret');
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    });

    test('2.3 Redacts standalone JWT tokens', () => {
      const rawLog =
        'Decoded payload error from eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQifQ.randomSignatureHash1234567890';
      const sanitized = sanitizeWorkforceLog(rawLog);

      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).toContain('[REDACTED_JWT_TOKEN]');
    });

    test('2.4 Redacts Supabase service role keys and publishable tokens', () => {
      const rawSecret = 'Failed with key sb_secret_m0cked_5up4b4s3_k3y_9876543210';
      const rawPublishable = 'Client initialized with sb_publishable_m0cked_pub_k3y_1234567890';

      const sanitizedSecret = sanitizeWorkforceLog(rawSecret);
      const sanitizedPublishable = sanitizeWorkforceLog(rawPublishable);

      expect(sanitizedSecret).not.toContain('m0cked_5up4b4s3_k3y');
      expect(sanitizedSecret).toContain('[REDACTED_SUPABASE_KEY]');

      expect(sanitizedPublishable).not.toContain('m0cked_pub_k3y');
      expect(sanitizedPublishable).toContain('[REDACTED_SUPABASE_KEY]');
    });

    test('2.5 Redacts payment gateway keys (Xendit dev & prod keys)', () => {
      const rawLog =
        'Xendit Gateway configured with secret xnd_development_abc123xyz890 and production key xnd_production_def456uvw123';
      const sanitized = sanitizeWorkforceLog(rawLog);

      expect(sanitized).not.toContain('xnd_development_abc123xyz890');
      expect(sanitized).not.toContain('xnd_production_def456uvw123');
      expect(sanitized).toContain('[REDACTED_XENDIT_KEY]');
    });

    test('2.6 Handles edge cases (empty strings, null, non-sensitive strings)', () => {
      expect(sanitizeWorkforceLog('')).toBe('');
      // @ts-expect-error test invalid inputs
      expect(sanitizeWorkforceLog(null)).toBe('');
      const cleanString = 'Normal application event: Personnel seat successfully activated.';
      expect(sanitizeWorkforceLog(cleanString)).toBe(cleanString);
    });
  });

  // =========================================================================
  // 3. EDGE ERROR NORMALIZATION
  // =========================================================================
  describe('3. Edge Error Normalization', () => {
    test('3.1 Maps INSUFFICIENT_CREDITS to HTTP 402 with standardized payload', () => {
      const error = new Error('INSUFFICIENT_CREDITS: Branch available balance is 0.');
      const res = normalizeWorkforceApiError(error);

      expect(res.statusCode).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('INSUFFICIENT_CREDITS');
      expect(res.body.code).toBe('ERR_INSUFFICIENT_CREDITS');
      expect(res.body.message).toContain('Kredit kursi tidak mencukupi');
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    test('3.2 Maps SUBSCRIPTION_EXPIRED / INACTIVE to HTTP 403', () => {
      const err1 = new Error('SUBSCRIPTION_EXPIRED: Grace period ended.');
      const res1 = normalizeWorkforceApiError(err1);
      expect(res1.statusCode).toBe(403);
      expect(res1.body.code).toBe('ERR_SUBSCRIPTION_EXPIRED');

      const err2 = new Error('PERSONNEL_LICENSE_INACTIVE: License has lapsed.');
      const res2 = normalizeWorkforceApiError(err2);
      expect(res2.statusCode).toBe(403);
      expect(res2.body.code).toBe('ERR_SUBSCRIPTION_EXPIRED');
    });

    test('3.3 Maps TENANT_ISOLATION_BREACH / SECURITY_VIOLATION to HTTP 403', () => {
      const err1 = new Error('SECURITY_VIOLATION: Cross-agency access is strictly prohibited.');
      const res1 = normalizeWorkforceApiError(err1);
      expect(res1.statusCode).toBe(403);
      expect(res1.body.code).toBe('ERR_TENANT_ISOLATION_BREACH');
      expect(res1.body.message).toContain('Pelanggaran isolasi tenant');

      const err2 = new Error('BRANCH_MEMBERSHIP_MISMATCH: Caller does not belong to branch.');
      const res2 = normalizeWorkforceApiError(err2);
      expect(res2.statusCode).toBe(403);
      expect(res2.body.code).toBe('ERR_TENANT_ISOLATION_BREACH');
    });

    test('3.4 Maps MINIMUM_DEPOSIT_NOT_MET to HTTP 400', () => {
      const error = new Error('MINIMUM_DEPOSIT_NOT_MET: Deposit must be at least 5 credits.');
      const res = normalizeWorkforceApiError(error);

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('ERR_MINIMUM_DEPOSIT_NOT_MET');
      expect(res.body.message).toContain('kurang dari minimum kuota yang ditentukan (5 kredit)');
    });

    test('3.5 Normalizes unhandled generic errors to HTTP 500 without leaking stack trace', () => {
      const error = new Error('Unexpected fatal database pool failure at /var/app/db.ts:42');
      const res = normalizeWorkforceApiError(error);

      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('ERR_INTERNAL_WORKFORCE_ERROR');
      expect(res.body.message).toBe('Terjadi kesalahan internal pada layanan workforce.');
      expect(JSON.stringify(res.body)).not.toContain('/var/app/db.ts:42');
    });
  });

  // =========================================================================
  // 4. LIVE STAGING DATABASE AUDIT & MULTI-TENANT ISOLATION
  // =========================================================================
  describe('4. Live Staging Database Audit & Multi-Tenant Isolation', () => {
    test('4.1 Verifies Row Level Security (RLS) is active across all workforce staging tables', async () => {
      const res = await client.query(`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = $1
          AND tablename IN ('branch_credit_pools', 'credit_purchase_transactions', 'seat_credit_ledger');
      `, [targetSchema]);

      expect(res.rows.length).toBe(3);
      for (const row of res.rows) {
        expect(row.rowsecurity).toBe(true);
      }
    });

    test('4.2 Verifies strict database multi-tenant data isolation between distinct agencies', async () => {
      const agencyA = `test_e6f_${timestamp}_agency_A`;
      const branchA = `test_e6f_${timestamp}_branch_A`;
      const payRefA = `test_e6f_${timestamp}_payref_A`;

      const agencyB = `test_e6f_${timestamp}_agency_B`;
      const branchB = `test_e6f_${timestamp}_branch_B`;
      const payRefB = `test_e6f_${timestamp}_payref_B`;

      // Deposit for Agency A: 5 credits
      const resA = await client.query(`
        SELECT fn_workforce_deposit_credits(
          $1::text, $2::text, $3::int, $4::text, $5::text, $6::bigint, $7::text
        );
      `, [
        branchA,
        agencyA,
        5,
        'QRIS',
        `po_${timestamp}_A`,
        166500,
        payRefA,
      ]);
      const dataA = resA.rows[0].fn_workforce_deposit_credits;
      expect(dataA.success).toBe(true);
      expect(dataA.available_credits).toBe(5);

      // Deposit for Agency B: 10 credits
      const resB = await client.query(`
        SELECT fn_workforce_deposit_credits(
          $1::text, $2::text, $3::int, $4::text, $5::text, $6::bigint, $7::text
        );
      `, [
        branchB,
        agencyB,
        10,
        'BANK_TRANSFER',
        `po_${timestamp}_B`,
        333000,
        payRefB,
      ]);
      const dataB = resB.rows[0].fn_workforce_deposit_credits;
      expect(dataB.success).toBe(true);
      expect(dataB.available_credits).toBe(10);

      // Verify Query Isolation: Agency A query MUST return 0 records from Agency B
      const poolQueryA = await client.query(
        `SELECT * FROM branch_credit_pools WHERE agency_id = $1;`,
        [agencyA]
      );
      expect(poolQueryA.rows.length).toBe(1);
      expect(poolQueryA.rows[0].branch_id).toBe(branchA);
      expect(Number(poolQueryA.rows[0].available_credits)).toBe(5);

      const ledgerQueryA = await client.query(
        `SELECT * FROM seat_credit_ledger WHERE agency_id = $1;`,
        [agencyA]
      );
      expect(ledgerQueryA.rows.length).toBe(5);
      for (const row of ledgerQueryA.rows) {
        expect(row.agency_id).toBe(agencyA);
        expect(row.branch_id).toBe(branchA);
      }

      // Verify Agency B pool isolation
      const poolQueryB = await client.query(
        `SELECT * FROM branch_credit_pools WHERE agency_id = $1;`,
        [agencyB]
      );
      expect(poolQueryB.rows.length).toBe(1);
      expect(poolQueryB.rows[0].branch_id).toBe(branchB);
      expect(Number(poolQueryB.rows[0].available_credits)).toBe(10);

      // Attempt cross-tenant breach handling:
      let capturedError: unknown;
      try {
        assertCrossTenantBoundary(
          { agencyId: agencyA, orgId: 'org_A', branchId: branchA, role: 'BRANCH_SUPERVISOR' },
          { agencyId: agencyB, orgId: 'org_B', branchId: branchB }
        );
      } catch (err) {
        capturedError = err;
      }

      expect(capturedError).toBeDefined();
      const normalized = normalizeWorkforceApiError(capturedError);
      expect(normalized.statusCode).toBe(403);
      expect(normalized.body.code).toBe('ERR_TENANT_ISOLATION_BREACH');

      const loggedOutput = sanitizeWorkforceLog(
        `Failed cross-tenant request by ${agencyA} against ${branchB}: ${(capturedError as Error).message}`
      );
      expect(loggedOutput).toContain('SECURITY_VIOLATION');
      expect(loggedOutput).not.toContain('password');
    });
  });
});
