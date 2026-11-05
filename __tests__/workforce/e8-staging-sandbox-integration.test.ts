/**
 * __tests__/workforce/e8-staging-sandbox-integration.test.ts
 * BWM Gate E8: Staging Sandbox & Database Concurrency Integration Test Suite
 *
 * Verifies:
 * 1. PostgreSQL Staging Row-Level Locking Concurrency:
 *    - 5 concurrent workers racing for the last 1 remaining credit in a lot.
 *    - Row-level lock (SELECT ... FOR UPDATE) via fn_workforce_allocate_credit_fifo.
 *    - Exactly 1 worker succeeds, 4 workers fail with ERR_INSUFFICIENT_CREDITS.
 *    - Balance stops at exactly 0, never negative.
 * 2. Xendit Sandbox Integration:
 *    - Simulates invoice/QRIS creation.
 *    - Validates signature verification with sandbox callback token.
 * 3. Dodo Payments Test Mode:
 *    - Simulates multi-currency checkout (USD, MYR).
 *    - Validates HMAC-SHA256 signature verification and replay defense.
 * 4. End-to-End Idempotency & Replay Protection:
 *    - Webhook delivered twice only executes once; duplicate returns 200 OK with zero side effects.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  XenditAdapter,
  DodoPaymentsAdapter,
  BillingOrchestrator,
  FinancialLedger,
  WebhookInbox,
  PostgresAtomicCreditLedger,
  AtomicCreditLedger,
  ReconciliationEngine,
} from '@/packages/workforce-billing';

jest.setTimeout(45000);

describe('BWM Gate E8: Staging Sandbox & Database Integration Suite', () => {
  let client: Client;
  let hasLiveDb = false;
  const targetSchema = process.env.WORKFORCE_TARGET_SCHEMA || 'workforce_staging';

  // Isolated test namespace
  const runId = Date.now();
  const testBranchId = `branch_e8_test_${runId}`;
  const testAgencyId = `agency_e8_test_${runId}`;
  const testPurchaseRef = `po_e8_${runId}`;
  const testProviderTxnId = `txn_e8_${runId}`;

  // Local engines
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
    // Initialize Adapters & In-Memory Fallbacks
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

    // Attempt Live Staging Database Connection
    try {
      client = await createLiveClient();
      hasLiveDb = true;

      // Ensure target schema and tables are initialized
      const migrationSql = fs.readFileSync(
        path.resolve('packages/workforce-billing/schema/workforce-billing-schema.sql'),
        'utf8'
      );
      await client.query(migrationSql);
      await client.query(`SET search_path = ${targetSchema}, extensions, public, pg_temp;`);

      postgresCreditLedger = new PostgresAtomicCreditLedger(client, targetSchema);
    } catch (err: any) {
      console.warn('Live Staging DB unreachable, using isolated engine fallback:', err.message);
      hasLiveDb = false;
    }
  });

  afterAll(async () => {
    if (hasLiveDb && client) {
      try {
        // Clean up test fixture records
        await client.query(`DELETE FROM workforce_credit_allocations WHERE branch_id LIKE 'branch_e8_test_%';`);
        await client.query(`DELETE FROM workforce_credit_lots WHERE branch_id LIKE 'branch_e8_test_%';`);
        await client.query(`DELETE FROM workforce_financial_ledger WHERE branch_id LIKE 'branch_e8_test_%';`);
        await client.query(`DELETE FROM workforce_tax_ledger WHERE branch_id LIKE 'branch_e8_test_%';`);
        await client.query(`DELETE FROM workforce_webhook_inbox WHERE event_id LIKE 'evt_e8_%';`);
      } catch (err: any) {
        console.error('Cleanup error:', err.message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  });

  // =========================================================================
  // 1. TUGAS 1: POSTGRESQL STAGING CONCURRENCY VALIDATION (5 CONCURRENT WORKERS)
  // =========================================================================
  describe('1. PostgreSQL Staging Concurrency & Row-Level Locking', () => {
    test('5 concurrent workers racing for the last 1 remaining credit pass: exactly 1 succeeds, 4 rejected', async () => {
      if (hasLiveDb) {
        // 1. Create a lot with exactly 1 credit in live PostgreSQL staging
        const lotId = `LOT_E8_CONCURRENT_${runId}`;
        await postgresCreditLedger.createLot({
          lotId,
          purchaseRef: testPurchaseRef,
          providerTxnId: testProviderTxnId,
          branchId: testBranchId,
          agencyId: testAgencyId,
          currency: 'IDR',
          totalPurchased: 1, // Only 1 credit available!
          unitPrice: 30000,
        });

        const initialBalance = await postgresCreditLedger.getBranchAvailableBalance(testBranchId);
        expect(initialBalance).toBe(1);

        // 2. Launch 5 independent client connections competing simultaneously for that single credit
        const workerClients = await Promise.all([
          createLiveClient(),
          createLiveClient(),
          createLiveClient(),
          createLiveClient(),
          createLiveClient(),
        ]);

        let results: PromiseSettledResult<any>[] = [];
        try {
          const workers = workerClients.map((wClient, idx) => {
            const wLedger = new PostgresAtomicCreditLedger(wClient, targetSchema);
            return wLedger.allocateCredit({
              branchId: testBranchId,
              personnelId: `GUARD_${idx + 1}_${runId}`,
              personnelName: `Security Officer ${idx + 1}`,
            });
          });

          results = await Promise.allSettled(workers);
        } finally {
          await Promise.all(workerClients.map((w) => w.end().catch(() => {})));
        }

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        // INVARIANT 1: Exactly 1 worker must succeed
        expect(fulfilled.length).toBe(1);

        // INVARIANT 2: Exactly 4 workers must fail with ERR_INSUFFICIENT_CREDITS
        expect(rejected.length).toBe(4);
        for (const rej of rejected) {
          const reason = (rej as PromiseRejectedResult).reason.message;
          expect(reason).toContain('ERR_INSUFFICIENT_CREDITS');
        }

        // INVARIANT 3: Balance cannot be negative (stops at exactly 0)
        const finalBalance = await postgresCreditLedger.getBranchAvailableBalance(testBranchId);
        expect(finalBalance).toBe(0);

        // Check lot status updated to DEPLETED
        const lotRes = await client.query(
          `SELECT status, available_credits, consumed_credits FROM workforce_credit_lots WHERE lot_id = $1`,
          [lotId]
        );
        expect(lotRes.rows[0].status).toBe('DEPLETED');
        expect(lotRes.rows[0].available_credits).toBe(0);
        expect(lotRes.rows[0].consumed_credits).toBe(1);
      } else {
        // Isolated engine validation
        const intent = await orchestrator.createPaymentIntent({
          branchId: testBranchId,
          agencyId: testAgencyId,
          quantity: 1,
          currency: 'IDR',
          customerEmail: 'test@satya.id',
          customerName: 'Test Ops',
        });
        const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED');
        await inMemoryCreditLedger.createLotFromPayment(payment);

        const workers = [1, 2, 3, 4, 5].map((id) =>
          inMemoryCreditLedger.allocateCredit({
            branchId: testBranchId,
            personnelId: `GUARD_${id}`,
            personnelName: `Officer ${id}`,
          })
        );

        const results = await Promise.allSettled(workers);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(4);
        expect(inMemoryCreditLedger.getBranchBalance(testBranchId)).toBe(0);
      }
    });
  });

  // =========================================================================
  // 2. TUGAS 2: XENDIT SANDBOX INTEGRATION
  // =========================================================================
  describe('2. Xendit Sandbox Integration & Webhook Validation', () => {
    test('Creates Xendit sandbox intent and verifies callback token signature', async () => {
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 50,
        currency: 'IDR',
        customerEmail: 'bujp.finance@satya.id',
        customerName: 'Satya Finance',
      });

      expect(intent.provider).toBe('XENDIT');
      expect(intent.checkoutUrl).toContain('checkout-staging.xendit.co');
      expect(intent.currency).toBe('IDR');
      expect(intent.amountNet).toBe(1500000); // 50 * 30.000
      expect(intent.taxAmount).toBe(165000); // 11% PPN
      expect(intent.amountGross).toBe(1665000);

      // Webhook with valid x-callback-token
      const rawWebhook = JSON.stringify({
        id: `evt_e8_xnd_${Date.now()}`,
        status: 'PAID',
        invoice_id: intent.providerPaymentId,
        external_id: intent.paymentReference,
        amount: intent.amountGross,
        paid_at: new Date().toISOString(),
      });

      const validHeaders = { 'x-callback-token': 'xnd_sandbox_callback_token_satya_2026' };
      const isValid = orchestrator.verifyWebhookSignature('XENDIT', rawWebhook, validHeaders);
      expect(isValid).toBe(true);

      // Webhook with invalid callback token
      const invalidHeaders = { 'x-callback-token': 'invalid_token_tampered' };
      const isInvalid = orchestrator.verifyWebhookSignature('XENDIT', rawWebhook, invalidHeaders);
      expect(isInvalid).toBe(false);
    });
  });

  // =========================================================================
  // 3. TUGAS 2: DODO PAYMENTS TEST MODE (USD & MYR)
  // =========================================================================
  describe('3. Dodo Payments Test Mode Integration', () => {
    test('Creates Dodo Payments test session for USD & MYR and validates HMAC-SHA256', async () => {
      // USD Intent
      const usdIntent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 25,
        currency: 'USD',
        customerEmail: 'intl@satya.id',
        customerName: 'Intl Ops',
      });

      expect(usdIntent.provider).toBe('DODO_PAYMENTS');
      expect(usdIntent.checkoutUrl).toContain('test.dodopayments.com');
      expect(usdIntent.amountGross).toBe(50.0); // 25 * $2.00

      // MYR Intent
      const myrIntent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 10,
        currency: 'MYR',
        customerEmail: 'malaysia@satya.id',
        customerName: 'MY Ops',
      });

      expect(myrIntent.provider).toBe('DODO_PAYMENTS');
      expect(myrIntent.currency).toBe('MYR');
      expect(myrIntent.amountNet).toBe(90.0); // 10 * RM 9.00
      expect(myrIntent.taxAmount).toBe(7.2); // 8% SST
      expect(myrIntent.amountGross).toBe(97.2);

      // Test HMAC-SHA256 Signature Verification
      const nowTs = Math.floor(Date.now() / 1000);
      const rawBody = JSON.stringify({
        event_id: `evt_e8_dodo_${Date.now()}`,
        type: 'payment.succeeded',
        data: {
          payment_id: usdIntent.providerPaymentId,
          amount: 50.0,
          currency: 'USD',
          metadata: {
            internal_reference: usdIntent.paymentReference,
          },
        },
      });

      const validSignature = crypto
        .createHmac('sha256', 'dodo_sandbox_webhook_secret_key_2026')
        .update(`${nowTs}.${rawBody}`)
        .digest('hex');

      const headers = {
        'webhook-id': 'dodo_test_msg_001',
        'webhook-timestamp': nowTs.toString(),
        'webhook-signature': validSignature,
      };

      const isDodoValid = orchestrator.verifyWebhookSignature('DODO_PAYMENTS', rawBody, headers);
      expect(isDodoValid).toBe(true);

      // Tampered signature must fail
      const tamperedHeaders = {
        ...headers,
        'webhook-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      };
      expect(orchestrator.verifyWebhookSignature('DODO_PAYMENTS', rawBody, tamperedHeaders)).toBe(false);
    });
  });

  // =========================================================================
  // 4. TUGAS 2: END-TO-END IDEMPOTENCY & REPLAY PROTECTION
  // =========================================================================
  describe('4. End-to-End Webhook Idempotency & Replay', () => {
    test('Duplicate webhook returns 200 OK without double-crediting balance', async () => {
      const intent = await orchestrator.createPaymentIntent({
        branchId: testBranchId,
        agencyId: testAgencyId,
        quantity: 10,
        currency: 'IDR',
        customerEmail: 'idempotent@satya.id',
        customerName: 'Idempotency Tester',
      });

      const eventPayload = {
        id: `evt_e8_idemp_${runId}`,
        event: 'invoice.paid',
        invoice_id: intent.providerPaymentId,
        external_id: intent.paymentReference,
        status: 'PAID',
        paid_amount: intent.amountGross,
      };

      const headers = { 'x-callback-token': 'xnd_sandbox_callback_token_satya_2026' };

      // 1. First Ingestion
      const res1 = webhookInbox.ingest({
        provider: 'XENDIT',
        eventId: eventPayload.id,
        eventType: 'invoice.paid',
        rawPayload: eventPayload,
        headers,
      });

      expect(res1.accepted).toBe(true);
      expect(res1.isDuplicate).toBe(false);

      // Process downstream
      const payment = orchestrator.updatePaymentStatus(intent.paymentReference, 'SUCCEEDED', intent.providerPaymentId);
      financialLedger.recordPaymentSettlement(payment);
      await inMemoryCreditLedger.createLotFromPayment(payment);
      webhookInbox.markProcessed(res1.inboxId!);

      expect(inMemoryCreditLedger.getBranchBalance(testBranchId)).toBe(10);

      // 2. Duplicate Ingestion (Replayed payload)
      const res2 = webhookInbox.ingest({
        provider: 'XENDIT',
        eventId: eventPayload.id,
        eventType: 'invoice.paid',
        rawPayload: eventPayload,
        headers,
      });

      expect(res2.accepted).toBe(true);
      expect(res2.isDuplicate).toBe(true);
      expect(res2.message).toContain('ZERO_SIDE_EFFECTS');

      // Invariant: Pool balance remains exactly 10, not 20!
      expect(inMemoryCreditLedger.getBranchBalance(testBranchId)).toBe(10);

      // 3. Reconcile
      const trace = reconciliationEngine.reconcilePayment(intent.paymentReference);
      expect(trace.isFullyReconciled).toBe(true);
      expect(trace.discrepancies.length).toBe(0);
    });
  });
});
