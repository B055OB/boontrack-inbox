import { normalizeTenantSlug, getTenantConfig } from '../lib/tenant-config';
import { getStoreChatGreeting } from '../app/[tenant]/page';
import { getIndustryQuickReplies } from '../lib/zero-ai-engine';

jest.mock('next/navigation', () => ({
  useParams: () => ({ tenant: 'margasari' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('next/dynamic', () => () => {
  const DynamicComponent = () => null;
  DynamicComponent.displayName = 'LoadableComponent';
  return DynamicComponent;
});

describe('Kelurahan Margasari Route & Configuration Verification', () => {
  it('1. normalizeTenantSlug maps margasari and kelurahan-margasari to margasari', () => {
    expect(normalizeTenantSlug('margasari')).toBe('margasari');
    expect(normalizeTenantSlug('kelurahan-margasari')).toBe('margasari');
    expect(normalizeTenantSlug('kelurahan_margasari')).toBe('margasari');
    expect(normalizeTenantSlug('pelayanan-publik')).toBe('margasari');
  });

  it('2. getTenantConfig(margasari) returns exact required fields', () => {
    const config = getTenantConfig('margasari');
    expect(config).toBeDefined();
    expect(config.slug).toBe('margasari');
    expect(config.name).toBe('Portal Pelayanan Digital Warga Kelurahan Margasari');
    expect(config.title).toBe('Kelurahan Margasari');
    expect(config.subtitle).toBe('Kecamatan Buahbatu, Kota Bandung');
    expect(config.category).toBe('public_service');
    expect(config.lurah).toBe('Wahyu A. Affandi, S.IP., M.Si.');
    expect(config.address).toBe('Jl. Cipagalo Girang No. 09, Margasari, Kec. Buahbatu, Kota Bandung');
    expect(config.webhook_verify_token).toBe('kelurahan_margasari_wh_sec_2026');
    expect(config.business_type).toBe('B2G');
    expect(config.pricing.custom_packages.length).toBeGreaterThanOrEqual(4);
  });

  it('3. getTenantConfig(kelurahan-margasari) resolves to margasari configuration', () => {
    const config = getTenantConfig('kelurahan-margasari');
    expect(config).toBeDefined();
    expect(config.slug).toBe('margasari');
    expect(config.title).toBe('Kelurahan Margasari');
    expect(config.lurah).toBe('Wahyu A. Affandi, S.IP., M.Si.');
  });

  it('4. getStoreChatGreeting formats citizen greeting for public service category', () => {
    const greeting = getStoreChatGreeting('public_service', 'Kelurahan Margasari');
    expect(greeting).toContain('Sampurasun');
    expect(greeting).toContain('IKD');
    expect(greeting).toContain('Kelurahan Margasari');
  });

  it('5. getIndustryQuickReplies provides official Margasari service options', () => {
    const replies = getIndustryQuickReplies('public_service', { slug: 'margasari' });
    expect(replies).toContain('Aktivasi IKD / KTP Online Digital');
    expect(replies).toContain('Surat Keterangan Domisili & Usaha (SKDU)');
    expect(replies).toContain('Pengantar KTP-el / KK');
    expect(replies).toContain('Kawasan Bebas Sampah (KBS Margasari)');
  });
});
