export type TelegramPersonaRole = 'sales_rep' | 'cs_support' | 'custom';

export interface TelegramGroupMapping {
  id: string;
  tenant_slug: string;
  tenant_id?: string;
  group_id: string;
  group_name: string;
  trigger_keyword: string;
  persona_role: TelegramPersonaRole;
  custom_prompt?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const TELEGRAM_ROLE_LABELS: Record<TelegramPersonaRole, string> = {
  sales_rep: 'Sales Representative Toko',
  cs_support: 'CS & Order Support',
  custom: 'Custom Prompt',
};

export const TELEGRAM_ROLE_DESCRIPTIONS: Record<TelegramPersonaRole, string> = {
  sales_rep:
    'Proaktif merekomendasikan katalog produk, menjawab pertanyaan harga & varian, serta mengirim tautan checkout invoice instan ke dalam grup.',
  cs_support:
    'Fokus melayani kendala order, panduan klaim materi digital/akses, cek status pengiriman, dan memberikan eskalasi ke CS manusia.',
  custom:
    'Perilaku bot sepenuhnya dikontrol oleh prompt kustom tambahan yang Anda tentukan secara spesifik untuk kolam/grup ini.',
};
