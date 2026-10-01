/**
 * Dynamic Multi-Tenant Bank Account Resolver
 * 
 * Rules (ARCHITECTURE.md Rule 1 & Rule 8 - Zero Hardcode & Dynamic Multi-Tenant):
 * 1. Read dynamically from tenant record / metadata (bank_accounts, bank_info, payment_config, etc.).
 * 2. STRICTLY FORBIDDEN: Returning hardcoded / placeholder / dummy accounts 
 *    (such as BCA/Mandiri an PT BOONTRACK INOVASI DIGITAL).
 * 3. If the merchant has not configured bank accounts, return an empty array [].
 */

export interface TenantBankAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

export function extractTenantBankAccounts(tenant: any): TenantBankAccount[] {
  if (!tenant) return [];
  const meta = tenant.metadata || tenant;
  const accounts: TenantBankAccount[] = [];

  const addAccount = (bName?: string, accNum?: string, accHolder?: string) => {
    const cleanNum = String(accNum || '').replace(/[\s-]/g, '').trim();
    const cleanName = String(bName || '').trim().toUpperCase();
    const cleanHolder = String(accHolder || '').trim();

    // Guard: Abaikan placeholder / mock / rekening fiktif platform
    if (
      !cleanNum ||
      cleanNum.length < 4 ||
      cleanHolder.toUpperCase().includes('BOONTRACK') ||
      cleanName.includes('BOONTRACK') ||
      cleanNum === '8470192344' ||
      cleanNum === '1310018928341'
    ) {
      return;
    }

    // Deduplikasi nomor rekening
    if (!accounts.some((a) => a.account_number === cleanNum)) {
      accounts.push({
        bank_name: cleanName || 'BANK TRANSFER',
        account_number: cleanNum,
        account_holder: cleanHolder || tenant.name || 'Pemilik Toko',
      });
    }
  };

  // Guard: Jika merchant secara eksplisit menonaktifkan transfer bank manual di semua flag
  if (
    meta.is_bank_transfer_active === false &&
    meta.enable_manual_transfer === false &&
    meta.payment_config?.enable_manual_transfer === false
  ) {
    return [];
  }

  // 1. Array bank_accounts / manual_bank_accounts di metadata atau tenant
  const rawList = [
    ...(Array.isArray(meta.manual_bank_accounts) ? meta.manual_bank_accounts : []),
    ...(Array.isArray(tenant.manual_bank_accounts) ? tenant.manual_bank_accounts : []),
    ...(Array.isArray(meta.bank_accounts) ? meta.bank_accounts : []),
    ...(Array.isArray(tenant.bank_accounts) ? tenant.bank_accounts : []),
    ...(Array.isArray(meta.payment_config?.manual_bank_accounts) ? meta.payment_config.manual_bank_accounts : []),
    ...(Array.isArray(meta.payment_config?.bank_accounts) ? meta.payment_config.bank_accounts : []),
    ...(Array.isArray(meta.payment_config?.manual_config?.bank_accounts) ? meta.payment_config.manual_config.bank_accounts : []),
    ...(Array.isArray(meta.payment_settings?.manual_bank_accounts) ? meta.payment_settings.manual_bank_accounts : []),
    ...(Array.isArray(meta.payment_settings?.bank_accounts) ? meta.payment_settings.bank_accounts : []),
    ...(Array.isArray(meta.manual_config?.bank_accounts) ? meta.manual_config.bank_accounts : []),
    ...(Array.isArray(meta.bank_transfer) ? meta.bank_transfer : []),
    ...(Array.isArray(meta.bank_settings) ? meta.bank_settings : []),
  ];

  for (const item of rawList) {
    if (item && typeof item === 'object') {
      if (item.is_active === false || item.enabled === false) continue;
      addAccount(
        item.bank_name || item.name || item.bank || item.nama_bank,
        item.account_number || item.account || item.number || item.rekening || item.no_rekening || item.nomor_rekening || item.no_rek || item.bank_account,
        item.account_holder || item.account_name || item.holder || item.atas_nama || item.an || item.nama_rekening || item.nama_pemilik
      );
    }
  }

  // 2. Object bank_info / bank / payment_info / manual_config / bank_transfer / bank_settings
  const bankObjects = [
    meta.bank_transfer,
    meta.bank_settings,
    meta.manual_bank,
    meta.bank_info,
    meta.bank,
    meta.payment_info,
    meta.payment_config?.manual_config?.bank,
    meta.payment_config?.bank_transfer,
    meta.payment_config?.manual_bank,
    meta.payment_settings?.bank_transfer,
    meta.payment_settings?.bank,
    meta.manual_config?.bank,
  ];

  for (const bankObj of bankObjects) {
    if (bankObj && typeof bankObj === 'object' && !Array.isArray(bankObj)) {
      if (bankObj.is_active === false || (bankObj as any).enabled === false) continue;
      addAccount(
        bankObj.bank_name || bankObj.name || bankObj.bank || bankObj.nama_bank,
        bankObj.account_number || bankObj.account || bankObj.number || bankObj.rekening || bankObj.no_rekening || bankObj.nomor_rekening || bankObj.no_rek || bankObj.bank_account,
        bankObj.account_holder || bankObj.account_name || bankObj.holder || bankObj.atas_nama || bankObj.an || bankObj.nama_rekening || bankObj.nama_pemilik
      );
    }
  }

  // 3. Kolom spesifik bank_account_number / bank_account / nomor_rekening
  if (meta.bank_account || meta.bank_account_number || meta.nomor_rekening || meta.no_rekening) {
    addAccount(
      meta.bank_name || meta.bank || 'BANK TRANSFER',
      meta.bank_account || meta.bank_account_number || meta.nomor_rekening || meta.no_rekening,
      meta.bank_holder || meta.bank_account_holder || meta.account_holder || meta.atas_nama || tenant.name
    );
  }

  return accounts;
}

export function hasTenantBankAccounts(tenant: any): boolean {
  return extractTenantBankAccounts(tenant).length > 0;
}
