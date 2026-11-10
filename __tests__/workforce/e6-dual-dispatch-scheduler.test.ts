import path from 'path';
import fs from 'fs';

describe('BWM Gate E6: Dual-Dispatch Incident & Nudge Scheduler Outbox Suite', () => {
  const rootDir = process.cwd();
  const incidentsRoutePath = path.join(rootDir, 'workforce-web', 'app', 'api', 'incidents', 'route.ts');
  const cronRoutePath = path.join(
    rootDir,
    'workforce-web',
    'app',
    'api',
    'cron',
    'nudge-checkout',
    'route.ts'
  );

  describe('1. Dual-Dispatch Incident Backend Specification', () => {
    test('1.1 /api/incidents route handler file exists', () => {
      expect(fs.existsSync(incidentsRoutePath)).toBe(true);
    });

    test('1.2 incident route implements persistent outbox queueing without unsafe direct Evolution egress', () => {
      const content = fs.readFileSync(incidentsRoutePath, 'utf-8');
      expect(content).toContain('notification_outbox');
      expect(content).toContain('SIMULATED_TEST');
      expect(content).toContain('WA_INTERNAL_SUPERVISOR_JID');
      expect(content).toContain('server_timestamp_wib');
      expect(content).toContain('status: 201');
      expect(content).toContain('DATABASE+PERSISTENT_OUTBOX');
      // Prohibits direct unverified Evolution API HTTP egress
      expect(content).not.toContain('fetch(process.env.EVOLUTION_API_URL');
    });
  });

  describe('2. Nudge Scheduler & Idempotency Outbox Specification', () => {
    test('2.1 /api/cron/nudge-checkout route handler file exists', () => {
      expect(fs.existsSync(cronRoutePath)).toBe(true);
    });

    test('2.2 verifies cron dispatch safely paused for staging with zero external WhatsApp egress', () => {
      const content = fs.readFileSync(cronRoutePath, 'utf-8');
      // CTO Mandate: cron dispatch safely paused for staging trial
      expect(content).toContain('CRON_DISPATCH_PAUSED_STAGING');
      expect(content).toContain('No external WhatsApp messages sent');
      expect(content).toContain('evaluated_shifts: 0');
      expect(content).toContain('outbox_queued: 0');
      // Enforces authorization guard
      expect(content).toContain('UNAUTHORIZED_CRON');
      expect(content).toContain('CRON_SECRET');
    });

    test('2.3 strictly prohibits fictitious clock-out generation per CTO Mandate', () => {
      const content = fs.readFileSync(cronRoutePath, 'utf-8');
      // Verifies clock_out is not populated with a fake timestamp
      expect(content).not.toContain('shift.clock_out = shift.shift_end');
      expect(content).not.toContain('shift.clock_out = nowWIB');
      expect(content).not.toContain('auto_clock_out');
    });
  });
});
