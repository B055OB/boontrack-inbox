/**
 * @file __tests__/boonpilot/sender_resolver_dual_branch.test.ts
 * @description Comprehensive Unit Test Suite for BoonPilot Sender Resolver & Dual-Branch Engine (081215567168).
 */

import {
  resolveBoonPilotSender,
  isOfficialPlatformIdentifier,
} from '@/lib/boonpilot/sender-resolver';
import {
  processBoonPilotPlatformChat,
  buildBoonPilotSystemPrompt,
} from '@/lib/boonpilot/platform-engine';
import { ConversationEngine } from '@/lib/conversationEngine';

describe('BoonPilot Sender Identity Resolver & Dual-Branch Engine', () => {
  const mockRegisteredTenant = {
    id: 'tenant-barokah-uuid',
    slug: 'solusi-barokah',
    name: 'PT Solusi Group Barokah',
    tier: 'PRO_SCALE',
    category: 'DIGITAL',
    business_type: 'DIGITAL',
    metadata: {
      owner_name: 'Budi Santoso',
      phone: '6281234567890',
      whatsapp_number: '6281234567890',
      wa_verified_phone: '6281234567890',
      tier: 'PRO_SCALE',
    },
  };

  const createMockSupabase = (matchedTenant: any = null) => ({
    from: jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: jest.fn(() => ({
            or: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: matchedTenant,
                error: null,
              })),
            })),
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: matchedTenant,
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  });

  describe('1. Platform Identifier Matcher', () => {
    it('recognizes official platform numbers and tenant slugs', () => {
      expect(isOfficialPlatformIdentifier('boon')).toBe(true);
      expect(isOfficialPlatformIdentifier('system')).toBe(true);
      expect(isOfficialPlatformIdentifier('52967979-4760-4cea-b686-cdbdb389c0e1')).toBe(true);
      expect(isOfficialPlatformIdentifier(null, '081215567168')).toBe(true);
      expect(isOfficialPlatformIdentifier(null, '6281215567168')).toBe(true);
      expect(isOfficialPlatformIdentifier(null, '+6281215567168')).toBe(true);
      expect(isOfficialPlatformIdentifier('regular-store', '081999888777')).toBe(false);
    });
  });

  describe('2. Sender Registration Resolution', () => {
    it('returns role: GUEST when sender phone is not registered in Supabase tenants', async () => {
      const mockDb = createMockSupabase(null);
      const res = await resolveBoonPilotSender('089912345678', mockDb);

      expect(res.isRegistered).toBe(false);
      expect(res.role).toBe('GUEST');
      expect(res.tenant).toBeUndefined();
      expect(res.normalizedPhone).toBe('6289912345678');
    });

    it('returns role: MERCHANT with store details when sender phone matches a registered tenant', async () => {
      const mockDb = createMockSupabase(mockRegisteredTenant);
      const res = await resolveBoonPilotSender('081234567890', mockDb);

      expect(res.isRegistered).toBe(true);
      expect(res.role).toBe('MERCHANT');
      expect(res.tenant).toBeDefined();
      expect(res.tenant?.name).toBe('PT Solusi Group Barokah');
      expect(res.tenant?.owner_name).toBe('Budi Santoso');
      expect(res.tenant?.tier).toBe('PRO_SCALE');
    });
  });

  describe('3. Dual-Branch Message Processing (platform-engine)', () => {
    it('handles GUEST greeting: introduces BoonTrack, features, and provides register CTA', async () => {
      const mockDb = createMockSupabase(null);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '089999999999',
          message: 'Halo, selamat siang',
        },
        mockDb
      );

      expect(result.role).toBe('GUEST');
      expect(result.activeEngine).toBe('BOONPILOT_GUEST_ONBOARDING');
      expect(result.reply).toContain('BoonPilot');
      expect(result.reply).toContain('Onboarding Specialist');
      expect(result.reply).toContain('https://shop.boontrack.com/register');
      expect(result.quick_actions).toContain('🚀 Cara Daftar Toko');
    });

    it('handles GUEST registration inquiry: provides clear registration link and steps', async () => {
      const mockDb = createMockSupabase(null);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '089999999999',
          message: 'Gimana cara daftar toko baru di boontrack?',
        },
        mockDb
      );

      expect(result.role).toBe('GUEST');
      expect(result.reply).toContain('https://shop.boontrack.com/register');
      expect(result.reply).toContain('Langkah Pendaftaran');
    });

    it('handles GUEST package inquiry: outlines Solo, Pro Scale, and Team Scale', async () => {
      const mockDb = createMockSupabase(null);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '089999999999',
          message: 'Berapa harga paket langganannya?',
        },
        mockDb
      );

      expect(result.role).toBe('GUEST');
      expect(result.reply).toContain('Paket Solo');
      expect(result.reply).toContain('Paket Pro Scale');
      expect(result.reply).toContain('https://shop.boontrack.com/register');
    });

    it('handles MERCHANT greeting: greets owner by name & store, strictly omits registration link', async () => {
      const mockDb = createMockSupabase(mockRegisteredTenant);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '081234567890',
          message: 'Halo BoonPilot',
        },
        mockDb
      );

      expect(result.role).toBe('MERCHANT');
      expect(result.activeEngine).toBe('BOONPILOT_MERCHANT_COPILOT');
      expect(result.reply).toContain('Budi Santoso');
      expect(result.reply).toContain('PT Solusi Group Barokah');
      expect(result.reply).toContain('PRO_SCALE');
      // STRICT INVARIANT: Do NOT pitch new store registration to existing merchant!
      expect(result.reply).not.toContain('https://shop.boontrack.com/register');
      expect(result.quick_actions).toContain('📊 Cek Ringkasan Toko');
    });

    it('handles MERCHANT order inquiry: guides merchant to dashboard orders tab', async () => {
      const mockDb = createMockSupabase(mockRegisteredTenant);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '081234567890',
          message: 'Bisa bantu cek pesanan masuk dan status resi toko saya?',
        },
        mockDb
      );

      expect(result.role).toBe('MERCHANT');
      expect(result.reply).toContain('Pesanan (Orders)');
      expect(result.reply).toContain('PT Solusi Group Barokah');
      expect(result.reply).not.toContain('https://shop.boontrack.com/register');
    });
  });

  describe('4. LLM System Prompt Builder', () => {
    it('builds secure GUEST prompt enforcing Zero Data Leakage & registration CTA', () => {
      const prompt = buildBoonPilotSystemPrompt({
        isRegistered: false,
        role: 'GUEST',
        senderPhone: '089999999999',
        normalizedPhone: '628999999999',
      });

      expect(prompt).toContain('Onboarding & Platform Specialist');
      expect(prompt).toContain('ZERO-DATA-LEAKAGE');
      expect(prompt).toContain('https://shop.boontrack.com/register');
    });

    it('builds tailored MERCHANT prompt with store name, tier, and anti-registration guard', () => {
      const prompt = buildBoonPilotSystemPrompt({
        isRegistered: true,
        role: 'MERCHANT',
        senderPhone: '081234567890',
        normalizedPhone: '6281234567890',
        tenant: {
          id: 'tenant-barokah-uuid',
          slug: 'solusi-barokah',
          name: 'PT Solusi Group Barokah',
          tier: 'PRO_SCALE',
          owner_name: 'Budi Santoso',
        },
      });

      expect(prompt).toContain('Business Co-Pilot');
      expect(prompt).toContain('PT Solusi Group Barokah');
      expect(prompt).toContain('Budi Santoso');
      expect(prompt).toContain('PRO_SCALE');
      expect(prompt).toContain('DILARANG KERAS menawarkan pendaftaran akun baru');
    });
  });

  describe('5. ConversationEngine Integration', () => {
    it('routes official platform tenant to BoonPilot Dual-Branch Engine in ConversationEngine', async () => {
      const resGuest = await ConversationEngine.process({
        tenant_id: 'boon',
        channel: 'WHATSAPP',
        session_id: '089999999999',
        user_identifier: '089999999999',
        message: 'Halo, saya mau tanya fitur boontrack',
      });

      expect(resGuest.active_engine).toBe('BOONPILOT_GUEST_ONBOARDING');
      expect(resGuest.next_state).toBe('GUEST_ONBOARDING_ACTIVE');
      expect(resGuest.reply).toContain('BoonPilot');
    });
  });
});
