/**
 * @file __tests__/storefront/margasari_public_service.test.ts
 * @description Unit tests verifying Kelurahan Margasari public service knowledge base,
 * tenant configuration, and quick reply resolution.
 */

import { getTenantConfig, normalizeTenantSlug, DEFAULT_TENANT_CONFIGS } from '@/lib/tenant-config';
import { getIndustryQuickReplies, buildDefaultIndustryMenu } from '@/lib/zero-ai-engine';

describe('Kelurahan Margasari Public Service Deployment Verification', () => {
  describe('Tenant Configuration & Identitas Kelurahan', () => {
    it('should resolve margasari slug through normalizeTenantSlug', () => {
      expect(normalizeTenantSlug('margasari')).toBe('margasari');
      expect(normalizeTenantSlug('kelurahan-margasari')).toBe('margasari');
      expect(normalizeTenantSlug('pelayanan-publik')).toBe('margasari');
      expect(normalizeTenantSlug('indra-public')).toBe('margasari');
    });

    it('should provide complete operational data for Kelurahan Margasari', () => {
      const config = getTenantConfig('margasari');
      expect(config).toBeDefined();
      expect(config.name).toContain('Kelurahan Margasari');
      expect(config.title).toBe('Kelurahan Margasari');

      // Lurah Wahyu A. Affandi, S.IP., M.Si.
      expect(config.persona.system_prompt).toContain('Wahyu A. Affandi');
      expect(config.persona.system_prompt).toContain('Jl. Cipagalo Girang No. 09');
      expect(config.persona.system_prompt).toContain('Kec. Buahbatu, Kota Bandung');

      // Jam Pelayanan: Senin - Jumat 08:00 - 15:00 WIB
      expect(config.operational_hours.open_time).toBe('08:00');
      expect(config.operational_hours.close_time).toBe('15:00');
      expect(config.operational_hours.days).toEqual(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']);

      // Packages include IKD, SKDU, KK/KTP, KBS
      const pkgNames = config.pricing.custom_packages.map((p) => p.name);
      expect(pkgNames).toContain('Aktivasi IKD / KTP Online Digital');
      expect(pkgNames).toContain('Surat Keterangan Domisili & Usaha (SKDU)');
      expect(pkgNames).toContain('Surat Pengantar KTP-el / KK');
      expect(pkgNames).toContain('Kawasan Bebas Sampah (KBS Margasari)');

      // ZERO Hardcoding / Mock Leakage Check
      const configJson = JSON.stringify(config);
      expect(configJson).not.toContain('Kebon Melati');
      expect(configJson).not.toContain('Jakarta Pusat');
      expect(configJson).not.toContain('Kelurahan Indra');
    });
  });

  describe('Quick Replies Resolution (Portal Warga)', () => {
    it('should include Aktivasi IKD in portal warga quick replies by slug', () => {
      const qrMargasari = getIndustryQuickReplies(undefined, { slug: 'margasari' });
      expect(qrMargasari).toContain('Aktivasi IKD / KTP Online Digital');
      expect(qrMargasari[0]).toBe('Aktivasi IKD / KTP Online Digital');
    });

    it('should include Aktivasi IKD in portal warga quick replies by PUBLIC_SERVICE category', () => {
      const qrPublic = getIndustryQuickReplies('PUBLIC_SERVICE', { slug: 'pelayanan-publik' });
      expect(qrPublic).toContain('Aktivasi IKD / KTP Online Digital');
      expect(qrPublic).toContain('Surat Keterangan Domisili & Usaha (SKDU)');
      expect(qrPublic).toContain('Pengantar KTP-el / KK');
      expect(qrPublic).toContain('Kawasan Bebas Sampah (KBS Margasari)');
    });

    it('should inject Aktivasi IKD if custom metadata quick_replies exist without IKD', () => {
      const qrCustom = getIndustryQuickReplies('PUBLIC_SERVICE', {
        slug: 'margasari',
        quick_replies: ['Info Jam Kerja', 'Kontak WhatsApp'],
      });
      expect(qrCustom).toContain('Aktivasi IKD / KTP Online Digital');
      expect(qrCustom).toContain('Info Jam Kerja');
    });
  });

  describe('Portal Warga Interactive Menu', () => {
    it('should build dedicated portal warga interactive menu for Margasari', () => {
      const menu = buildDefaultIndustryMenu('PUBLIC_SERVICE', {
        name: 'Kelurahan Margasari',
        slug: 'margasari',
      });

      expect(menu.id).toBe('menu_portal_warga');
      expect(menu.options.length).toBe(7);
      expect(menu.options[0].title).toContain('Aktivasi IKD / KTP Online Digital');
      expect(menu.options[1].title).toContain('Surat Domisili & Usaha (SKDU)');
      expect(menu.options[2].title).toContain('Pengantar KTP-el / KK');
      expect(menu.options[3].title).toContain('Kawasan Bebas Sampah (KBS)');
      expect(menu.options[6].description).toContain('Jl. Cipagalo Girang No. 09 (08:00 - 15:00 WIB)');
    });
  });
});
