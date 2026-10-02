import { extractTenantBankAccounts, hasTenantBankAccounts } from '@/lib/bank-accounts';

describe('extractTenantBankAccounts & hasTenantBankAccounts', () => {
  it('should resolve bank account from solusi-ads Supabase tenant metadata accurately', () => {
    const tenantSolusiAds = {
      id: '46cf50c6-18ff-4c1d-88a4-d86001d754c7',
      slug: 'solusi-ads',
      name: 'Solusi Ads Agency',
      tier: 'ADS_PERFORMANCE',
      metadata: {
        is_bank_transfer_active: true,
        bank_accounts: [
          {
            enabled: true,
            bank_name: 'BCA',
            is_active: true,
            account_holder: 'PT SOLUSI GROUP BAROKAH',
            account_number: '8940770000',
          },
        ],
        bank_transfer: {
          enabled: true,
          bank_name: 'BCA',
          is_active: true,
          account_holder: 'PT SOLUSI GROUP BAROKAH',
          account_number: '8940770000',
        },
        bank_settings: {
          enabled: true,
          bank_name: 'BCA',
          is_active: true,
          account_holder: 'PT SOLUSI GROUP BAROKAH',
          account_number: '8940770000',
        },
        payment_config: {
          mode: 'MANUAL_TRANSFER',
          provider: 'MANUAL_TRANSFER',
          enable_qris: false,
          enable_bank_transfer: true,
          enable_manual_transfer: true,
        },
        payment_settings: {
          provider: 'MANUAL_TRANSFER',
          enable_qris: false,
          enable_bank_transfer: true,
          enable_manual_transfer: true,
        },
      },
    };

    const accounts = extractTenantBankAccounts(tenantSolusiAds);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual({
      bank_name: 'BCA',
      account_number: '8940770000',
      account_holder: 'PT SOLUSI GROUP BAROKAH',
    });
    expect(hasTenantBankAccounts(tenantSolusiAds)).toBe(true);
  });

  it('should resolve accounts when passed metadata directly', () => {
    const metaDirect = {
      bank_settings: {
        bank_name: 'BCA',
        account_number: '0940770000',
        account_holder: 'PT SOLUSI GROUP BA',
        enabled: true,
      },
      is_bank_transfer_active: true,
    };

    const accounts = extractTenantBankAccounts(metaDirect);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].account_number).toBe('0940770000');
    expect(accounts[0].account_holder).toBe('PT SOLUSI GROUP BA');
  });

  it('should resolve fallback fields with Indonesian aliases (nama_bank, no_rekening, atas_nama)', () => {
    const tenantWithAliases = {
      name: 'Toko Sukses',
      metadata: {
        manual_bank_accounts: [
          {
            nama_bank: 'Mandiri',
            no_rekening: '1370009988776',
            atas_nama: 'Budi Santoso',
          },
        ],
      },
    };

    const accounts = extractTenantBankAccounts(tenantWithAliases);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual({
      bank_name: 'MANDIRI',
      account_number: '1370009988776',
      account_holder: 'Budi Santoso',
    });
  });

  it('should resolve from root flat metadata columns', () => {
    const flatTenant = {
      name: 'Toko Fashion',
      metadata: {
        bank_name: 'BNI',
        bank_account: '0123456789',
        bank_holder: 'Siti Rahma',
        is_bank_transfer_active: true,
      },
    };

    const accounts = extractTenantBankAccounts(flatTenant);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual({
      bank_name: 'BNI',
      account_number: '0123456789',
      account_holder: 'Siti Rahma',
    });
  });

  it('should resolve accounts from metadata.accounts schema', () => {
    const tenantWithAccounts = {
      name: 'Buatin Video Store',
      metadata: {
        accounts: [
          {
            bank: 'BCA',
            number: '0940770000',
            name: 'PT SOLUSI GROUP BA',
          },
        ],
      },
    };

    const accounts = extractTenantBankAccounts(tenantWithAccounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual({
      bank_name: 'BCA',
      account_number: '0940770000',
      account_holder: 'PT SOLUSI GROUP BA',
    });
  });

  it('should resolve bank account from string representation with regex parsing', () => {
    const stringTenant = {
      name: 'Agensi Kreatif',
      metadata: {
        bank: 'BCA 0940770000 a.n PT SOLUSI GROUP BA',
      },
    };

    const accounts = extractTenantBankAccounts(stringTenant);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual({
      bank_name: 'BCA',
      account_number: '0940770000',
      account_holder: 'PT SOLUSI GROUP BA',
    });
  });

  it('should resolve nested payment_settings and payment_config bank accounts', () => {
    const nestedTenant = {
      name: 'Pro Tenant Store',
      metadata: {
        payment_settings: {
          bank_accounts: [
            {
              bank_name: 'BRI',
              account_number: '012301000123501',
              account_holder: 'Ahmad Yani',
            },
          ],
        },
        payment_config: {
          manual_config: {
            bank: {
              bank_name: 'BSI',
              account_number: '7123456789',
              account_holder: 'Ahmad Yani Syariah',
            },
          },
        },
      },
    };

    const accounts = extractTenantBankAccounts(nestedTenant);
    expect(accounts).toHaveLength(2);
    expect(accounts[0].bank_name).toBe('BRI');
    expect(accounts[0].account_number).toBe('012301000123501');
    expect(accounts[1].bank_name).toBe('BSI');
    expect(accounts[1].account_number).toBe('7123456789');
  });

  it('should deduplicate identical account numbers across multiple schema paths', () => {
    const multiPathTenant = {
      name: 'Duplicate Guard Store',
      metadata: {
        bank_accounts: [
          {
            bank_name: 'BCA',
            account_number: '0940770000',
            account_holder: 'PT SOLUSI GROUP BA',
          },
        ],
        accounts: [
          {
            bank_name: 'BCA',
            account_number: '0940-770-000', // formatted with dashes
            account_holder: 'PT SOLUSI GROUP BA',
          },
        ],
        bank_account: '0940770000',
        bank_name: 'BCA',
      },
    };

    const accounts = extractTenantBankAccounts(multiPathTenant);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].account_number).toBe('0940770000');
  });

  it('should ignore placeholder and mock Boontrack accounts', () => {
    const mockTenant = {
      name: 'Dummy Store',
      metadata: {
        bank_accounts: [
          {
            bank_name: 'BCA',
            account_number: '8470192344',
            account_holder: 'PT BOONTRACK INOVASI DIGITAL',
          },
        ],
      },
    };

    const accounts = extractTenantBankAccounts(mockTenant);
    expect(accounts).toEqual([]);
    expect(hasTenantBankAccounts(mockTenant)).toBe(false);
  });

  it('should return empty array if tenant is null or has no bank accounts', () => {
    expect(extractTenantBankAccounts(null)).toEqual([]);
    expect(extractTenantBankAccounts({})).toEqual([]);
    expect(hasTenantBankAccounts(null)).toBe(false);
  });
});

