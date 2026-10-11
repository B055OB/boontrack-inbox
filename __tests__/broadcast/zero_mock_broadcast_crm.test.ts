import { getGymStats, getGymMembers, getGymAccessLogs } from '@/lib/gym-api';

describe('Production Zero-Mock Acceptance Gate', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Gym API Zero-Mock Fallback Verification', () => {
    it('returns official zero stats instead of mock members when backend is offline', async () => {
      // Mock fetch failure (offline server)
      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

      const stats = await getGymStats('test-tenant');
      expect(stats.total_members).toBe(0);
      expect(stats.active_members).toBe(0);
      expect(stats.recent_logs).toEqual([]);
      expect(stats.controllers_online).toBe(0);
    });

    it('returns empty array [] instead of MOCK_MEMBERS when backend fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Server error 500'));

      const members = await getGymMembers(undefined, 'test-tenant');
      expect(members).toEqual([]);
    });

    it('returns empty array [] instead of MOCK_ACCESS_LOGS when backend fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      const logs = await getGymAccessLogs(undefined, 'test-tenant');
      expect(logs).toEqual([]);
    });
  });
});