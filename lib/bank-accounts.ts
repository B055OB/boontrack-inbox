/**
 * Dynamic Multi-Tenant Bank Account Resolver
 * 
 * Rules (ARCHITECTURE.md Rule 1 & Rule 8 - Zero Hardcode & Dynamic Multi-Tenant):
 * 1. Read dynamically from tenant record / metadata (bank_accounts, bank_info, payment_config, payment_settings, accounts, etc.).
 * 2. STRICTLY FORBIDDEN: Returning hardcoded / placeholder / dummy accounts 
 *    (such as BCA/Mandiri an PT BOONTRACK INOVASI DIGITAL).
 * 3. If the merchant has not configured bank accounts, return an empty array [].
 */

export interface TenantBankAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

/**
 * Helper to parse a bank string representation into structured components.
 * e.g. "BCA 0940770000 a.n PT SOLUSI GROUP BA" or "BCA - 0940770000"
 */
function parseBankString(str: string): { bank_name?: string; account_number?: string; account_holder?: string } | null {
  if (!str || typeof str !== 'string') return null;
  const numMatch = str.match(/\b\d{4,25}\b/);
  if (!numMatch) return null;
  const accNum = numMatch[0];

  const bankMatch = str.match(/\b(BCA|MANDIRI|BRI|BNI|BSI|CIMB(?:\s+NIAGA)?|PERMATA|DANAMON|JAGO|SEABANK|NEO|OCBC|BTPN|BLU|JENIUS)\b/i);
  const bName = bankMatch ? bankMatch[0].toUpperCase() : undefined;

  let holder: string | undefined;
  const holderMatch = str.match(/(?:a\.?n\.?|atas\s+nama|an)\s*:?\s*([^,()\-]+)/i);
  if (holderMatch && holderMatch[1]) {
    holder = holderMatch[1].trim();
  }

  return {
    bank_name: bName,
    account_number: accNum,
    account_holder: holder,
  };
}

