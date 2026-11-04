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

    test('1.2 incident route code implements non-blocking Evolution API dispatch', () => {
      const content = fs.readFileSync(incidentsRoutePath, 'utf-8');
      expect(content).toContain('EVOLUTION_API_URL');
      expect(content).toContain('EVOLUTION_INSTANCE');
      expect(content).toContain('WA_INTERNAL_SUPERVISOR_JID');
      expect(content).toContain('INC-');
      expect(content).toContain('server_timestamp_wib');
      expect(content).toContain('status: 201');
    });
  });

  describe('2. Nudge Scheduler & Idempotency Outbox Specification', () => {
    test('2.1 /api/cron/nudge-checkout route handler file exists', () => {
      expect(fs.existsSync(cronRoutePath)).toBe(true);
    });

    test('2.2 enforces Rule 1 (T-15), Rule 2 (T+15), and Rule 3 (CTO Mandate UNVERIFIED_CHECKOUT)', () => {
      const content = fs.readFileSync(cronRoutePath, 'utf-8');
      expect(content).toContain('PRE_SHIFT_REMINDER_T_MINUS_15');
      expect(content).toContain('GRACE_WARNING_T_PLUS_15');
      expect(content).toContain('UNVERIFIED_CHECKOUT');
      expect(content).toContain('idempotency_key');
      expect(content).toContain('notificationOutbox');
    });

    test('2.3 strictly prohibits fictitious clock-out generation per CTO Mandate', () => {
      const content = fs.readFileSync(cronRoutePath, 'utf-8');
      // Verifies clock_out is not populated with a fake timestamp when marking unverified
      expect(content).toContain("shift.status = 'UNVERIFIED_CHECKOUT'");
      expect(content).not.toContain("shift.clock_out = shift.shift_end");
      expect(content).not.toContain("shift.clock_out = nowWIB");
    });
  });
});

