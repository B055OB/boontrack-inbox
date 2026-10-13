import { getTenantConfig } from '@/lib/tenant-config';

describe('Tenant Config Resolution - Zero Synthetic Fallback Policy', () => {
  it('returns null for unregistered tenant slug (e.g., foundry)', () => {
    const config = getTenantConfig('foundry');
    expect(config).toBeNull();
  });

  it('returns null for arbitrary unregistered slug', () => {
    const config = getTenantConfig('random-unregistered-store-999');
    expect(config).toBeNull();
  });

  it('returns valid config for known default tenant (e.g., margasari)', () => {
    const config = getTenantConfig('margasari');
    expect(config).not.toBeNull();
    expect(config?.name).toBe('Portal Pelayanan Digital Warga Kelurahan Margasari');
    expect(config?.slug).toBe('margasari');
  });
});
