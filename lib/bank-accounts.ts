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

  // 1. Array bank_accounts di root metadata atau tenant
  const rawList =
    meta.bank_accounts ||
    tenant.bank_accounts ||
    meta.payment_config?.manual_config?.bank_accounts ||
    meta.manual_config?.bank_accounts ||
    meta.payment_config?.bank_accounts;

  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      if (item && typeof item === 'object') {
        addAccount(
          item.bank_name || item.name || item.bank,
          item.account_number || item.account || item.number,
          item.account_holder || item.account_name || item.holder
        );
      }
    }
  }

  // 2. Object bank_info / bank / payment_info / manual_config
  const bankObj =
    meta.bank_info ||
    meta.bank ||
    meta.payment_info ||
    meta.payment_config?.manual_config?.bank ||
    meta.manual_config?.bank;

  if (bankObj && typeof bankObj === 'object' && !Array.isArray(bankObj)) {
    addAccount(
      bankObj.bank_name || bankObj.name || bankObj.bank,
      bankObj.account_number || bankObj.account,
      bankObj.account_holder || bankObj.account_name || bankObj.holder
    );
  }

  // 3. Kolom spesifik bank_account_number
  if (meta.bank_account_number) {
    addAccount(
      meta.bank_name || 'BANK TRANSFER',
      meta.bank_account_number,
      meta.bank_account_holder || meta.account_holder
    );
  }

  return accounts;
}

export function hasTenantBankAccounts(tenant: any): boolean {
  return extractTenantBankAccounts(tenant).length > 0;
}
