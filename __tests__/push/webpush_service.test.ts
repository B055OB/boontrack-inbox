import {
  classifyPushError,
  deleteStaleSubscription,
  DEFAULT_VAPID_PUBLIC_KEY,
} from '@/lib/webpush-service';

describe('WebPush Service & Error Diagnostics', () => {
  describe('VAPID Configuration', () => {
    it('has a valid P-256 public key length (87 base64url characters)', () => {
      expect(DEFAULT_VAPID_PUBLIC_KEY).toBeDefined();
      expect(DEFAULT_VAPID_PUBLIC_KEY.length).toBe(87);
    });
  });

  describe('classifyPushError', () => {
    it('correctly classifies 410 Gone as EXPIRED_GONE and marks isStale: true', () => {
      const err = { statusCode: 410, body: 'push subscription has unsubscribed or expired.' };
      const info = classifyPushError(err);
      expect(info.type).toBe('EXPIRED_GONE');
      expect(info.isStale).toBe(true);
      expect(info.statusCode).toBe(410);
      expect(info.advice).toContain('auto-cleanup');
    });

    it('correctly classifies 404 Not Found as EXPIRED_GONE and marks isStale: true', () => {
      const err = { statusCode: 404, message: 'Endpoint not found' };
      const info = classifyPushError(err);
      expect(info.type).toBe('EXPIRED_GONE');
      expect(info.isStale).toBe(true);
      expect(info.statusCode).toBe(404);
    });

    it('correctly classifies 403 Forbidden with P-256 curve mismatch as VAPID_MISMATCH', () => {
      const err = {
        statusCode: 403,
        body: 'permission denied: VAPID public key must be on the P-256 curve',
      };
      const info = classifyPushError(err);
      expect(info.type).toBe('VAPID_MISMATCH');
      expect(info.isStale).toBe(false);
      expect(info.statusCode).toBe(403);
      expect(info.reason).toContain('VAPID Authentication mismatch');
    });

    it('correctly classifies 401 Unauthorized as VAPID_MISMATCH', () => {
      const err = {
        statusCode: 401,
        body: 'UnauthorizedRegistration',
      };
      const info = classifyPushError(err);
      expect(info.type).toBe('VAPID_MISMATCH');
      expect(info.isStale).toBe(false);
      expect(info.statusCode).toBe(401);
    });

    it('correctly classifies 400 Bad Request as INVALID_PAYLOAD', () => {
      const err = {
        statusCode: 400,
        body: 'Bad encryption headers',
      };
      const info = classifyPushError(err);
      expect(info.type).toBe('INVALID_PAYLOAD');
      expect(info.isStale).toBe(false);
      expect(info.statusCode).toBe(400);
    });

    it('correctly classifies 413 as PAYLOAD_TOO_LARGE', () => {
      const err = { statusCode: 413 };
      const info = classifyPushError(err);
      expect(info.type).toBe('PAYLOAD_TOO_LARGE');
      expect(info.isStale).toBe(false);
    });

    it('correctly classifies 429 as RATE_LIMITED', () => {
      const err = { statusCode: 429 };
      const info = classifyPushError(err);
      expect(info.type).toBe('RATE_LIMITED');
      expect(info.isStale).toBe(false);
    });
  });

  describe('deleteStaleSubscription (Auto-Cleanup)', () => {
    it('deletes by ID when id is provided', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });
      const mockSupabase = { from: mockFrom };

      const result = await deleteStaleSubscription(mockSupabase, {
        id: 'sub-uuid-123',
        tenant_slug: 'test-shop',
      });

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', 'sub-uuid-123');
    });

    it('deletes by endpoint when id is missing but endpoint is provided', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });
      const mockSupabase = { from: mockFrom };

      const result = await deleteStaleSubscription(mockSupabase, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
        tenant_slug: 'test-shop',
      });

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('endpoint', 'https://fcm.googleapis.com/fcm/send/xyz');
    });

    it('handles database error gracefully without throwing', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: { message: 'Database connection lost' } });
      const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });
      const mockSupabase = { from: mockFrom };

      const result = await deleteStaleSubscription(mockSupabase, {
        id: 'sub-uuid-123',
        tenant_slug: 'test-shop',
      });

      expect(result).toBe(false);
    });
  });
});
