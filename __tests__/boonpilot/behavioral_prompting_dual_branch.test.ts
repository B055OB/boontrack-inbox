/**
 * @file __tests__/boonpilot/behavioral_prompting_dual_branch.test.ts
 * @description Comprehensive Unit Test Suite for BoonPilot Behavioral Prompting & Knowledge:
 * 1. Condition 1: User Belum Terdaftar (Guest store/dashboard analysis persuasion).
 * 2. Condition 2: User Sudah Terdaftar (Merchant store setup complete vs incomplete greeting scenarios).
 * 3. Additional Guardrails: Single chat bubble & no markdown asterisks on links.
 */

import {
  isTenantSetupComplete,
  buildBoonPilotSystemPrompt,
  processBoonPilotPlatformChat,
} from '@/lib/boonpilot/platform-engine';
import { BoonPilotSenderResolution } from '@/lib/boonpilot/sender-resolver';

describe('BoonPilot Knowledge & Behavioral Prompting', () => {
  const createMockDb = (tenantRow: any = null) => ({
    from: jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: jest.fn(() => ({
            or: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: tenantRow, error: null })),
            })),
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: tenantRow, error: null })),
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

  describe('1. isTenantSetupComplete Helper', () => {
    it('returns false for null, undefined, or empty tenant', () => {
      expect(isTenantSetupComplete(null)).toBe(false);
      expect(isTenantSetupComplete(undefined)).toBe(false);
      expect(
        isTenantSetupComplete({
          id: 't-1',
          slug: 'toko-kosong',
          name: 'Toko Kosong',
          tier: 'SOLO',
          owner_name: 'Budi',
        })
      ).toBe(false);
    });

    it('honors explicit isSetupComplete property on tenant object', () => {
      expect(
        isTenantSetupComplete({
          id: 't-1',
          slug: 'toko-1',
          name: 'Toko 1',
          tier: 'SOLO',
          owner_name: 'Budi',
          isSetupComplete: true,
        } as any)
      ).toBe(true);

      expect(
        isTenantSetupComplete({
          id: 't-1',
          slug: 'toko-1',
          name: 'Toko 1',
          tier: 'SOLO',
          owner_name: 'Budi',
          isSetupComplete: false,
        } as any)
      ).toBe(false);
    });

    it('honors explicit metadata flags (setup_completed, is_setup_complete, is_ready)', () => {
      expect(
        isTenantSetupComplete({
          id: 't-1',
          slug: 'toko-1',
          name: 'Toko 1',
          tier: 'SOLO',
          owner_name: 'Budi',
          metadata: { setup_completed: true },
        })
      ).toBe(true);

      expect(
        isTenantSetupComplete({
          id: 't-1',
          slug: 'toko-1',
          name: 'Toko 1',
          tier: 'SOLO',
          owner_name: 'Budi',
          metadata: { is_setup_complete: true },
        })
      ).toBe(true);

      expect(
        isTenantSetupComplete({
          id: 't-1',
          slug: 'toko-1',
          name: 'Toko 1',
          tier: 'SOLO',
          owner_name: 'Budi',
          metadata: { setup_completed: false },
        })
      ).toBe(false);
    });

    it('returns true when tenant has both active products and configured payment', () => {
      const completeTenant = {
        id: 't-complete',
        slug: 'toko-lengkap',
        name: 'Toko Lengkap',
        tier: 'PRO_SCALE',
        owner_name: 'Siti Aminah',
        metadata: {
          products: [{ id: 'prod-1', name: 'Hijab Instan', price: 75000 }],
          payment_settings: {
            qris_image_url: 'https://cdn.boontrack.com/qris/siti.png',
          },
        },
      };

      expect(isTenantSetupComplete(completeTenant)).toBe(true);
    });

    it('returns false when products or payment configuration is missing', () => {
      const missingPayment = {
        id: 't-no-pay',
        slug: 'toko-no-pay',
        name: 'Toko Tanpa Bayar',
        tier: 'SOLO',
        owner_name: 'Joko',
        metadata: {
          products: [{ id: 'prod-1', name: 'Kaos Polos', price: 50000 }],
        },
      };
      expect(isTenantSetupComplete(missingPayment)).toBe(false);

      const missingProducts = {
        id: 't-no-prod',
        slug: 'toko-no-prod',
        name: 'Toko Tanpa Produk',
        tier: 'SOLO',
        owner_name: 'Joko',
        metadata: {
          payment_settings: {
            bank_accounts: [{ bank: 'BCA', number: '123456789' }],
          },
        },
      };
      expect(isTenantSetupComplete(missingProducts)).toBe(false);
    });
  });

  describe('2. Kondisi 1: User BELUM Terdaftar (GUEST)', () => {
    it('responds persuasively when unregistered guest asks for store/dashboard analysis', async () => {
      const mockDb = createMockDb(null);
      const guestQueries = [
        'Bisa tolong analisa toko saya?',
        'Tolong bedah toko saya dong',
        'Bisa cek performa toko dan audit dashboard?',
        'Mau review toko online saya kak',
      ];

      for (const query of guestQueries) {
        const result = await processBoonPilotPlatformChat(
          {
            senderPhone: '089912345678',
            message: query,
          },
          mockDb
        );

        expect(result.role).toBe('GUEST');
        expect(result.activeEngine).toBe('BOONPILOT_GUEST_ONBOARDING');
        expect(result.isDeterministicMatch).toBe(true);

        // Required persuasive response wording
        expect(result.reply).toContain(
          'Wah saya bisa bantu analisa kak, tapi kalau Kakak sudah jadi seller di BoonTrack Shop pasti saya bantu bedah sampai tuntas! Yuk aktifkan toko Kakak dulu di sini: https://boontrack.com'
        );

        // Additional guardrail: no markdown asterisks on link
        expect(result.reply).not.toContain('*https://boontrack.com*');
        expect(result.reply).not.toMatch(/\*\s*https?:\/\/[^\s*]+\*/);
      }
    });

    it('uses dynamic registration URL from community context in guest analysis pitch', async () => {
      const mockDb = createMockDb(null);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '089912345678',
          message: 'Bisa tolong analisa toko dan dashboard saya?',
          communityContext: {
            demo_store_url: 'https://shop.boontrack.com/boon',
            registration_url: 'https://buzzerukm.boontrack.com',
          },
        },
        mockDb
      );

      expect(result.reply).toContain(
        'Wah saya bisa bantu analisa kak, tapi kalau Kakak sudah jadi seller di BoonTrack Shop pasti saya bantu bedah sampai tuntas! Yuk aktifkan toko Kakak dulu di sini: https://buzzerukm.boontrack.com'
      );
      expect(result.reply).not.toContain('*https://buzzerukm.boontrack.com*');
    });

    it('injects guest store analysis behavioral knowledge into system prompt', () => {
      const prompt = buildBoonPilotSystemPrompt(
        {
          isRegistered: false,
          role: 'GUEST',
          senderPhone: '089912345678',
          normalizedPhone: '6289912345678',
        },
        {
          demo_store_url: 'https://shop.boontrack.com/boon',
          registration_url: 'https://buzzerukm.boontrack.com',
        }
      );

      expect(prompt).toContain('PANDUAN KHUSUS ANALISA TOKO / DASHBOARD (USER BELUM TERDAFTAR)');
      expect(prompt).toContain('Wah saya bisa bantu analisa kak');
      expect(prompt).toContain('https://buzzerukm.boontrack.com');
      expect(prompt).toContain('tanpa markdown bintang pada tautan');
    });
  });

  describe('3. Kondisi 2: User SUDAH Terdaftar sebagai Seller (MERCHANT)', () => {
    const incompleteMerchantRow = {
      id: 'tenant-incomplete-id',
      slug: 'batik-lestari',
      name: 'Batik Lestari Jogja',
      tier: 'SOLO',
      owner_name: 'Raden Mas Joko',
      metadata: {
        owner_name: 'Raden Mas Joko',
        phone: '628111222333',
        whatsapp_number: '628111222333',
        tier: 'SOLO',
        // Incomplete: no products, no payment
      },
    };

    const completeMerchantRow = {
      id: 'tenant-complete-id',
      slug: 'gadget-juara',
      name: 'Gadget Juara Store',
      tier: 'PRO_SCALE',
      owner_name: 'Ahmad Faiz',
      metadata: {
        owner_name: 'Ahmad Faiz',
        phone: '628777888999',
        whatsapp_number: '628777888999',
        tier: 'PRO_SCALE',
        setup_completed: true,
        products: [{ id: 'p-1', name: 'Fast Charger 65W' }],
        payment_settings: { qris_image_url: 'https://cdn.boontrack.com/qris/faiz.png' },
      },
    };

    it('greets registered seller with incomplete data using scenario A', async () => {
      const mockDb = createMockDb(incompleteMerchantRow);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '08111222333',
          message: 'Halo BoonPilot',
        },
        mockDb
      );

      expect(result.role).toBe('MERCHANT');
      expect(result.activeEngine).toBe('BOONPILOT_MERCHANT_COPILOT');
      expect(result.reply).toContain(
        'Halo Kak Raden Mas Joko, toko Batik Lestari Jogja kamu masih belum selesai nih. Yuk kita bantu lengkapin data-datanya biar siap jualan!'
      );
      expect(result.reply).toContain('SOLO');
      // STRICT INVARIANT: Do NOT pitch new store registration to existing merchant!
      expect(result.reply).not.toContain('https://shop.boontrack.com/register');
      expect(result.reply).not.toContain('https://boontrack.com');
    });

    it('greets registered seller with completed data using scenario B', async () => {
      const mockDb = createMockDb(completeMerchantRow);
      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '08777888999',
          message: 'Halo',
        },
        mockDb
      );

      expect(result.role).toBe('MERCHANT');
      expect(result.activeEngine).toBe('BOONPILOT_MERCHANT_COPILOT');
      expect(result.reply).toContain(
        'Halo Kak Ahmad Faiz, toko Gadget Juara Store sudah siap tempur nih! Hari ini mau kita diskusikan strategi penjualan, analisa dan evaluasi performa bisnis, atau ada hal lain yang mau Kakak ceritakan?'
      );
      expect(result.reply).toContain('PRO_SCALE');
      // STRICT INVARIANT: Do NOT pitch new store registration to existing merchant!
      expect(result.reply).not.toContain('https://shop.boontrack.com/register');
      expect(result.reply).not.toContain('https://boontrack.com');
    });

    it('builds system prompt with scenario A for merchant with incomplete data', () => {
      const resolution: BoonPilotSenderResolution = {
        isRegistered: true,
        role: 'MERCHANT',
        senderPhone: '08111222333',
        normalizedPhone: '628111222333',
        tenant: {
          id: 't-inc',
          slug: 'batik-lestari',
          name: 'Batik Lestari Jogja',
          tier: 'SOLO',
          owner_name: 'Raden Mas Joko',
          metadata: {},
        },
      };

      const prompt = buildBoonPilotSystemPrompt(resolution);
      expect(prompt).toContain('SKENARIO DATA BELUM LENGKAP');
      expect(prompt).toContain(
        'Halo Kak Raden Mas Joko, toko Batik Lestari Jogja kamu masih belum selesai nih. Yuk kita bantu lengkapin data-datanya biar siap jualan!'
      );
      expect(prompt).toContain('DILARANG KERAS menawarkan pendaftaran akun baru');
    });

    it('builds system prompt with scenario B for merchant with complete data', () => {
      const resolution: BoonPilotSenderResolution = {
        isRegistered: true,
        role: 'MERCHANT',
        senderPhone: '08777888999',
        normalizedPhone: '628777888999',
        tenant: {
          id: 't-comp',
          slug: 'gadget-juara',
          name: 'Gadget Juara Store',
          tier: 'PRO_SCALE',
          owner_name: 'Ahmad Faiz',
          metadata: { setup_completed: true },
        },
      };

      const prompt = buildBoonPilotSystemPrompt(resolution);
      expect(prompt).toContain('SKENARIO TOKO SUDAH LENGKAP & AKTIF');
      expect(prompt).toContain(
        'Halo Kak Ahmad Faiz, toko Gadget Juara Store sudah siap tempur nih! Hari ini mau kita diskusikan strategi penjualan, analisa dan evaluasi performa bisnis, atau ada hal lain yang mau Kakak ceritakan?'
      );
      expect(prompt).toContain('DILARANG KERAS menawarkan pendaftaran akun baru');
    });
  });

  describe('4. Single Chat Bubble & No Asterisks on URLs Guardrail', () => {
    it('ensures all fallback replies fit in a single message and omit asterisks on URLs', async () => {
      const mockDb = createMockDb(null);

      const guestRes = await processBoonPilotPlatformChat(
        {
          senderPhone: '089912345678',
          message: 'bisa analisa toko saya?',
        },
        mockDb
      );

      // Verify no markdown asterisks bounding the URL
      expect(guestRes.reply).not.toMatch(/\*\s*https?:\/\/[^\s*]+\*/);
      expect(guestRes.reply).toContain('https://boontrack.com');

      // Verify single concise bubble
      expect(guestRes.reply.split('\n\n').length).toBeLessThanOrEqual(3);
    });
  });

  describe('5. Multi-Role Recognition (Affiliate Leader + Merchant)', () => {
    const multiRoleRowKangSakti = {
      id: 'tenant-kang-sakti-uuid',
      slug: 'buzzerukm',
      name: 'Buzzer UKM Store',
      tier: 'TEAM_SCALE',
      owner_name: 'Kang Sakti',
      metadata: {
        owner_name: 'Kang Sakti',
        phone: '6281987654321',
        whatsapp_number: '6281987654321',
        tier: 'TEAM_SCALE',
        is_affiliate_leader: true,
        affiliate_id: 'buzzerukm',
        community_name: 'Buzzer UKM',
      },
    };

    it('greets multi-role partner with specialized affiliate & store greeting', async () => {
      const mockDb = createMockDb(multiRoleRowKangSakti);
      const res = await processBoonPilotPlatformChat(
        {
          senderPhone: '081987654321',
          message: 'Halo BoonPilot',
        },
        mockDb
      );

      expect(res.role).toBe('MERCHANT');
      expect(res.activeEngine).toBe('BOONPILOT_MERCHANT_COPILOT');
      expect(res.reply).toContain(
        'Halo Kang/Kak Kang Sakti! Mau cek performa referral komunitas Buzzer UKM, diskusi strategi toko Buzzer UKM Store, atau ada hal lain yang mau diobrolkan?'
      );
      expect(res.quick_actions).toContain('📊 Cek Performa Referral');
      expect(res.quick_actions).toContain('🏪 Diskusi Strategi Toko');
    });

    it('summarizes community referral performance when affiliate leader asks about referral', async () => {
      const mockDb = createMockDb(multiRoleRowKangSakti);
      const res = await processBoonPilotPlatformChat(
        {
          senderPhone: '081987654321',
          message: 'Gimana performa referral komunitas dan pendaftar kolam saya?',
        },
        mockDb
      );

      expect(res.role).toBe('MERCHANT');
      expect(res.reply).toContain('Status Referral Komunitas Buzzer UKM');
      expect(res.reply).toContain('https://buzzerukm.boontrack.com');
      expect(res.reply).toContain('Attribution Engine');
      expect(res.reply).not.toContain('*https://buzzerukm.boontrack.com*');
    });

    it('redirects to store analysis when affiliate leader asks about personal store performance', async () => {
      const mockDb = createMockDb(multiRoleRowKangSakti);
      const res = await processBoonPilotPlatformChat(
        {
          senderPhone: '081987654321',
          message: 'Mau cek performa toko pribadi saya dong',
        },
        mockDb
      );

      expect(res.role).toBe('MERCHANT');
      expect(res.reply).toContain('performa toko pribadi *Buzzer UKM Store*');
      expect(res.reply).toContain('https://dashboard.boontrack.com');
      expect(res.reply).toContain('Overview');
    });
  });

  describe('6. Status Tenant Expired (Masa Langganan Habis)', () => {
    const expiredTenantRow = {
      id: 'tenant-expired-uuid',
      slug: 'toko-kadaluarsa',
      name: 'Toko Cantik Alami',
      tier: 'PRO_SCALE',
      owner_name: 'Dewi Lestari',
      status: 'expired',
      metadata: {
        owner_name: 'Dewi Lestari',
        phone: '628555444333',
        whatsapp_number: '628555444333',
        tier: 'PRO_SCALE',
        subscription_status: 'expired',
      },
    };

    it('gates internal operational features and greets with subscription upgrade CTA', async () => {
      const mockDb = createMockDb(expiredTenantRow);
      const resGreeting = await processBoonPilotPlatformChat(
        {
          senderPhone: '08555444333',
          message: 'Halo',
        },
        mockDb
      );

      expect(resGreeting.role).toBe('MERCHANT');
      expect(resGreeting.reply).toContain(
        'Halo Kak Dewi Lestari! Masa aktif operasional toko Toko Cantik Alami saat ini sudah berakhir nih.'
      );
      expect(resGreeting.reply).toContain('https://dashboard.boontrack.com');
      expect(resGreeting.reply).toContain('Upgrade / Perpanjangan');
      expect(resGreeting.quick_actions).toContain('🔄 Perpanjang Langganan');

      // Internal operational inquiry also gated
      const resOrder = await processBoonPilotPlatformChat(
        {
          senderPhone: '08555444333',
          message: 'Bisa tolong cek pesanan masuk dan input resi?',
        },
        mockDb
      );
      expect(resOrder.reply).toContain('Masa aktif operasional toko Toko Cantik Alami saat ini sudah berakhir nih');
      expect(resOrder.reply).toContain('https://dashboard.boontrack.com');
    });

    it('answers general feature/educational questions informatively even if subscription expired', async () => {
      const mockDb = createMockDb(expiredTenantRow);
      const resFeature = await processBoonPilotPlatformChat(
        {
          senderPhone: '08555444333',
          message: 'BoonTrack itu keunggulannya apa ya kak?',
        },
        mockDb
      );

      // Must be friendly and informative without rigid rejection
      expect(resFeature.reply).toContain('Single-Page Checkout');
      expect(resFeature.reply).toContain('QRIS Dinamis');
    });
  });
});
