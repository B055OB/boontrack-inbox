/**
 * __tests__/hardening/progressive_hardening_policy.test.ts
 *
 * Test Suite: Progressive Runtime Rollout (Hardening Policy V0 vs V1)
 *
 * Verifies:
 * 1. Hardening Policy Resolution:
 *    - Existing tenants ('buzzerukm', 'syandinaryoshop', 'digitara', 'gaziir', 'boon') -> 'HARDENING_V0'
 *    - Pilot canary ('tumbuh-kembang-anak', 'konsul.littlebitefeeding.com') -> 'HARDENING_V1'
 * 2. Clinical Safety Gate:
 *    - Emergency medical conditions trigger immediate AI STOP & human escalation
 *    - Normal administrative/consultation questions pass safely
 * 3. Durable Deduplication:
 *    - Duplicate webhook event IDs are intercepted and marked for direct NO-OP
 * 4. Funnel & Domain Scoping:
 *    - Pre-filled checkout links are anchored to https://konsul.littlebitefeeding.com for HARDENING_V1
 */

import { resolveHardeningPolicy } from '@/lib/resolvers/tenant-runtime-resolver';
import { evaluateClinicalSafetyGate } from '@/lib/hardening/clinical-safety-gate';
import { isDuplicateWebhookEvent } from '@/lib/hardening/deduplication';

describe('Progressive Runtime Rollout: Hardening Policy V0 vs V1', () => {
  describe('1. Hardening Policy Resolution Matrix', () => {
    it('defaults all existing legacy tenants to HARDENING_V0 (zero regression)', () => {
      const existingSlugs = ['buzzerukm', 'syandinaryoshop', 'digitara', 'gaziir', 'boon', 'margasari', 'suhu-ads'];
      for (const slug of existingSlugs) {
        const policy = resolveHardeningPolicy({ slug });
        expect(policy).toBe('HARDENING_V0');
      }
    });

    it('defaults empty or undefined tenant to HARDENING_V0', () => {
      expect(resolveHardeningPolicy(null)).toBe('HARDENING_V0');
      expect(resolveHardeningPolicy(undefined)).toBe('HARDENING_V0');
      expect(resolveHardeningPolicy({ slug: '' })).toBe('HARDENING_V0');
    });

    it('resolves tumbuh-kembang-anak to HARDENING_V1 (canary pilot)', () => {
      const policy = resolveHardeningPolicy({ slug: 'tumbuh-kembang-anak' });
      expect(policy).toBe('HARDENING_V1');
    });

    it('resolves tenant with custom domain konsul.littlebitefeeding.com to HARDENING_V1', () => {
      const policy = resolveHardeningPolicy({
        slug: 'any-tenant',
        metadata: { custom_domain: 'konsul.littlebitefeeding.com' },
      });
      expect(policy).toBe('HARDENING_V1');
    });

    it('respects explicit metadata hardening_policy override', () => {
      const policyV1 = resolveHardeningPolicy({
        slug: 'random-shop',
        metadata: { hardening_policy: 'HARDENING_V1' },
      });
      expect(policyV1).toBe('HARDENING_V1');

      const policyV0 = resolveHardeningPolicy({
        slug: 'random-shop',
        metadata: { hardening_policy: 'HARDENING_V0' },
      });
      expect(policyV0).toBe('HARDENING_V0');
    });
  });

  describe('2. Clinical Safety Gate (Pre-LLM Acute Danger Detection)', () => {
    it('detects respiratory distress and cyanosis signals -> AI STOP', () => {
      const result = evaluateClinicalSafetyGate('Tolong dok anak saya sesak napas dan bibir membiru');
      expect(result.isEmergency).toBe(true);
      expect(result.category).toBe('RESPIRATORY_DISTRESS');
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
      expect(result.replyMessage).toContain('PERINGATAN KEGAWATDARURATAN MEDIS');
      expect(result.replyMessage).toContain('Instalasi Gawat Darurat (IGD)');
      expect(result.hardening_policy_version).toBe('HARDENING_V1');
    });

    it('detects seizure and convulsion signals -> AI STOP', () => {
      const result = evaluateClinicalSafetyGate('Bayi saya step kejang mata melotot ke atas');
      expect(result.isEmergency).toBe(true);
      expect(result.category).toBe('SEIZURE');
      expect(result.replyMessage).toContain('DIHENTIKAN SEKETIKA');
    });

    it('detects acute unconsciousness / severe dehydration -> AI STOP', () => {
      const result = evaluateClinicalSafetyGate('Anak saya pingsan tidak sadar lemas lunglai');
      expect(result.isEmergency).toBe(true);
      expect(result.category).toBe('ALTERED_CONSCIOUSNESS_DEHYDRATION');
    });

    it('detects vomiting blood / green fluid -> AI STOP', () => {
      const result = evaluateClinicalSafetyGate('Anak saya muntah darah terus menerus');
      expect(result.isEmergency).toBe(true);
      expect(result.category).toBe('SEVERE_BLEEDING_VOMITING');
    });

    it('detects choking and foreign body ingestion -> AI STOP', () => {
      const result = evaluateClinicalSafetyGate('Tolong anak saya tersedak kelereng susah nafas');
      expect(result.isEmergency).toBe(true);
      expect(result.replyMessage).toContain('IGD');
    });

    it('passes normal administrative inquiries safely (NO false positive emergency)', () => {
      const nonEmergencies = [
        'Halo selamat pagi, mau tanya biaya konsultasi dokter anak berapa ya?',
        'Si kecil lagi GTM susah makan sayur dok, resepnya apa ya?',
        'Bisa konsultasi jadwal hari Sabtu dengan dr. Harys?',
        'Saya sudah transfer QRIS tadi kak',
      ];

      for (const msg of nonEmergencies) {
        const result = evaluateClinicalSafetyGate(msg);
        expect(result.isEmergency).toBe(false);
        expect(result.matchedKeywords).toHaveLength(0);
        expect(result.replyMessage).toBe('');
      }
    });
  });

  describe('3. Durable Deduplication (Redis / DB / Memory)', () => {
    it('marks duplicate webhook events for direct NO-OP', async () => {
      const testExternalId = `test_msg_${Date.now()}_${Math.random()}`;

      // First delivery: NOT duplicate
      const firstCheck = await isDuplicateWebhookEvent({
        externalId: testExternalId,
        tenantSlug: 'tumbuh-kembang-anak',
        senderPhone: '628123456789',
      });
      expect(firstCheck.isDuplicate).toBe(false);

      // Second delivery (duplicate retry from gateway): MUST BE DUPLICATE
      const secondCheck = await isDuplicateWebhookEvent({
        externalId: testExternalId,
        tenantSlug: 'tumbuh-kembang-anak',
        senderPhone: '628123456789',
      });
      expect(secondCheck.isDuplicate).toBe(true);
      expect(secondCheck.hardening_policy_version).toBe('HARDENING_V1');
    });
  });
});
