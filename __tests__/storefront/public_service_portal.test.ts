import { getTenantConfig } from '@/lib/tenant-config';

describe('Public Service Portal: Kelurahan Margasari Verification', () => {
  it('1. Provides complete municipal identity for Kelurahan Margasari', () => {
    const config = getTenantConfig('margasari');
    expect(config.title).toBe('Kelurahan Margasari');
    expect(config.subtitle).toBe('Kecamatan Buahbatu, Kota Bandung');
    expect(config.lurah).toBe('Wahyu A. Affandi, S.IP., M.Si.');
    expect(config.address).toContain('Jl. Cipagalo Girang No. 09');
    expect(config.business_type).toBe('B2G');
    expect(config.category).toBe('public_service');
  });

  it('2. Custom packages map directly to the 4 public service cards', () => {
    const config = getTenantConfig('margasari');
    const packages = config.pricing.custom_packages;
    const ids = packages.map(p => p.id);
    expect(ids).toContain('mgs-ikd');
    expect(ids).toContain('mgs-skdu');
    expect(ids).toContain('mgs-kk-ktp');
    expect(ids).toContain('mgs-kbs');
  });

  it('3. Operating hours match official Bandung municipal PTSP schedule', () => {
    const config = getTenantConfig('margasari');
    expect(config.operational_hours.open_time).toBe('08:00');
    expect(config.operational_hours.days).toContain('Senin');
    expect(config.operational_hours.days).toContain('Jumat');
  });
});
