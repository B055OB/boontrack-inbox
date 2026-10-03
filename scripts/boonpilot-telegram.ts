/**
 * scripts/boonpilot-telegram.ts
 * Standalone Polling Handler for BoonPilot Telegram Bot (@boontrack_bot)
 *
 * Usage:
 *   npx tsx scripts/boonpilot-telegram.ts
 */

import { startTelegramPolling } from '../lib/telegram/boonpilot-telegram';

console.log('====================================================');
console.log('🤖 BoonPilot Telegram Bot Polling Service Starting');
console.log('====================================================');

const controller = new AbortController();

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Received SIGINT. Stopping polling...');
  controller.abort();
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Received SIGTERM. Stopping polling...');
  controller.abort();
});

startTelegramPolling(controller.signal)
  .then(() => {
    console.log('[POLLING] Polling loop ended cleanly.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[POLLING FATAL ERROR]', err);
    process.exit(1);
  });