export function extractTenantBankAccounts(tenant: any): TenantBankAccount[] {
  if (!tenant) return [];
  const meta = tenant.metadata || tenant.data?.metadata || tenant.data || tenant;
  const accounts: TenantBankAccount[] = [];

  const defaultHolder =
    meta.bank_holder ||
    meta.bank_account_holder ||
    meta.account_holder ||
    meta.atas_nama ||
    meta.an ||
    meta.nama_rekening ||
    meta.nama_pemilik ||
    meta.store_name ||
    meta.name ||
    tenant.name ||
    'Pemilik Toko';

  const addAccount = (bName?: any, accNum?: any, accHolder?: any) => {
    let cleanNum = String(accNum || '').replace(/[\s-]/g, '').trim();
    let cleanName = String(bName || '').trim().toUpperCase();
    let cleanHolder = String(accHolder || defaultHolder).trim();

    // If accNum is not purely digits or contains bank string like "BCA 123456 a.n Budi"
    if (!/^\d{4,25}$/.test(cleanNum) && typeof accNum === 'string') {
      const parsed = parseBankString(accNum);
      if (parsed?.account_number) {
        cleanNum = parsed.account_number;
        if (!cleanName || cleanName === 'BANK TRANSFER') cleanName = parsed.bank_name || 'BANK TRANSFER';
        if (cleanHolder === defaultHolder && parsed.account_holder) cleanHolder = parsed.account_holder;
      }
    }

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
        account_holder: cleanHolder || defaultHolder,
      });
    }
  };

  const parseBankItem = (item: any) => {
    if (!item) return;
    if (typeof item === 'string') {
      const parsed = parseBankString(item);
      if (parsed?.account_number) {
        addAccount(parsed.bank_name, parsed.account_number, parsed.account_holder);
      }
      return;
    }
    if (typeof item === 'object') {
      // Abaikan jika secara spesifik berstatus dinonaktifkan
      if (item.is_active === false && item.enabled === false) return;

      const bName =
        item.bank_name ||
        item.nama_bank ||
        item.bank ||
        item.bank_code ||
        item.bankName ||
        (item.account_holder || item.holder || item.atas_nama || item.nama_pemilik || item.account_name ? item.name : undefined) ||
        item.name;

      const accNum =
        item.account_number ||
        item.account ||
        item.number ||
        item.rekening ||
        item.no_rekening ||
        item.nomor_rekening ||
        item.no_rek ||
        item.bank_account ||
        item.bank_account_number ||
        item.acc_number ||
        item.accountNumber;

      const accHolder =
        item.account_holder ||
        item.account_name ||
        item.holder ||
        item.atas_nama ||
        item.an ||
        item.nama_rekening ||
        item.nama_pemilik ||
        item.owner_name ||
        item.recipient_name ||
        item.accountHolder ||
        item.nama ||
        (item.bank || item.bank_name || item.nama_bank ? item.name : undefined);

      addAccount(bName, accNum, accHolder);
    }
  };

  // 1. Hierarki Array: langsung di meta, di payment_settings, di payment_config, di manual_config, atau tenant root
  const arraySources = [
    meta.bank_accounts,
    meta.accounts,
    meta.manual_bank_accounts,
    meta.banks,
    meta.bank_transfer,
    meta.bank_settings,
    meta.payment_settings?.bank_accounts,
    meta.payment_settings?.accounts,
    meta.payment_settings?.manual_bank_accounts,
    meta.payment_settings?.bank_transfer,
    meta.payment_settings?.bank_settings,
    meta.payment_config?.bank_accounts,
    meta.payment_config?.accounts,
    meta.payment_config?.manual_bank_accounts,
    meta.payment_config?.manual_config?.bank_accounts,
    meta.payment_config?.manual_config?.accounts,
    meta.payment_config?.bank_transfer,
    meta.payment_config?.bank_settings,
    meta.manual_config?.bank_accounts,
    meta.manual_config?.accounts,
    meta.payment_info?.bank_accounts,
    meta.payment_info?.bank_transfer,
    tenant.bank_accounts,
    tenant.accounts,
    tenant.manual_bank_accounts,
    tenant.bank_transfer,
    tenant.bank_settings,
    tenant.banks,
  ];

  for (const src of arraySources) {
    if (Array.isArray(src)) {
      for (const item of src) {
        parseBankItem(item);
      }
    }
  }

  // 2. Hierarki Objek (Single Account Configurations)
  const objectSources = [
    meta.bank_transfer,
    meta.bank_settings,
    meta.manual_bank,
    meta.bank_info,
    meta.bank,
    meta.payment_info,
    meta.payment_settings?.bank_transfer,
    meta.payment_settings?.bank_settings,
    meta.payment_settings?.manual_bank,
    meta.payment_settings?.bank_info,
    meta.payment_settings?.bank,
    meta.payment_config?.bank_transfer,
    meta.payment_config?.bank_settings,
    meta.payment_config?.manual_bank,
    meta.payment_config?.manual_config?.bank,
    meta.payment_config?.bank,
    meta.manual_config?.bank,
    meta.payment_info?.bank,
    tenant.bank_transfer,
    tenant.bank_settings,
    tenant.manual_bank,
    tenant.bank_info,
    tenant.bank,
  ];

  for (const obj of objectSources) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      parseBankItem(obj);
    } else if (typeof obj === 'string') {
      parseBankItem(obj);
    }
  }

  // 3. Kolom Flat / Primitive (misal: bank_account: "8940770000", bank_name: "BCA")
  const flatAccNum =
    meta.bank_account ||
    meta.bank_account_number ||
    meta.nomor_rekening ||
    meta.no_rekening ||
    meta.no_rek ||
    meta.rekening ||
    meta.acc_number ||
    meta.account_number ||
    tenant.bank_account ||
    tenant.bank_account_number ||
    tenant.nomor_rekening ||
    tenant.no_rekening ||
    tenant.rekening;

  if (flatAccNum) {
    const flatBankName =
      meta.bank_name ||
      meta.bank ||
      meta.nama_bank ||
      meta.bank_code ||
      tenant.bank_name ||
      tenant.bank ||
      tenant.nama_bank ||
      'BANK TRANSFER';

    const flatHolder =
      meta.bank_holder ||
      meta.bank_account_holder ||
      meta.account_holder ||
      meta.atas_nama ||
      meta.an ||
      meta.nama_rekening ||
      meta.nama_pemilik ||
      tenant.bank_holder ||
      tenant.name ||
      defaultHolder;

    addAccount(flatBankName, flatAccNum, flatHolder);
  }

  return accounts;
}

export function hasTenantBankAccounts(tenant: any): boolean {
  return extractTenantBankAccounts(tenant).length > 0;
}
