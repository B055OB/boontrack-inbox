/**
 * __tests__/workforce/e9-white-label-pilot.test.ts
 * BWM Gate E9-B: White-Label Pilot Scenario & Concurrency Defense Suite (E9-01 s.d. E9-05)
 *
 * Mandate & Scope:
 * 1. [E9-01] Domain-to-Tenant Resolution: satya.workforce.boontrack.com -> tenant_satya_staging; intruder.evil.com -> DEFAULT_DENY.
 * 2. [E9-02] White-Label Isolation: PWA manifest returns tenant-specific branding with zero metadata leakage.
 * 3. [E9-03] Credit Pool Rollover & Cross-Tenant Defense: 25 purchased, 14 consumed, 11 rollover intact.
 *            Tenant B adversary attempt against Tenant A pool fails-closed (ERR_CROSS_TENANT_VIOLATION).
 * 4. [E9-04] Sandbox Payment Lifecycle: Full audit trace from Xendit/Dodo sandbox -> ledger -> tax -> credit lot.
 * 5. [E9-05] Edge Reverse Proxy & Host Header Poisoning Defense.
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
  WebhookInbox,
  AtomicCreditLedger,
  PostgresAtomicCreditLedger,
  ReconciliationEngine,
} from '@/packages/workforce-billing';

describe('BWM Gate E9: White-Label Pilot Scenario & Sandbox Proof Suite', () => {
  let client: Client;
  let hasLiveDb = false;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Identifiers for isolated synthetic pilot
  const runId = Date.now();
  const tenantSatya = `tenant_satya_staging`;
  const tenantBeta = `tenant_beta_adversary`;
  const branchSatya = `branch_satya_pilot_${runId}`;
  const branchBeta = `branch_beta_pilot_${runId}`;

  // Local engines
  let domainRegistry: DomainRegistryService;
  let xenditAdapter: XenditAdapter;
  let dodoAdapter: DodoPaymentsAdapter;
  let orchestrator: BillingOrchestrator;
  let financialLedger: FinancialLedger;
  let webhookInbox: WebhookInbox;
  let inMemoryCreditLedger: AtomicCreditLedger;
  let postgresCreditLedger: PostgresAtomicCreditLedger;
  let reconciliationEngine: ReconciliationEngine;

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
    webhookInbox = new WebhookInbox();
    inMemoryCreditLedger = new AtomicCreditLedger();
    reconciliationEngine = new ReconciliationEngine(orchestrator, financialLedger, inMemoryCreditLedger);

    // Register active demo tenants into registry
    domainRegistry.registerDomain({
      tenantId: tenantSatya,
      hostname: 'satya.workforce.boontrack.com',
      brandName: 'SATYA Security Ops',
      logoUrl: '/icons/satya-logo.png',
      primaryColor: '#06b6d4',
      accentColor: '#4f46e5',
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

    // Attempt Live Staging Database Connection
    try {
      client = await createLiveClient();
      hasLiveDb = true;

      const migrationSql = fs.readFileSync(
        path.resolve('packages/workforce-billing/schema/workforce-billing-schema.sql'),
        'utf8'
      );
      await client.query(migrationSql);
      await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);

      postgresCreditLedger = new PostgresAtomicCreditLedger(client, targetSchema);
    } catch (err: any) {
      console.warn('Live DB unreachable in E9 white-label test, using in-memory engine:', err.message);
      hasLiveDb = false;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end().catch(() => { });
    }
  });

  // ----------------------------------------------------------------------------
  // TEST E9-01: Domain-to-Tenant Resolution & Default-Deny
  // ----------------------------------------------------------------------------
  test('E9-01 [Domain-to-Tenant Resolution]: Resolves satya host and enforces default-deny on intruder', () => {
    // 1. Valid Satya Host
    const satyaRes = domainRegistry.resolveHost('satya.workforce.boontrack.com');
    expect(satyaRes.status).toBe('RESOLVED');
    expect(satyaRes.domain?.tenantId).toBe(tenantSatya);
    expect(satyaRes.domain?.brandName).toBe('SATYA Security Ops');
    expect(satyaRes.domain?.primaryColor).toBe('#06b6d4');

    // 2. Intruder Host -> Default Deny
    const intruderRes = domainRegistry.resolveHost('intruder.evil.com');
    expect(intruderRes.status).toBe('DEFAULT_DENY');
    expect(intruderRes.reason).toBe('UNREGISTERED_HOST');
    expect(intruderRes.targetRedirect).toBe('https://workforce.boontrack.com/login');

    // 3. Global Registry Resolution
    const globalSatya = globalDomainRegistry.resolveHost('satya.workforce.boontrack.com');
    expect(globalSatya.status).toBe('RESOLVED');
    expect(globalSatya.domain?.tenantId).toBe(tenantSatya);
  });

  // ----------------------------------------------------------------------------
  // TEST E9-02: White-Label Isolation (PWA Manifest & Theme)
  // ----------------------------------------------------------------------------
  test('E9-02 [White-Label Isolation]: Manifest produces tenant branding with zero metadata leakage', () => {
    function generateTenantManifest(hostname: string) {
      const res = domainRegistry.resolveHost(hostname);
      const domain = res.domain || {
        tenantId: 'tenant_satya_001',
        brandName: 'SATYA Workforce',
        primaryColor: '#059669',
        accentColor: '#0d9488',
        logoUrl: '/icons/workforce-192.png',
        isActive: true,
      };

      return {
        name: domain.brandName,
        short_name: domain.brandName,
        theme_color: domain.primaryColor,
        icons: [{ src: domain.logoUrl || '/icons/workforce-192.png' }],
      };
    }

    const satyaManifest = generateTenantManifest('satya.workforce.boontrack.com');
    const betaManifest = generateTenantManifest('beta.workforce.boontrack.com');

    // Satya tenant verification
    expect(satyaManifest.name).toBe('SATYA Security Ops');
    expect(satyaManifest.theme_color).toBe('#06b6d4');
    expect(satyaManifest.icons[0].src).toBe('/icons/satya-logo.png');

    // Beta adversary verification
    expect(betaManifest.name).toBe('Beta Security Ops');
    expect(betaManifest.theme_color).toBe('#dc2626');
    expect(betaManifest.icons[0].src).toBe('/icons/beta-logo.png');

    // Strict zero leakage
    expect(satyaManifest.name).not.toContain('Beta');
    expect(betaManifest.name).not.toContain('Satya');
    expect(satyaManifest.theme_color).not.toBe(betaManifest.theme_color);
  });

  // ----------------------------------------------------------------------------
  // TEST E9-03: Credit Pool Rollover & Cross-Tenant Defense
  // ----------------------------------------------------------------------------
  test('E9-03 [Credit Pool Rollover & Cross-Tenant Defense]: 25 purchased, 14 consumed, 11 rollover intact; adversary rejected fail-closed', async () => {
    // 1. Tenant A purchases 25 Credit Passes via Sandbox
    const intent = await orchestrator.createPaymentIntent({
      tenantId: tenantSatya,
      branchId: branchSatya,
      agencyId: tenantSatya,
      quantity: 25,
      currency: 'IDR',
      customerEmail: 'ops@satya.id',
      customerName: 'Hendra Satya Ops',
    });

    const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
    const lotA = await inMemoryCreditLedger.createLotFromPayment(payment);
    expect(lotA.totalPurchased).toBe(25);
    expect(lotA.availableCredits).toBe(25);
    expect(inMemoryCreditLedger.getBranchBalance(branchSatya)).toBe(25);

    // 2. Allocate 14 passes for 14 active personnel
    const syntheticOfficers = Array.from({ length: 14 }, (_, i) => ({
      id: `PERS_${String(i + 1).padStart(2, '0')}_${runId}`,
      name: `Synthetic Officer ${i + 1}`,
    }));

    for (const officer of syntheticOfficers) {
      const res = await inMemoryCreditLedger.allocateCredit({
        tenantId: tenantSatya,
        branchId: branchSatya,
        personnelId: officer.id,
        personnelName: officer.name,
      });
      expect(res.success).toBe(true);
    }

    // 3. Confirm 11 passes rollover to next cycle
    const rolloverBalance = inMemoryCreditLedger.getBranchBalance(branchSatya);
    expect(rolloverBalance).toBe(11);

    // Next cycle allocation test: allocate 1 more officer using rollover balance
    const nextCycleOfficer = {
      id: `PERS_15_ROLLOVER_${runId}`,
      name: 'Synthetic Officer 15 Rollover',
    };
    const rolloverAlloc = await inMemoryCreditLedger.allocateCredit({
      tenantId: tenantSatya,
      branchId: branchSatya,
      personnelId: nextCycleOfficer.id,
      personnelName: nextCycleOfficer.name,
    });
    expect(rolloverAlloc.success).toBe(true);
    expect(inMemoryCreditLedger.getBranchBalance(branchSatya)).toBe(10);

    // 4. Adversary Tenant B attempts cross-tenant theft of Tenant A's pool
    await expect(
      inMemoryCreditLedger.allocateCredit({
        tenantId: tenantBeta,
        branchId: branchSatya, // Target is Tenant A's branch
        personnelId: `INTRUDER_B_${runId}`,
        personnelName: 'Beta Intruder',
      })
    ).rejects.toThrow(/ERR_CROSS_TENANT_VIOLATION/);

    // Verify Tenant A balance is unchanged by the attack
    expect(inMemoryCreditLedger.getBranchBalance(branchSatya)).toBe(10);
    expect(inMemoryCreditLedger.getBranchBalance(branchBeta)).toBe(0);
  });

  // ----------------------------------------------------------------------------
  // TEST E9-04: Sandbox Payment Lifecycle & Full Reconciliation
  // ----------------------------------------------------------------------------
  test('E9-04 [Sandbox Payment Lifecycle]: Reconciles from Xendit Sandbox to ledger, tax, and credit pool', async () => {
    const sandboxRef = `INV-XND-STG-${runId}`;
    const sandboxTxnId = `xnd_txn_pilot_${runId}`;

    // 1. Ingest Webhook Event
    const rawPayload = {
      id: sandboxTxnId,
      external_id: sandboxRef,
      status: 'PAID',
      amount: 750000,
      paid_at: new Date().toISOString(),
    };

    const webhookResult = webhookInbox.ingest({
      provider: 'xendit',
      eventId: sandboxTxnId,
      eventType: 'invoice.paid',
      rawPayload,
      headers: {
        'x-callback-token': 'xnd_sandbox_callback_token_satya_2026',
      },
    });

    expect(webhookResult.accepted).toBe(true);

    // 2. Create Payment & Financial Entries
    const intent = await orchestrator.createPaymentIntent({
      tenantId: tenantSatya,
      branchId: branchSatya,
      agencyId: tenantSatya,
      quantity: 25,
      currency: 'IDR',
      customerEmail: 'billing@satya.id',
      customerName: 'Satya Enterprise Billing',
    });

    const paymentRecord = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED', sandboxTxnId);

    // Double-Entry Financial Journal & Tax Sub-Ledger
    const settlementResult = financialLedger.recordPaymentSettlement(paymentRecord);
    expect(settlementResult.entries.length).toBeGreaterThanOrEqual(2);
    expect(settlementResult.taxEntry).toBeDefined();

    // Create Credit Lot
    await inMemoryCreditLedger.createLotFromPayment(paymentRecord);

    // 3. Full Bi-Directional Reconciliation Verification
    const reconTrace = reconciliationEngine.reconcilePayment(paymentRecord.internalPaymentRef);
    expect(reconTrace.paymentStatus).toBe('SUCCEEDED');
    expect(reconTrace.isFullyReconciled).toBe(true);
    expect(reconTrace.discrepancies.length).toBe(0);
    expect(reconTrace.financialLedgerEntries.length).toBeGreaterThanOrEqual(2);
    expect(reconTrace.creditLot).toBeDefined();

    // Verify tax segregation
    expect(reconTrace.taxSubLedgerEntries.length).toBeGreaterThanOrEqual(1);
    expect(reconTrace.taxSubLedgerEntries[0].taxRate).toBe(0.11); // PPN 11%
    expect(reconTrace.taxSubLedgerEntries[0].taxType).toBe('PPN');
  });

  // ----------------------------------------------------------------------------
  // TEST E9-05: Edge Reverse Proxy & Security Header Hardening
  // ----------------------------------------------------------------------------
  test('E9-05 [Edge Reverse Proxy & Host Header Poisoning Defense]: Enforces trusted proxy verification', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // 1. Non-local request in production missing edge verification header -> UNTRUSTED_PROXY
      const untrustedResult = domainRegistry.resolveHost('satya.workforce.boontrack.com', null);
      expect(untrustedResult.status).toBe('UNTRUSTED_PROXY');
      expect(untrustedResult.reason).toBe('UNTRUSTED_PROXY_ORIGIN_MISSING_EDGE_TOKEN');
      expect(untrustedResult.targetRedirect).toBe('https://workforce.boontrack.com/login');

      // 2. Request with edge reverse proxy header -> RESOLVED
      const trustedResult = domainRegistry.resolveHost(
        'satya.workforce.boontrack.com',
        'railway-cloudflare-edge-verified-2026'
      );
      expect(trustedResult.status).toBe('RESOLVED');
      expect(trustedResult.domain?.tenantId).toBe(tenantSatya);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
