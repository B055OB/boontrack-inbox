/**
 * __tests__/workforce/marginal-pricing-and-ledger.test.ts
 * Master Sprint Suite: Dynamic Branding, Native i18n, & Financial Accuracy Engine
 *
 * Scope & Verification:
 * 1. Bagian 1: Native i18n & Main Agent Elevation (RFC-018 Addendum)
 * 2. Bagian 2: Marginal Progressive Pricing Engine (Deterministic 8 Test Quantities in Integer Cents)
 * 3. Bagian 3: Mock Invoice & Immutable Snapshot Model (Tax Isolation & Policy Lockdown)
 * 4. Bagian 4: Tenant Pass Ledger Atomicity, Strict FIFO, 10x Webhook Replay & Concurrency Safety
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {
  calculateMarginalProgressivePrice,
  RFC_BWM_014_V1_TIERS,
  createMockInvoice,
  PRECONFIGURED_TAX_REGIMES,
  TenantPassLedger,
  PostgresTenantPassLedger,
  SecurityInvariantViolation,
  WebhookInbox,
} from '@/packages/workforce-billing';

describe('BWM Master Sprint: Dynamic Branding, Native i18n, & Financial Accuracy Engine', () => {
  // =========================================================================
  // BAGIAN 1: LOKALISASI NATIVE i18n & ELEVASI MAIN AGENT (RFC-018 ADDENDUM)
  // =========================================================================
  describe('Bagian 1: Native i18n Dictionaries & Main Agent Terminology', () => {
    test('en.json and id.json contain complete "workforce" namespace without third-party dependencies', () => {
      const enRaw = fs.readFileSync(path.resolve(process.cwd(), 'locales/en.json'), 'utf-8');
      const idRaw = fs.readFileSync(path.resolve(process.cwd(), 'locales/id.json'), 'utf-8');

      const en = JSON.parse(enRaw);
      const id = JSON.parse(idRaw);

      expect(en.workforce).toBeDefined();
      expect(id.workforce).toBeDefined();

      // Common module
      expect(en.workforce.common.liveTelemetry).toBe('Live Telemetry Active');
      expect(id.workforce.common.liveTelemetry).toBe('Telemetri Langsung Aktif');
      expect(en.workforce.common.signOut).toBe('Sign Out');
      expect(id.workforce.common.signOut).toBe('Keluar');
      expect(en.workforce.common.installApp).toBe('Install Mobile App');
      expect(en.workforce.common.enableAlerts).toBe('Enable Push Alerts');

      // Field module
      expect(en.workforce.field.statusOnDuty).toBe('Active On-Duty');
      expect(id.workforce.field.statusOnDuty).toBe('Aktif Bertugas');
      expect(en.workforce.field.clockIn).toBe('Clock In');
      expect(en.workforce.field.patrol).toBe('Patrol Checkpoints');
      expect(en.workforce.field.incident).toBe('Report Field Incident');

      // Supervisor module
      expect(en.workforce.supervisor.deskTitle).toBe('Branch Operations Command Desk');
      expect(id.workforce.supervisor.deskTitle).toBe('Meja Komando Operasional Cabang');

      // Main Agent module
      expect(en.workforce.mainAgent.consoleTitle).toBe('Enterprise Main Agent Console');
      expect(id.workforce.mainAgent.consoleTitle).toBe('Konsol Agen Utama Enterprise');
      expect(en.workforce.mainAgent.portalSubtitle).toBe(
        'Authorized Main Agent: {agency} | Territory Fleet & Quota Allocation'
      );
      expect(en.workforce.mainAgent.requisitionButton).toBe('+ Requisition BWM Credit Passes');
    });

    test('Zero "Reseller" terminology leaks in public login quick-fill and portal labels', () => {
      const loginRaw = fs.readFileSync(
        path.resolve(process.cwd(), 'workforce-web/app/login/page.tsx'),
        'utf-8'
      );
      expect(loginRaw).toContain('Main Agent: partner@apexsecurity.com (Apex Security Services Ltd)');
      expect(loginRaw).toContain("? 'Main Agent'");

      const pageRaw = fs.readFileSync(
        path.resolve(process.cwd(), 'workforce-web/app/page.tsx'),
        'utf-8'
      );
      expect(pageRaw).toContain('Built for Security Contractors &amp; Main Agents');
      expect(pageRaw).not.toContain('Master Resellers');
    });
  });

  // =========================================================================
  // BAGIAN 2: MARGINAL PROGRESSIVE PRICING ENGINE (INTEGER CENTS)
  // =========================================================================
  describe('Bagian 2: Marginal Progressive Pricing Engine (Integer Cents Arithmetic)', () => {
    test('Tier configuration defines RFC-BWM-014-V1 exact marginal boundaries', () => {
      expect(RFC_BWM_014_V1_TIERS).toHaveLength(3);
      expect(RFC_BWM_014_V1_TIERS[0]).toMatchObject({
        tier: 1,
        fromQuantity: 1,
        toQuantity: 49,
        unitPriceCents: 450, // $4.50
      });
      expect(RFC_BWM_014_V1_TIERS[1]).toMatchObject({
        tier: 2,
        fromQuantity: 50,
        toQuantity: 199,
        unitPriceCents: 380, // $3.80
      });
      expect(RFC_BWM_014_V1_TIERS[2]).toMatchObject({
        tier: 3,
        fromQuantity: 200,
        toQuantity: Infinity,
        unitPriceCents: 320, // $3.20
      });
    });

    // 8 Mandatory Deterministic Test Quantities
    const testMatrix = [
      { quantity: 10, expectedCents: 4500, expectedUsd: '$45.00', desc: 'Tier 1 partial: 10 * 450' },
      { quantity: 49, expectedCents: 22050, expectedUsd: '$220.50', desc: 'Tier 1 boundary: 49 * 450' },
      { quantity: 50, expectedCents: 22430, expectedUsd: '$224.30', desc: 'Tier 2 entry: 22,050 + 380' },
      { quantity: 60, expectedCents: 26230, expectedUsd: '$262.30', desc: 'Tier 2 mid: 22,050 + (11 * 380)' },
      { quantity: 100, expectedCents: 41430, expectedUsd: '$414.30', desc: 'Tier 2 mid: 22,050 + (51 * 380)' },
      { quantity: 199, expectedCents: 79050, expectedUsd: '$790.50', desc: 'Tier 2 boundary: 22,050 + (150 * 380)' },
      { quantity: 200, expectedCents: 79370, expectedUsd: '$793.70', desc: 'Tier 3 entry: 79,050 + 320' },
      { quantity: 250, expectedCents: 95370, expectedUsd: '$953.70', desc: 'Tier 3 scale: 79,050 + (51 * 320)' },
    ];

    test.each(testMatrix)(
      'Deterministic Pricing for $quantity passes -> $expectedCents cents ($expectedUsd) [$desc]',
      ({ quantity, expectedCents, expectedUsd }) => {
        const result = calculateMarginalProgressivePrice(quantity);

        expect(result.subtotalCents).toBe(expectedCents);
        expect(result.subtotalUsd).toBe(expectedUsd);
        expect(Number.isInteger(result.subtotalCents)).toBe(true);
        expect(result.policyVersion).toBe('RFC-BWM-014-V1');
      }
    );

    test('Throws error on non-integer or zero/negative quantity', () => {
      expect(() => calculateMarginalProgressivePrice(0)).toThrow('INVALID_QUANTITY');
      expect(() => calculateMarginalProgressivePrice(-5)).toThrow('INVALID_QUANTITY');
      expect(() => calculateMarginalProgressivePrice(12.5)).toThrow('INVALID_QUANTITY');
    });
  });

  // =========================================================================
  // BAGIAN 3: MOCK INVOICE & IMMUTABLE SNAPSHOT MODEL
  // =========================================================================
  describe('Bagian 3: Mock Invoice & Immutable Snapshot Model', () => {
    test('Generates mock invoice with isolated tax regime and locked pricing snapshot', () => {
      // 1. Zero-tax Regime (B2B Cross-border Export)
      const exportInvoice = createMockInvoice({
        tenantId: 'tenant_apex_global_01',
        agencyId: 'agency_apex_hq',
        customerEmail: 'finance@apexsecurity.com',
        customerName: 'Apex Security Services Ltd',
        quantity: 100,
        taxRegime: 'ZERO_TAX',
      });

      expect(exportInvoice.subtotalCents).toBe(41430); // $414.30
      expect(exportInvoice.taxCents).toBe(0);
      expect(exportInvoice.totalCents).toBe(41430);
      expect(exportInvoice.taxConfig.regime).toBe('ZERO_TAX');
      expect(exportInvoice.pricingSnapshot.policyVersion).toBe('RFC-BWM-014-V1');
      expect(exportInvoice.pricingSnapshot.appliedTiers).toHaveLength(2); // Tier 1 and Tier 2

      // 2. Standard GST (8%) Regime
      const gstInvoice = createMockInvoice({
        tenantId: 'tenant_apex_my_01',
        agencyId: 'agency_apex_my',
        customerEmail: 'finance@apex.my',
        customerName: 'Apex Security Malaysia Sdn Bhd',
        quantity: 50,
        taxRegime: 'STANDARD_GST',
      });

      expect(gstInvoice.subtotalCents).toBe(22430); // $224.30
      // 22430 * 800 / 10000 = 1794.4 cents -> Math.round = 1794 cents ($17.94)
      expect(gstInvoice.taxCents).toBe(1794);
      expect(gstInvoice.totalCents).toBe(22430 + 1794); // 24224 cents ($242.24)
      expect(gstInvoice.formattedTotalUsd).toBe('$242.24');
      expect(gstInvoice.taxConfig.rateBasisPoints).toBe(800);

      // 3. Reverse Charge VAT (0% with statutory note)
      const vatInvoice = createMockInvoice({
        tenantId: 'tenant_apex_uk_01',
        agencyId: 'agency_apex_uk',
        customerEmail: 'accounts@apex.co.uk',
        customerName: 'Apex Security UK Ltd',
        quantity: 250,
        taxRegime: 'REVERSE_CHARGE_VAT',
      });

      expect(vatInvoice.subtotalCents).toBe(95370);
      expect(vatInvoice.taxCents).toBe(0);
      expect(vatInvoice.totalCents).toBe(95370);
      expect(vatInvoice.taxConfig.reverseChargeNote).toBeDefined();
    });

    test('Invoice payload and pricingSnapshot are strictly immutable (Deep Frozen)', () => {
      const invoice = createMockInvoice({
        tenantId: 'tenant_lockdown_01',
        agencyId: 'agency_apex_01',
        customerEmail: 'partner@apexsecurity.com',
        customerName: 'Apex Security Services Ltd',
        quantity: 60,
      });

      expect(Object.isFrozen(invoice)).toBe(true);
      expect(Object.isFrozen(invoice.pricingSnapshot)).toBe(true);
      expect(Object.isFrozen(invoice.pricingSnapshot.appliedTiers)).toBe(true);

      // Attempting mutation should fail/throw in strict mode
      expect(() => {
        (invoice as any).totalCents = 100;
      }).toThrow();

      expect(() => {
        (invoice.pricingSnapshot as any).policyVersion = 'RFC-MUTATED';
      }).toThrow();
    });
  });

  // =========================================================================
  // BAGIAN 4: LEDGER ATOMICITY, FIFO & WEBHOOK IDEMPOTENCY
  // =========================================================================
  describe('Bagian 4: Tenant Pass Ledger Atomicity, FIFO, & Webhook Idempotency', () => {
    let ledger: TenantPassLedger;
    const tenantA = 'tenant_apex_sprint_test';

    beforeEach(() => {
      ledger = new TenantPassLedger();
    });

    test('Non-Negative Balance Constraint: Rejects deduction exceeding balance', async () => {
      // Balance is initially 0
      expect(ledger.getBalance(tenantA)).toBe(0);

      await expect(
        ledger.allocatePassesAtomic({
          tenantId: tenantA,
          personnelRequests: [{ personnelId: 'PERS_01', personnelName: 'Sarah Jenkins' }],
          idempotencyKey: 'alloc_fail_01',
        })
      ).rejects.toThrow('INSUFFICIENT_CREDITS');

      // Balance remains strictly 0, never negative
      expect(ledger.getBalance(tenantA)).toBe(0);
    });

    test('FIFO Pass Allocation: Deducts from oldest batch before newer batch', async () => {
      // 1. First batch: 10 passes created at T1
      await ledger.processPaymentWebhook({
        eventId: 'evt_batch_01',
        idempotencyKey: 'idemp_batch_01',
        tenantId: tenantA,
        passes: 10,
        unitPriceCents: 450,
      });

      // 2. Second batch: 20 passes created at T2
      await ledger.processPaymentWebhook({
        eventId: 'evt_batch_02',
        idempotencyKey: 'idemp_batch_02',
        tenantId: tenantA,
        passes: 20,
        unitPriceCents: 380,
      });

      expect(ledger.getBalance(tenantA)).toBe(30);

      const batchesBefore = ledger.getBatches(tenantA);
      expect(batchesBefore[0].availablePasses).toBe(10);
      expect(batchesBefore[1].availablePasses).toBe(20);

      // 3. Allocate 12 passes (should consume 10 from Batch 1, and 2 from Batch 2)
      const requests = Array.from({ length: 12 }, (_, i) => ({
        personnelId: `GUARD_${i + 1}`,
        personnelName: `Officer ${i + 1}`,
      }));

      const allocResult = await ledger.allocatePassesAtomic({
        tenantId: tenantA,
        personnelRequests: requests,
        idempotencyKey: 'alloc_fifo_test_12',
      });

      expect(allocResult.success).toBe(true);
      expect(allocResult.allocatedCount).toBe(12);
      expect(allocResult.remainingBalance).toBe(18);

      const batchesAfter = ledger.getBatches(tenantA);
      // Batch 1 must be depleted (0 available, status DEPLETED)
      expect(batchesAfter[0].availablePasses).toBe(0);
      expect(batchesAfter[0].status).toBe('DEPLETED');

      // Batch 2 must have 18 remaining (20 - 2)
      expect(batchesAfter[1].availablePasses).toBe(18);
      expect(batchesAfter[1].status).toBe('ACTIVE');
    });

    test('Transactional Rollback: Mid-transaction failure rolls back all deductions', async () => {
      // Provision 5 passes
      await ledger.processPaymentWebhook({
        eventId: 'evt_batch_rollback',
        idempotencyKey: 'idemp_batch_rollback',
        tenantId: tenantA,
        passes: 5,
        unitPriceCents: 450,
      });

      expect(ledger.getBalance(tenantA)).toBe(5);

      // Attempt to allocate 8 passes (exceeds balance of 5)
      const requests = Array.from({ length: 8 }, (_, i) => ({
        personnelId: `GUARD_${i + 1}`,
        personnelName: `Officer ${i + 1}`,
      }));

      await expect(
        ledger.allocatePassesAtomic({
          tenantId: tenantA,
          personnelRequests: requests,
          idempotencyKey: 'alloc_exceed_01',
        })
      ).rejects.toThrow('INSUFFICIENT_CREDITS');

      // Post-rollback state verification
      expect(ledger.getBalance(tenantA)).toBe(5);
      const batches = ledger.getBatches(tenantA);
      expect(batches[0].availablePasses).toBe(5);
      expect(batches[0].consumedPasses).toBe(0);
      expect(ledger.getAllocations(tenantA)).toHaveLength(0);
    });

    test('Webhook Replay 10x: 10 identical webhook calls mutate ledger exactly ONCE', async () => {
      const webhookPayload = {
        eventId: 'dodo_evt_replay_9999',
        idempotencyKey: 'idemp_dodo_replay_9999',
        tenantId: tenantA,
        passes: 25,
        unitPriceCents: 380,
      };

      const results = [];

      // Send 10 consecutive webhook requests with identical eventId & idempotencyKey
      for (let i = 1; i <= 10; i++) {
        const res = await ledger.processPaymentWebhook(webhookPayload);
        results.push(res);
      }

      // 1. First delivery must be accepted and mutated
      expect(results[0].accepted).toBe(true);
      expect(results[0].isDuplicate).toBe(false);
      expect(results[0].replayCount).toBe(1);
      expect(results[0].balance).toBe(25);

      // 2. Deliveries 2 through 10 must be recognized as duplicate replays
      for (let i = 1; i < 10; i++) {
        expect(results[i].accepted).toBe(true);
        expect(results[i].isDuplicate).toBe(true);
        expect(results[i].balance).toBe(25); // Zero extra passes added
        expect(results[i].replayCount).toBe(i + 1);
      }

      // 3. Verification of ledger and batches: exactly 1 batch, exactly 1 ledger entry
      expect(ledger.getBalance(tenantA)).toBe(25);
      expect(ledger.getBatches(tenantA)).toHaveLength(1);
      expect(ledger.getLedgerEntries(tenantA)).toHaveLength(1);
    });

    test('Concurrent Renewal Safety: Parallel renewal workers execute without race conditions or double deduction', async () => {
      // Provision exactly 10 passes
      await ledger.processPaymentWebhook({
        eventId: 'evt_concurrent_seed',
        idempotencyKey: 'idemp_concurrent_seed',
        tenantId: tenantA,
        passes: 10,
        unitPriceCents: 450,
      });

      expect(ledger.getBalance(tenantA)).toBe(10);

      // 10 concurrent workers renewing 10 distinct officers simultaneously
      const workerPromises = Array.from({ length: 10 }, (_, i) =>
        ledger.renewPersonnelCoverage({
          tenantId: tenantA,
          personnelId: `WORKER_OFFICER_${i + 1}`,
          personnelName: `Officer ${i + 1}`,
          idempotencyKey: `idemp_renew_worker_${i + 1}`,
        })
      );

      const workerResults = await Promise.all(workerPromises);

      // All 10 succeeded
      expect(workerResults).toHaveLength(10);
      workerResults.forEach((r) => expect(r.success).toBe(true));

      // Balance cleanly depleted from 10 to exactly 0
      expect(ledger.getBalance(tenantA)).toBe(0);

      // 11th concurrent worker must be rejected cleanly
      await expect(
        ledger.renewPersonnelCoverage({
          tenantId: tenantA,
          personnelId: 'WORKER_OFFICER_11',
          personnelName: 'Officer 11',
          idempotencyKey: 'idemp_renew_worker_11',
        })
      ).rejects.toThrow('INSUFFICIENT_CREDITS');

      expect(ledger.getBalance(tenantA)).toBe(0);
    });

    test('PostgresTenantPassLedger: Executes BEGIN ... SELECT FOR UPDATE ... COMMIT', async () => {
      const executedQueries: string[] = [];
      const mockClient: any = {
        query: jest.fn().mockImplementation((queryText: string, params?: any[]) => {
          executedQueries.push(queryText.trim().replace(/\s+/g, ' '));

          if (queryText.includes('WHERE idempotency_key = $1')) {
            return Promise.resolve({ rows: [] }); // not duplicate
          }
          if (queryText.includes('FOR UPDATE')) {
            return Promise.resolve({ rows: [{ balance_after: 50 }] }); // current balance 50
          }
          if (queryText.includes('INSERT INTO')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const pgLedger = new PostgresTenantPassLedger(mockClient, 'workforce_staging');
      const result = await pgLedger.mutateBalanceAtomic({
        tenantId: 'tenant_pg_audit_01',
        batchId: 'BATCH_100',
        deltaPasses: 10,
        reason: 'PURCHASE',
        idempotencyKey: 'idemp_pg_test_01',
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.balanceAfter).toBe(60); // 50 + 10

      // Invariants verification
      expect(executedQueries[0]).toBe('BEGIN');
      expect(executedQueries.some((q) => q.includes('FOR UPDATE'))).toBe(true);
      expect(executedQueries.some((q) => q.includes('INSERT INTO workforce_staging.tenant_pass_ledger'))).toBe(true);
      expect(executedQueries[executedQueries.length - 1]).toBe('COMMIT');
    });

    test('PostgresTenantPassLedger: Executes ROLLBACK on negative balance violation', async () => {
      const executedQueries: string[] = [];
      const mockClient: any = {
        query: jest.fn().mockImplementation((queryText: string) => {
          executedQueries.push(queryText.trim().replace(/\s+/g, ' '));
          if (queryText.includes('WHERE idempotency_key = $1')) {
            return Promise.resolve({ rows: [] });
          }
          if (queryText.includes('FOR UPDATE')) {
            return Promise.resolve({ rows: [{ balance_after: 5 }] }); // current balance 5
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const pgLedger = new PostgresTenantPassLedger(mockClient, 'workforce_staging');

      // Attempt to deduct 10 passes when balance is only 5
      await expect(
        pgLedger.mutateBalanceAtomic({
          tenantId: 'tenant_pg_audit_01',
          batchId: 'BATCH_100',
          deltaPasses: -10,
          reason: 'ALLOCATION',
          idempotencyKey: 'idemp_pg_fail_01',
        })
      ).rejects.toThrow('ERR_NEGATIVE_BALANCE');

      expect(executedQueries[0]).toBe('BEGIN');
      expect(executedQueries[executedQueries.length - 1]).toBe('ROLLBACK');
    });

    test('PostgresTenantPassLedger: Executes ON CONFLICT UPSERT for webhook idempotency', async () => {
      let capturedQuery = '';
      const mockClient: any = {
        query: jest.fn().mockImplementation((queryText: string) => {
          capturedQuery = queryText.trim().replace(/\s+/g, ' ');
          return Promise.resolve({
            rows: [{ id: 'inb_test_123', status: 'RECEIVED', retry_count: 1, is_new_delivery: false }],
          });
        }),
      };

      const pgLedger = new PostgresTenantPassLedger(mockClient, 'workforce_staging');
      const res = await pgLedger.ingestPersistentWebhook({
        provider: 'DODO_PAYMENTS',
        eventId: 'evt_pg_replay_01',
        idempotencyKey: 'idemp_pg_replay_01',
        eventType: 'payment.succeeded',
        rawPayload: { amount: 15000 },
        headers: { 'x-signature': 'abc' },
      });

      expect(capturedQuery).toContain('ON CONFLICT (idempotency_key) DO UPDATE');
      expect(capturedQuery).toContain('SET retry_count = workforce_staging.workforce_webhook_inbox.retry_count + 1');
      expect(res.isDuplicate).toBe(true);
      expect(res.retryCount).toBe(1);
    });

    test('Gate 1 [Cold-Start Row Locking]: Acquires pg_advisory_xact_lock on tenantId at transaction start for zero-row defense', async () => {
      const executedQueries: string[] = [];
      const mockClient: any = {
        query: jest.fn().mockImplementation((queryText: string) => {
          executedQueries.push(queryText.trim().replace(/\s+/g, ' '));
          if (queryText.includes('WHERE idempotency_key = $1')) {
            return Promise.resolve({ rows: [] });
          }
          if (queryText.includes('FOR UPDATE')) {
            return Promise.resolve({ rows: [] }); // Cold start: zero rows in ledger!
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const pgLedger = new PostgresTenantPassLedger(mockClient, 'workforce_staging');
      const res = await pgLedger.mutateBalanceAtomic({
        tenantId: 'tenant_zero_row_new',
        batchId: 'BATCH_001',
        deltaPasses: 10,
        reason: 'PURCHASE',
        idempotencyKey: 'idemp_cold_001',
      });

      expect(res.isDuplicate).toBe(false);
      expect(res.balanceAfter).toBe(10);
      expect(executedQueries[0]).toBe('BEGIN');
      expect(executedQueries[1]).toContain('pg_advisory_xact_lock(hashtext($1))');
      expect(executedQueries.some((q) => q.includes('FOR UPDATE'))).toBe(true);
      expect(executedQueries[executedQueries.length - 1]).toBe('COMMIT');
    });

    test('Gate 1 [Atomic Binding Webhook Inbox -> Ledger Mutation]: In-memory progression RECEIVED -> PROCESSING -> PROCESSED and rollback to FAILED', async () => {
      const inbox = new WebhookInbox();
      const ledger = new TenantPassLedger();
      const tenantId = 'tenant_atomic_inbox_01';

      // 1. Successful execution
      const result = await ledger.processWebhookAndMutateLedgerAtomic({
        inbox,
        provider: 'DODO_PAYMENTS',
        eventId: 'evt_atomic_01',
        eventType: 'payment.succeeded',
        rawPayload: { amount: 37500 },
        headers: { 'x-signature': 'sig_valid' },
        tenantId,
        passes: 25,
        unitPriceCents: 1500,
      });

      expect(result.accepted).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.status).toBe('PROCESSED');
      expect(result.balance).toBe(25);

      const record = inbox.getRecord(result.inboxId);
      expect(record).toBeDefined();
      expect(record?.status).toBe('PROCESSED');
      expect(record?.processedAt).toBeDefined();

      // 2. Replay same webhook -> duplicate acknowledged with zero extra balance mutation
      const replay = await ledger.processWebhookAndMutateLedgerAtomic({
        inbox,
        provider: 'DODO_PAYMENTS',
        eventId: 'evt_atomic_01',
        eventType: 'payment.succeeded',
        rawPayload: { amount: 37500 },
        headers: { 'x-signature': 'sig_valid' },
        tenantId,
        passes: 25,
        unitPriceCents: 1500,
      });

      expect(replay.isDuplicate).toBe(true);
      expect(replay.balance).toBe(25);

      // 3. Rollback on failure
      await expect(
        ledger.processWebhookAndMutateLedgerAtomic({
          inbox,
          provider: 'DODO_PAYMENTS',
          eventId: 'evt_atomic_invalid',
          eventType: 'payment.succeeded',
          rawPayload: { amount: 0 },
          headers: { 'x-signature': 'sig_valid' },
          tenantId,
          passes: -5, // Invalid negative passes will throw
        })
      ).rejects.toThrow();

      const failedRecord = inbox.getAllRecords().find((r) => r.eventId === 'evt_atomic_invalid');
      expect(failedRecord).toBeDefined();
      expect(failedRecord?.status).toBe('FAILED');
      expect(ledger.getBalance(tenantId)).toBe(25); // unchanged
    });

    test('Gate 1 [PostgreSQL Atomic Webhook Binding]: processWebhookAndMutateLedgerAtomic executes single transaction flow', async () => {
      const executedQueries: string[] = [];
      const mockClient: any = {
        query: jest.fn().mockImplementation((queryText: string) => {
          executedQueries.push(queryText.trim().replace(/\s+/g, ' '));
          if (queryText.includes('workforce_webhook_inbox') && queryText.includes('FOR UPDATE')) {
            return Promise.resolve({ rows: [] }); // Not yet in inbox
          }
          if (queryText.includes('INSERT INTO workforce_staging.workforce_webhook_inbox')) {
            return Promise.resolve({ rows: [{ id: 'inb_auto_uuid' }] });
          }
          if (queryText.includes('WHERE idempotency_key = $1')) {
            return Promise.resolve({ rows: [] }); // Not in ledger
          }
          if (queryText.includes('tenant_pass_ledger') && queryText.includes('FOR UPDATE')) {
            return Promise.resolve({ rows: [{ balance_after: 0 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const pgLedger = new PostgresTenantPassLedger(mockClient, 'workforce_staging');
      const result = await pgLedger.processWebhookAndMutateLedgerAtomic({
        provider: 'DODO_PAYMENTS',
        eventId: 'evt_pg_atomic_01',
        idempotencyKey: 'idemp_pg_atomic_01',
        eventType: 'payment.succeeded',
        rawPayload: { amount: 37500 },
        headers: { 'x-signature': 'sig_test' },
        tenantId: 'tenant_pg_atomic_01',
        batchId: 'BATCH_ATOMIC_1',
        deltaPasses: 25,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.status).toBe('PROCESSED');
      expect(result.balanceAfter).toBe(25);

      expect(executedQueries[0]).toBe('BEGIN');
      expect(executedQueries[1]).toContain('pg_advisory_xact_lock(hashtext($1))');
      expect(executedQueries.some((q) => q.includes('workforce_webhook_inbox') && q.includes('FOR UPDATE'))).toBe(true);
      expect(executedQueries.some((q) => q.includes('INSERT INTO workforce_staging.tenant_pass_ledger'))).toBe(true);
      expect(executedQueries.some((q) => q.includes('status = \'PROCESSED\''))).toBe(true);
      expect(executedQueries[executedQueries.length - 1]).toBe('COMMIT');
    });

    test('Gate 1 [Multi-Connection Concurrency]: Real pg.Pool serializes 10 concurrent mutations on zero-row cold-start tenant (FAIL-CLOSED)', async () => {
      let directUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;
      let poolerUrl = process.env.WORKFORCE_DATABASE_URL;

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

      const connStr = directUrl || poolerUrl;
      if (!connStr) {
        throw new Error("STAGING_DB_REQUIRED: Concurrency test must run against real PostgreSQL");
      }

      const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 10000,
      });

      try {
        const testClient = await pool.connect();
        testClient.release();
      } catch (err: any) {
        await pool.end();
        throw new Error(`STAGING_DB_REQUIRED: Concurrency test must run against real PostgreSQL. Connection error: ${err.message}`);
      }

      const coldTenantId = `tenant_gate1_cold_${Date.now()}`;
      const CLIENT_COUNT = 10;
      const DELTA_PASSES = 5;

      try {
        const pids: number[] = [];
        const mutationPromises = Array.from({ length: CLIENT_COUNT }, async (_, i) => {
          const client = await pool.connect();
          try {
            const pidRes = await client.query('SELECT pg_backend_pid() as pid');
            const pid = Number(pidRes.rows[0].pid);
            pids.push(pid);

            const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
            return await pgLedger.mutateBalanceAtomic({
              tenantId: coldTenantId,
              batchId: `BATCH_CONC_${i}`,
              deltaPasses: DELTA_PASSES,
              reason: 'PURCHASE',
              idempotencyKey: `idemp_${coldTenantId}_${i}`,
            });
          } finally {
            client.release();
          }
        });

        const results = await Promise.all(mutationPromises);
        console.log("Verified 10 Independent PG PIDs:", pids);
        expect(results.length).toBe(CLIENT_COUNT);
        results.forEach((r) => expect(r.isDuplicate).toBe(false));
        expect(new Set(pids).size).toBe(CLIENT_COUNT);

        const verifyClient = await pool.connect();
        try {
          const balRes = await verifyClient.query(
            `SELECT balance_after FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1 ORDER BY created_at DESC, balance_after DESC LIMIT 1`,
            [coldTenantId]
          );
          const expectedBalance = CLIENT_COUNT * DELTA_PASSES;
          expect(Number(balRes.rows[0].balance_after)).toBe(expectedBalance);

          const countRes = await verifyClient.query(
            `SELECT count(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
            [coldTenantId]
          );
          expect(Number(countRes.rows[0].count)).toBe(CLIENT_COUNT);
        } finally {
          verifyClient.release();
        }
      } finally {
        await pool.end();
      }
    }, 25000);

    describe('Gate 1: Real PostgreSQL Atomic Webhook Integration Suite', () => {
      let pool: Pool;

      beforeAll(async () => {
        let directUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;
        let poolerUrl = process.env.WORKFORCE_DATABASE_URL;

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

        const connStr = directUrl || poolerUrl;
        if (!connStr) {
          throw new Error('STAGING_DB_REQUIRED: Concurrency test must run against real PostgreSQL');
        }

        pool = new Pool({
          connectionString: connStr,
          ssl: { rejectUnauthorized: false },
          max: 10,
          connectionTimeoutMillis: 10000,
        });

        try {
          const client = await pool.connect();
          client.release();
        } catch (err: any) {
          await pool.end();
          throw new Error(`STAGING_DB_REQUIRED: Failed to connect to real PostgreSQL: ${err.message}`);
        }
      });

      afterAll(async () => {
        if (pool) {
          await pool.end();
        }
      });

      test('a. Single Event: Kirim event webhook baru -> ledger bertambah tepat 1 baris, balance +delta', async () => {
        const tenantId = `tenant_wh_single_${Date.now()}`;
        const client = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
          const res = await pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId: `evt_single_${Date.now()}`,
            idempotencyKey: `idemp_single_${Date.now()}`,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 37500, tenant_id: tenantId },
            headers: { 'x-signature': 'sig_valid' },
            tenantId,
            batchId: 'BATCH_SINGLE_01',
            deltaPasses: 25,
          });

          expect(res.isDuplicate).toBe(false);
          expect(res.status).toBe('PROCESSED');
          expect(res.balanceAfter).toBe(25);

          const balRes = await client.query(
            `SELECT balance_after FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
            [tenantId]
          );
          expect(balRes.rows.length).toBe(1);
          expect(Number(balRes.rows[0].balance_after)).toBe(25);
        } finally {
          client.release();
        }
      });

      test('b. 10x Replay Idempotency: Kirim payload webhook persis sama 10 kali -> balance tetap, 0 extra mutasi, isDuplicate = true', async () => {
        const tenantId = `tenant_wh_replay_${Date.now()}`;
        const eventId = `evt_replay_${Date.now()}`;
        const idempotencyKey = `idemp_replay_${Date.now()}`;

        const client = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
          const initRes = await pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId,
            idempotencyKey,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 37500, tenant_id: tenantId },
            headers: { 'x-signature': 'sig_valid' },
            tenantId,
            batchId: 'BATCH_REPLAY_01',
            deltaPasses: 20,
          });
          expect(initRes.isDuplicate).toBe(false);
          expect(initRes.balanceAfter).toBe(20);

          for (let i = 0; i < 10; i++) {
            const repRes = await pgLedger.processWebhookAndMutateLedgerAtomic({
              provider: 'DODO_PAYMENTS',
              eventId,
              idempotencyKey,
              eventType: 'payment.succeeded',
              rawPayload: { amount: 37500, tenant_id: tenantId },
              headers: { 'x-signature': 'sig_valid' },
              tenantId,
              batchId: 'BATCH_REPLAY_01',
              deltaPasses: 20,
            });
            expect(repRes.isDuplicate).toBe(true);
            expect(repRes.status).toBe('DUPLICATE_ACKNOWLEDGED');
            expect(repRes.balanceAfter).toBe(20);
          }

          const countRes = await client.query(
            `SELECT count(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
            [tenantId]
          );
          expect(Number(countRes.rows[0].count)).toBe(1);
        } finally {
          client.release();
        }
      });

      test('c. 2 Concurrent Workers Same Event: Tembakkan 2 worker serentak -> tepat 1 berhasil mutasi, 1 terdeteksi duplikat', async () => {
        const tenantId = `tenant_wh_race_${Date.now()}`;
        const eventId = `evt_race_${Date.now()}`;
        const idempotencyKey = `idemp_race_${Date.now()}`;

        const [w1, w2] = await Promise.all([
          (async () => {
            const c = await pool.connect();
            try {
              const l = new PostgresTenantPassLedger(c, 'workforce_staging');
              return await l.processWebhookAndMutateLedgerAtomic({
                provider: 'DODO_PAYMENTS',
                eventId,
                idempotencyKey,
                eventType: 'payment.succeeded',
                rawPayload: { amount: 15000, tenant_id: tenantId },
                headers: { 'x-signature': 'sig_valid' },
                tenantId,
                batchId: 'BATCH_RACE_01',
                deltaPasses: 10,
              });
            } finally {
              c.release();
            }
          })(),
          (async () => {
            const c = await pool.connect();
            try {
              const l = new PostgresTenantPassLedger(c, 'workforce_staging');
              return await l.processWebhookAndMutateLedgerAtomic({
                provider: 'DODO_PAYMENTS',
                eventId,
                idempotencyKey,
                eventType: 'payment.succeeded',
                rawPayload: { amount: 15000, tenant_id: tenantId },
                headers: { 'x-signature': 'sig_valid' },
                tenantId,
                batchId: 'BATCH_RACE_01',
                deltaPasses: 10,
              });
            } finally {
              c.release();
            }
          })(),
        ]);

        const successes = [w1, w2].filter((w) => !w.isDuplicate);
        const duplicates = [w1, w2].filter((w) => w.isDuplicate);
        expect(successes.length).toBe(1);
        expect(duplicates.length).toBe(1);
        expect(successes[0].balanceAfter).toBe(10);
        expect(duplicates[0].balanceAfter).toBe(10);
      });

      test('d. Rollback Verification: Simulasikan error sebelum commit -> status inbox dan ledger tidak bertambah di DB (COUNT = 0)', async () => {
        const tenantId = `tenant_wh_rollback_${Date.now()}`;
        const eventId = `evt_rollback_${Date.now()}`;
        const idempotencyKey = `idemp_rollback_${Date.now()}`;

        const client = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');
          await expect(
            pgLedger.processWebhookAndMutateLedgerAtomic({
              provider: 'DODO_PAYMENTS',
              eventId,
              idempotencyKey,
              eventType: 'payment.succeeded',
              rawPayload: { amount: 1000, tenant_id: tenantId },
              headers: { 'x-signature': 'sig_valid' },
              tenantId,
              batchId: 'BATCH_ROLLBACK_01',
              deltaPasses: -50, // Triggers ERR_NEGATIVE_BALANCE on 0 balance
            })
          ).rejects.toThrow('ERR_NEGATIVE_BALANCE');

          const countLedger = await client.query(
            `SELECT count(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
            [tenantId]
          );
          const countInbox = await client.query(
            `SELECT count(*) as count FROM workforce_staging.workforce_webhook_inbox WHERE idempotency_key = $1`,
            [idempotencyKey]
          );
          expect(Number(countLedger.rows[0].count)).toBe(0);
          expect(Number(countInbox.rows[0].count)).toBe(0);
        } finally {
          client.release();
        }
      });

      test('e. Cross-Tenant Tampering: Coba kirim event_id sama dengan tenant_id berbeda -> wajib throw SecurityInvariantViolation', async () => {
        const legitTenant = `tenant_wh_legit_${Date.now()}`;
        const adversaryTenant = `tenant_wh_adversary_${Date.now()}`;
        const eventId = `evt_tamper_${Date.now()}`;
        const idempotencyKey = `idemp_tamper_${Date.now()}`;

        const client1 = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client1, 'workforce_staging');
          await pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId,
            idempotencyKey,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 37500, tenant_id: legitTenant },
            headers: { 'x-signature': 'sig_valid' },
            tenantId: legitTenant,
            batchId: 'BATCH_LEGIT_01',
            deltaPasses: 25,
          });
        } finally {
          client1.release();
        }

        const client2 = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client2, 'workforce_staging');
          await expect(
            pgLedger.processWebhookAndMutateLedgerAtomic({
              provider: 'DODO_PAYMENTS',
              eventId,
              idempotencyKey,
              eventType: 'payment.succeeded',
              rawPayload: { amount: 37500, tenant_id: adversaryTenant },
              headers: { 'x-signature': 'sig_valid' },
              tenantId: adversaryTenant,
              batchId: 'BATCH_ADVERSARY_01',
              deltaPasses: 25,
            })
          ).rejects.toThrow('CROSS_TENANT_IDEMPOTENCY_MISMATCH');
        } finally {
          client2.release();
        }
      });

      test('f. Conflicting Identities Test: query matching multiple distinct records must throw AMBIGUOUS_WEBHOOK_IDENTITY and rollback', async () => {
        const ts = Date.now();
        const client = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');

          // Record A
          const keyA = `idemp_confA_${ts}`;
          const evtA = `evt_confA_${ts}`;
          const tenantA = `tenant_confA_${ts}`;
          await pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId: evtA,
            idempotencyKey: keyA,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 1000 },
            headers: {},
            tenantId: tenantA,
            batchId: 'BATCH_A',
            deltaPasses: 10,
          });

          // Record B
          const keyB = `idemp_confB_${ts}`;
          const evtB = `evt_confB_${ts}`;
          const tenantB = `tenant_confB_${ts}`;
          await pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId: evtB,
            idempotencyKey: keyB,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 1000 },
            headers: {},
            tenantId: tenantB,
            batchId: 'BATCH_B',
            deltaPasses: 10,
          });

          // Conflicting request combining keyA and evtB
          const ambiguousTenant = `tenant_ambig_${ts}`;
          await expect(
            pgLedger.processWebhookAndMutateLedgerAtomic({
              provider: 'DODO_PAYMENTS',
              eventId: evtB,
              idempotencyKey: keyA,
              eventType: 'payment.succeeded',
              rawPayload: { amount: 1000 },
              headers: {},
              tenantId: ambiguousTenant,
              batchId: 'BATCH_AMBIG',
              deltaPasses: 10,
            })
          ).rejects.toThrow('AMBIGUOUS_WEBHOOK_IDENTITY');

          // Verify clean rollback: 0 mutations for ambiguousTenant
          const balRes = await client.query(
            `SELECT count(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
            [ambiguousTenant]
          );
          expect(Number(balRes.rows[0].count)).toBe(0);
        } finally {
          client.release();
        }
      });

      test('g. Cross-Tenant Replay Tampering: Replay existing payload with different claiming tenant must reject with SecurityInvariantViolation', async () => {
        const ts = Date.now();
        const legitTenant = `tenant_replay_legit_${ts}`;
        const adversaryTenant = `tenant_replay_adversary_${ts}`;
        const eventId = `evt_replay_tamper_${ts}`;
        const idempotencyKey = `idemp_replay_tamper_${ts}`;

        const client = await pool.connect();
        try {
          const pgLedger = new PostgresTenantPassLedger(client, 'workforce_staging');

          // Initial legitimate purchase
          const legitRes = await pgLedger.processWebhookAndMutateLedgerAtomic({
            provider: 'DODO_PAYMENTS',
            eventId,
            idempotencyKey,
            eventType: 'payment.succeeded',
            rawPayload: { amount: 37500 },
            headers: { 'x-signature': 'sig_valid' },
            tenantId: legitTenant,
            batchId: 'BATCH_REPLAY_LEGIT',
            deltaPasses: 25,
          });
          expect(legitRes.isDuplicate).toBe(false);
          expect(legitRes.balanceAfter).toBe(25);

          // Adversary attempts replay of same event claiming ownership
          await expect(
            pgLedger.processWebhookAndMutateLedgerAtomic({
              provider: 'DODO_PAYMENTS',
              eventId,
              idempotencyKey,
              eventType: 'payment.succeeded',
              rawPayload: { amount: 37500 },
              headers: { 'x-signature': 'sig_valid' },
              tenantId: adversaryTenant,
              batchId: 'BATCH_REPLAY_HIJACK',
              deltaPasses: 25,
            })
          ).rejects.toThrow('CROSS_TENANT_IDEMPOTENCY_MISMATCH');

          // Legit tenant balance remains exactly 25
          const balRes = await client.query(
            `SELECT balance_after FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [legitTenant]
          );
          expect(Number(balRes.rows[0].balance_after)).toBe(25);

          // Adversary has 0 rows in ledger
          const advRes = await client.query(
            `SELECT count(*) as count FROM workforce_staging.tenant_pass_ledger WHERE tenant_id = $1`,
            [adversaryTenant]
          );
          expect(Number(advRes.rows[0].count)).toBe(0);
        } finally {
          client.release();
        }
      });
    });
  });
});
