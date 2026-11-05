/**
 * __tests__/workforce/e9-dynamic-branding-pilot.test.ts
 * BWM Gate E9: Dynamic Branding Engine & Sandbox Pilot Scenario (RFC-BWM-014)
 *
 * Scope & CTO Requirements:
 * 1. [Tahap E9-A] Dynamic Branding Engine (RFC-BWM-014):
 *    - Authoritative host resolution via verified_domain_registry.
 *    - Strict Default-Deny policy for unregistered/suspended hosts.
 *    - Untrusted Reverse Proxy & Host Header Poisoning protection.
 *    - Dynamic PWA Webmanifest (/api/manifest) tenant resolution.
 *    - Dynamic CSS theme variables (--brand-primary, --brand-accent).
 *
 * 2. [Tahap E9-B] Sandbox Pilot Scenario (Satya Demo Tenant):
 *    - Demo Tenant A: "satya.workforce.boontrack.com" (PT Satya Garda Perkasa).
 *    - 14 synthetic personnel on-duty (PERS_01 to PERS_14).
 *    - Purchase of 25 Credit Passes via Sandbox -> 14 allocated, 11 rollover.
 *    - [E9-03 Proof] Adversary Tenant B ("beta.workforce.boontrack.com") attempts
 *      cross-tenant allocation; system FAILS CLOSED with ERR_CROSS_TENANT_VIOLATION.
 *    - Tenant A's 11 rollover passes remain 100% intact with zero leakage.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import {
  DomainRegistryService,
  globalDomainRegistry,
  XenditAdapter,
  DodoPaymentsAdapter,
  BillingOrchestrator,
  FinancialLedger,
  AtomicCreditLedger,
  PostgresAtomicCreditLedger,
} from '@/packages/workforce-billing';

describe('BWM Gate E9: Dynamic Branding Engine & Sandbox Pilot Scenario', () => {
  let client: Client;
  let hasLiveDb = false;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Test identifiers & synthetic run
  const runId = Date.now();
  const tenantSatya = `tenant_satya_${runId}`;
  const tenantBeta = `tenant_beta_adversary_${runId}`;
  const branchSatya = `branch_satya_hq_${runId}`;
  const branchBeta = `branch_beta_hq_${runId}`;

  // Local engines
  let domainRegistry: DomainRegistryService;
  let xenditAdapter: XenditAdapter;
  let dodoAdapter: DodoPaymentsAdapter;
  let orchestrator: BillingOrchestrator;
  let financialLedger: FinancialLedger;
  let inMemoryCreditLedger: AtomicCreditLedger;
  let postgresCreditLedger: PostgresAtomicCreditLedger;

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
        // ignore
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
          connectionTimeoutMillis: 6000,
        });
        await c.connect();
        return c;
      } catch {
        // try next
      }
    }
    throw new Error('Failed to connect to staging database via candidate connection strings');
  }

  beforeAll(async () => {
    domainRegistry = new DomainRegistryService();

    xenditAdapter = new XenditAdapter({
      callbackToken: 'xnd_sandbox_callback_token_satya_2026',
      webhookSecret: 'xnd_sandbox_hmac_secret_key_2026',
    });

    dodoAdapter = new DodoPaymentsAdapter({
      webhookSecret: 'dodo_sandbox_webhook_secret_key_2026',
      maxClockDriftSeconds: 300,
    });

    orchestrator = new BillingOrchestrator({
      xenditAdapter,
      dodoAdapter,
    });

    financialLedger = new FinancialLedger();
    inMemoryCreditLedger = new AtomicCreditLedger();

    // Register active demo tenants into registry
    domainRegistry.registerDomain({
      tenantId: tenantSatya,
      hostname: 'satya.workforce.boontrack.com',
      brandName: 'PT Satya Garda Perkasa',
      logoUrl: '/icons/satya-logo.png',
      primaryColor: '#059669',
      accentColor: '#0d9488',
      isActive: true,
    });

    domainRegistry.registerDomain({
      tenantId: tenantBeta,
      hostname: 'beta.workforce.boontrack.com',
      brandName: 'Beta Security Ops',
      logoUrl: '/icons/beta-logo.png',
      primaryColor: '#dc2626',
      accentColor: '#b91c1c',
      isActive: true,
    });

    // Register a suspended tenant for negative test
    domainRegistry.registerDomain({
      tenantId: 'tenant_suspended_999',
      hostname: 'suspended.workforce.boontrack.com',
      brandName: 'Suspended Security Corp',
      logoUrl: '/icons/suspended.png',
      primaryColor: '#6b7280',
      accentColor: '#4b5563',
      isActive: false,
    });

    // Attempt Live Staging Database Connection
    try {
      client = await createLiveClient();
      hasLiveDb = true;

      // Ensure target schema and verified_domain_registry table exist
      const migrationSql = fs.readFileSync(
        path.resolve('packages/workforce-billing/schema/workforce-billing-schema.sql'),
        'utf8'
      );
      await client.query(migrationSql);
      await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);

      postgresCreditLedger = new PostgresAtomicCreditLedger(client, targetSchema);
    } catch (err: any) {
      console.warn('Live DB unreachable in E9 test, continuing with isolated ledger:', err.message);
      hasLiveDb = false;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end().catch(() => {});
    }
  });

  // ============================================================================
  // TAHAP E9-A: DYNAMIC BRANDING ENGINE (RFC-BWM-014)
  // ============================================================================
  describe('Tahap E9-A: Dynamic Branding Engine & Edge Security', () => {
    test('E9-01: Resolves Authoritative Hostnames with Brand Colors and Tenant Scope', () => {
      // 1. Satya Demo Host
      const satyaRes = domainRegistry.resolveHost('satya.workforce.boontrack.com');
      expect(satyaRes.status).toBe('RESOLVED');
      expect(satyaRes.domain).toBeDefined();
      expect(satyaRes.domain?.tenantId).toBe(tenantSatya);
      expect(satyaRes.domain?.brandName).toBe('PT Satya Garda Perkasa');
      expect(satyaRes.domain?.primaryColor).toBe('#059669');
      expect(satyaRes.domain?.accentColor).toBe('#0d9488');

      // 2. Beta Adversary Host
      const betaRes = domainRegistry.resolveHost('beta.workforce.boontrack.com');
      expect(betaRes.status).toBe('RESOLVED');
      expect(betaRes.domain).toBeDefined();
      expect(betaRes.domain?.tenantId).toBe(tenantBeta);
      expect(betaRes.domain?.brandName).toBe('Beta Security Ops');
      expect(betaRes.domain?.primaryColor).toBe('#dc2626');
      expect(betaRes.domain?.accentColor).toBe('#b91c1c');

      // 3. Default Root Workforce Host
      const defaultRes = globalDomainRegistry.resolveHost('workforce.boontrack.com');
      expect(defaultRes.status).toBe('RESOLVED');
      expect(defaultRes.domain?.brandName).toBe('SATYA Workforce');
      expect(defaultRes.domain?.primaryColor).toBe('#059669');
    });

    test('E9-01b: Strict Default-Deny on Unregistered, Suspended, or Missing Host', () => {
      // 1. Phishing / Unregistered host -> default-deny
      const unknownRes = domainRegistry.resolveHost('malicious-phishing-workforce.com');
      expect(unknownRes.status).toBe('DEFAULT_DENY');
      expect(unknownRes.reason).toBe('UNREGISTERED_HOST');
      expect(unknownRes.targetRedirect).toBe('https://workforce.boontrack.com/login');

      // 2. Suspended tenant domain -> default-deny
      const suspendedRes = domainRegistry.resolveHost('suspended.workforce.boontrack.com');
      expect(suspendedRes.status).toBe('DEFAULT_DENY');
      expect(suspendedRes.reason).toBe('TENANT_DOMAIN_SUSPENDED');
      expect(suspendedRes.targetRedirect).toBe('https://workforce.boontrack.com/login');

      // 3. Missing host header -> default-deny
      const nullRes = domainRegistry.resolveHost(null);
      expect(nullRes.status).toBe('DEFAULT_DENY');
      expect(nullRes.reason).toBe('MISSING_HOST_HEADER');
    });

    test('E9-01c: Host-Header Poisoning & Untrusted Edge Proxy Protection', () => {
      const origNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        // In production, an external request without trusted edge token is rejected
        const untrustedRes = domainRegistry.resolveHost('satya.workforce.boontrack.com', null);
        expect(untrustedRes.status).toBe('UNTRUSTED_PROXY');
        expect(untrustedRes.reason).toBe('UNTRUSTED_PROXY_ORIGIN_MISSING_EDGE_TOKEN');
        expect(untrustedRes.targetRedirect).toBe('https://workforce.boontrack.com/login');

        // With valid edge proxy header, resolution succeeds
        const trustedRes = domainRegistry.resolveHost(
          'satya.workforce.boontrack.com',
          'cf-railway-edge-token-verified'
        );
        expect(trustedRes.status).toBe('RESOLVED');
        expect(trustedRes.domain?.tenantId).toBe(tenantSatya);
      } finally {
        process.env.NODE_ENV = origNodeEnv;
      }
    });

    test('E9-02: Dynamic PWA Webmanifest Spec Generation', () => {
      // Helper simulating /api/manifest resolution logic
      function generateDynamicManifest(hostname: string) {
        const resolution = domainRegistry.resolveHost(hostname);
        const domain = resolution.status === 'RESOLVED' ? resolution.domain : null;

        const name = domain?.brandName || 'SATYA Workforce';
        const primaryColor = domain?.primaryColor || '#059669';
        const logoUrl = domain?.logoUrl || '/icons/workforce-192.png';

        return {
          name,
          short_name: name.split(' ')[0],
          description: `${name} - Operational Workforce Portal`,
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: primaryColor,
          icons: [
            {
              src: logoUrl,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        };
      }

      // Satya Manifest
      const satyaManifest = generateDynamicManifest('satya.workforce.boontrack.com');
      expect(satyaManifest.name).toBe('PT Satya Garda Perkasa');
      expect(satyaManifest.theme_color).toBe('#059669');
      expect(satyaManifest.icons[0].src).toBe('/icons/satya-logo.png');

      // Beta Manifest
      const betaManifest = generateDynamicManifest('beta.workforce.boontrack.com');
      expect(betaManifest.name).toBe('Beta Security Ops');
      expect(betaManifest.theme_color).toBe('#dc2626');
      expect(betaManifest.icons[0].src).toBe('/icons/beta-logo.png');

      // Unregistered fallback manifest
      const fallbackManifest = generateDynamicManifest('unknown-external.com');
      expect(fallbackManifest.name).toBe('SATYA Workforce');
      expect(fallbackManifest.theme_color).toBe('#059669');
    });

    test('E9-02b: Dynamic CSS Theme Variable Generation', () => {
      function computeThemeCss(hostname: string): string {
        const resolution = domainRegistry.resolveHost(hostname);
        const domain = resolution.status === 'RESOLVED' ? resolution.domain : null;
        const primary = domain?.primaryColor || '#059669';
        const accent = domain?.accentColor || '#0d9488';

        return `:root { --brand-primary: ${primary}; --brand-accent: ${accent}; }`;
      }

      const satyaCss = computeThemeCss('satya.workforce.boontrack.com');
      expect(satyaCss).toContain('--brand-primary: #059669');
      expect(satyaCss).toContain('--brand-accent: #0d9488');

      const betaCss = computeThemeCss('beta.workforce.boontrack.com');
      expect(betaCss).toContain('--brand-primary: #dc2626');
      expect(betaCss).toContain('--brand-accent: #b91c1c');
    });
  });

  // ============================================================================
  // TAHAP E9-B: SANDBOX PILOT SCENARIO (SATYA DEMO TENANT & 100% SYNTHETIC DATA)
  // ============================================================================
  describe('Tahap E9-B: Sandbox Pilot Scenario & Negative Isolation Proof', () => {
    // 14 Synthetic Personnel on-duty at Satya HQ
    const syntheticPersonnel = Array.from({ length: 14 }, (_, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      return {
        id: `PERS_${num}_${runId}`,
        nip: `248.01${num}.26`,
        name: `Synthetic Officer ${num}`,
        role: 'field_personnel',
        site: 'Satya Command Post Alpha',
      };
    });

    test('E9-03: Tenant A purchases 25 Credit Passes, allocates 14 to personnel, preserves 11 rollover passes', async () => {
      // 1. Tenant A Purchases 25 Credit Passes via Sandbox
      const intent = await orchestrator.createPaymentIntent({
        tenantId: tenantSatya,
        branchId: branchSatya,
        agencyId: tenantSatya,
        quantity: 25,
        currency: 'IDR',
        customerEmail: 'ops.satya@boontrack.com',
        customerName: 'Hendra Satya Ops',
      });

      expect(intent.quantity).toBe(25);
      expect(intent.currency).toBe('IDR');

      // Simulate payment settlement in sandbox
      const settledPayment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
      expect(settledPayment.status).toBe('SUCCEEDED');

      // In-Memory Ledger Lot Creation
      const satyaLot = await inMemoryCreditLedger.createLotFromPayment(settledPayment);
      expect(satyaLot.totalPurchased).toBe(25);
      expect(satyaLot.availableCredits).toBe(25);
      expect(inMemoryCreditLedger.getBranchBalance(branchSatya)).toBe(25);

      // 2. Allocate 14 Credit Passes to 14 On-Duty Personnel (30-day active duty)
      const allocations = [];
      for (const personnel of syntheticPersonnel) {
        const alloc = await inMemoryCreditLedger.allocateCredit({
          tenantId: tenantSatya,
          branchId: branchSatya,
          personnelId: personnel.id,
          personnelName: personnel.name,
        });
        allocations.push(alloc);
      }

      // Assert exactly 14 allocations created
      expect(allocations.length).toBe(14);
      for (const alloc of allocations) {
        expect(alloc.success).toBe(true);
        expect(alloc.lotId).toBe(satyaLot.lotId);
        // Valid for 30 days
        const expiresAt = new Date(alloc.expiresAt).getTime();
        const now = Date.now();
        const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));
        expect(diffDays).toBe(30);
      }

      // 3. Verify exactly 11 passes remain in the rollover balance pool
      const remainingBalance = inMemoryCreditLedger.getBranchBalance(branchSatya);
      expect(remainingBalance).toBe(11);

      const updatedSatyaLot = inMemoryCreditLedger.getLot(satyaLot.lotId);
      expect(updatedSatyaLot?.availableCredits).toBe(11);
      expect(updatedSatyaLot?.consumedCredits).toBe(14);
      expect(updatedSatyaLot?.status).toBe('ACTIVE');

      console.log(`[E9-PILOT] Tenant A Pilot Successfully Provisioned:
        Total Purchased:     25 Credit Passes
        Personnel Allocated: 14 Active Officers
        Rollover Balance:    11 Passes (Safe in Pool)`);
    });

    test('E9-03b [NEGATIVE TEST / PROOF]: Tenant B (beta.workforce.boontrack.com) is REJECTED when attempting to claim Tenant A rollover passes', async () => {
      // Ensure Tenant A has 11 rollover passes in branchSatya
      const balanceBefore = inMemoryCreditLedger.getBranchBalance(branchSatya);
      expect(balanceBefore).toBe(11);

      // Adversary Tenant B attempts to allocate from Tenant A's branch
      const intruderPersonnel = {
        id: `INTRUDER_01_${runId}`,
        name: 'Adversary Intruder Beta',
      };

      // 1. Direct allocation attempt by Tenant B against Tenant A's branch must throw ERR_CROSS_TENANT_VIOLATION
      await expect(
        inMemoryCreditLedger.allocateCredit({
          tenantId: tenantBeta,
          branchId: branchSatya, // Target is Tenant A's branch
          personnelId: intruderPersonnel.id,
          personnelName: intruderPersonnel.name,
        })
      ).rejects.toThrow(/ERR_CROSS_TENANT_VIOLATION/);

      // 2. Tenant B's own branch must have 0 balance (cannot inherit or leach credits)
      expect(inMemoryCreditLedger.getBranchBalance(branchBeta)).toBe(0);

      // 3. Verification of Zero Leakage: Tenant A's balance remains strictly 11
      const balanceAfter = inMemoryCreditLedger.getBranchBalance(branchSatya);
      expect(balanceAfter).toBe(11);

      console.log(`[E9-PROOF] Negative Cross-Tenant Attack Defeated:
        Attacking Tenant:    ${tenantBeta}
        Target Branch:       ${branchSatya}
        Result:              ERR_CROSS_TENANT_VIOLATION (Fail-Closed)
        Tenant A Pool:       11 / 11 Passes 100% Intact`);
    });

    test('E9-03c [LIVE STAGING DB VERIFICATION]: PostgreSQL Staging Rollover & Cross-Tenant Rejection', async () => {
      if (!hasLiveDb) {
        console.log('Skipping Live DB step (running in staging sandbox mock mode)');
        return;
      }

      // Create lot in PostgreSQL staging with 25 passes
      const pgLotId = `LOT_E9_PILOT_${runId}`;
      await postgresCreditLedger.createLot({
        lotId: pgLotId,
        purchaseRef: `po_e9_${runId}`,
        providerTxnId: `txn_e9_${runId}`,
        tenantId: tenantSatya,
        branchId: branchSatya,
        agencyId: tenantSatya,
        currency: 'IDR',
        totalPurchased: 25,
        unitPrice: 30000,
      });

      // Allocate 14 passes in PostgreSQL
      for (let i = 0; i < 14; i++) {
        await postgresCreditLedger.allocateCredit({
          tenantId: tenantSatya,
          branchId: branchSatya,
          personnelId: `PERS_PG_${i + 1}_${runId}`,
          personnelName: `PG Officer ${i + 1}`,
        });
      }

      // Check PostgreSQL balance = 11
      const pgLotQuery = await client.query(
        `SELECT available_credits, consumed_credits, status FROM workforce_credit_lots WHERE lot_id = $1`,
        [pgLotId]
      );
      expect(pgLotQuery.rows[0].available_credits).toBe(11);
      expect(pgLotQuery.rows[0].consumed_credits).toBe(14);
      expect(pgLotQuery.rows[0].status).toBe('ACTIVE');

      // Negative Test in PostgreSQL: Tenant B attempts to allocate against Tenant A branch
      await expect(
        postgresCreditLedger.allocateCredit({
          tenantId: tenantBeta,
          branchId: branchSatya,
          personnelId: `PG_INTRUDER_${runId}`,
          personnelName: 'PG Intruder',
        })
      ).rejects.toThrow(/ERR_CROSS_TENANT_VIOLATION/);

      // Balance remains strictly 11 in PostgreSQL
      const pgLotQueryAfter = await client.query(
        `SELECT available_credits FROM workforce_credit_lots WHERE lot_id = $1`,
        [pgLotId]
      );
      expect(pgLotQueryAfter.rows[0].available_credits).toBe(11);

      // Verify verified_domain_registry table exists in staging DB
      const registryCheck = await client.query(
        `SELECT hostname, brand_name, is_active FROM verified_domain_registry WHERE hostname = 'satya.workforce.boontrack.com'`
      );
      expect(registryCheck.rows.length).toBeGreaterThanOrEqual(1);
      expect(registryCheck.rows[0].brand_name).toBe('SATYA Garda Perkasa');
      expect(registryCheck.rows[0].is_active).toBe(true);
    });
  });
});
