/**
 * scripts/run-outbox-worker.ts
 * Standalone Outbox Worker runner for local development and server environments.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json -e "require('./scripts/run-outbox-worker')"
 *   OR add to package.json:
 *     "worker:outbox": "ts-node scripts/run-outbox-worker.ts"
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WABA_ACCESS_TOKEN  (or configured via whatsapp_connections table)
 *
 * Behavior:
 *   Polls the outbox every POLL_INTERVAL_MS milliseconds.
 *   Gracefully shuts down on SIGINT / SIGTERM.
 */

import { outboxWorker } from '../lib/outbox/worker';
import { multiProviderAdapter } from '../lib/outbox/adapters/multi-provider-adapter';

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS ?? '5000', 10);
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE ?? '10', 10);

let isRunning = true;
let cycleCount = 0;

async function runCycle(): Promise<void> {
  cycleCount++;
  const start = Date.now();

  try {
    const summary = await outboxWorker.runOnce(multiProviderAdapter);
    const elapsed = Date.now() - start;

    if (summary.claimed > 0) {
      console.log(
        `[OutboxWorker] Cycle #${cycleCount} | ` +
        `claimed=${summary.claimed} sent=${summary.sent} ` +
        `retried=${summary.retried} dlq=${summary.dead_lettered} ` +
        `(${elapsed}ms)`
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OutboxWorker] Cycle #${cycleCount} error:`, msg);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(
    `[OutboxWorker] Starting — poll interval: ${POLL_INTERVAL_MS}ms, batch size: ${BATCH_SIZE}`
  );

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    console.log(`\n[OutboxWorker] Received ${signal} — shutting down gracefully...`);
    isRunning = false;
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Main poll loop
  while (isRunning) {
    await runCycle();
    if (isRunning) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log(`[OutboxWorker] Stopped after ${cycleCount} cycles.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[OutboxWorker] Fatal error:', err);
  process.exit(1);
});
