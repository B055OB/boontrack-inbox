/**
 * WhatsApp Formatter Adapter
 * Adapter untuk mengubah Interactive Menu & Pricing List tenant menjadi format siap kirim:
 * - WABA (WhatsApp Cloud API / On-Premises): Interactive Buttons (<= 3 opsi) atau Interactive Section List (> 3 opsi).
 * - WAHA (WhatsApp HTTP API / Baileys / Chat Session): Teks berpenomoran (1, 2, 3...) ramah parser chat.
 */

export interface InteractiveMenuOption {
  id: string;
  title: string;          // Judul Opsi (max 24 karakter untuk list WABA, 20 untuk button)
  description?: string;    // Deskripsi singkat / harga (max 72 karakter)
  responseText: string;    // Teks balasan bot ketika opsi ini dipilih
}

export interface InteractiveMenu {
  id: string;
  trigger: string;         // Header / Trigger Menu (misal: "Pilih Informasi Mood Booster" atau "Pilih Kapasitas Toren")
  title?: string;          // Judul display alternatif
  description?: string;    // Deskripsi pengantar / petunjuk
  options: InteractiveMenuOption[];
}

export interface WabaReplyButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

export interface WabaListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WabaInteractivePayload {
  type: 'interactive';
  interactive: {
    type: 'button' | 'list';
    header?: {
      type: 'text';
      text: string;
    };
    body: {
      text: string;
    };
    footer?: {
      text: string;
    };
    action: {
      buttons?: WabaReplyButton[];
      button?: string;
      sections?: Array<{
        title: string;
        rows: WabaListRow[];
      }>;
    };
  };
}

/**
 * Format payload untuk WhatsApp Cloud API (WABA)
 * Memastikan safe string truncation pada setiap field agar Meta API tidak mengembalikan 400 Bad Request:
 * - Button title: max 20 karakter
 * - List row title: max 24 karakter
 * - List row description: max 72 karakter
 * - Header text: max 60 karakter
 * - Body text: max 1024 karakter
 * - Footer text: max 60 karakter
 * - Max buttons: 3, Max rows: 10
 */
export function formatWabaInteractive(menuData: InteractiveMenu): WabaInteractivePayload {
  const headerText = String(menuData.trigger || menuData.title || 'Pilih Menu').slice(0, 60);
  const bodyText = String(
    menuData.description ||
    'Silakan pilih salah satu opsi di bawah ini untuk melanjutkan:'
  ).slice(0, 1024);
  const footerText = 'BoonTrack AI Assistant'.slice(0, 60);
  const options = Array.isArray(menuData.options) ? menuData.options : [];

  // Jika opsi <= 3: Gunakan WhatsApp Interactive Buttons (maksimal 3 tombol)
  if (options.length <= 3) {
    const buttons: WabaReplyButton[] = options.slice(0, 3).map((opt, idx) => ({
      type: 'reply',
      reply: {
        id: String(opt.id || `opt_${idx + 1}`).slice(0, 256),
        title: String(opt.title || `Pilihan ${idx + 1}`).slice(0, 20),
      },
    }));

    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: headerText,
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: footerText,
        },
        action: {
          buttons,
        },
      },
    };
  }

  // Jika opsi > 3: Gunakan WhatsApp Interactive List (maksimal 10 rows)
  const rows: WabaListRow[] = options.slice(0, 10).map((opt, idx) => ({
    id: String(opt.id || `opt_${idx + 1}`).slice(0, 200),
    title: String(opt.title || `Opsi ${idx + 1}`).slice(0, 24),
    description: opt.description ? String(opt.description).slice(0, 72) : undefined,
  }));

  const sectionTitle = String(menuData.title || menuData.trigger || 'Daftar Pilihan').slice(0, 24);

  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: headerText,
      },
      body: {
        text: bodyText,
      },
      footer: {
        text: footerText,
      },
      action: {
        button: 'Lihat Pilihan'.slice(0, 20),
        sections: [
          {
            title: sectionTitle,
            rows,
          },
        ],
      },
    },
  };
}

/**
 * Format teks bernomor untuk WAHA / Baileys
 */
export function formatWahaInteractive(menuData: InteractiveMenu): string {
  const header = (menuData.trigger || menuData.title || 'PILIHAN MENU').toUpperCase();
  const desc = menuData.description ? `${menuData.description}\n\n` : '';
  const options = Array.isArray(menuData.options) ? menuData.options : [];

  if (options.length === 0) {
    return `*${header}*\n\n${desc}_(Belum ada opsi pilihan yang dikonfigurasi)_`;
  }

  const listItems = options
    .map((opt, idx) => {
      const num = idx + 1;
      const title = opt.title.trim();
      const detail = opt.description ? `\n   _${opt.description.trim()}_` : '';
      return `*${num}.* *${title}*${detail}`;
    })
    .join('\n\n');

  return `*${header}*\n\n${desc}Silakan balas dengan mengetik *nomor* atau *nama pilihan* Anda:\n\n${listItems}\n\n_Ketik angka pilihan (contoh: 1) untuk melanjutkan._`;
}

/**
 * Adapter Utility Utama
 * Mengembalikan objek JSON Cloud API untuk WABA, atau string plain markdown untuk WAHA
 */
export function formatInteractiveMenu(
  menuData: InteractiveMenu,
  channelType: 'WABA'
): WabaInteractivePayload;
export function formatInteractiveMenu(
  menuData: InteractiveMenu,
  channelType: 'WAHA'
): string;
export function formatInteractiveMenu(
  menuData: InteractiveMenu,
  channelType: 'WABA' | 'WAHA'
): WabaInteractivePayload | string;
export function formatInteractiveMenu(
  menuData: InteractiveMenu,
  channelType: 'WABA' | 'WAHA'
): WabaInteractivePayload | string {
  if (channelType === 'WABA') {
    return formatWabaInteractive(menuData);
  }
  return formatWahaInteractive(menuData);
}

/**
 * Helper untuk mencocokkan input pengguna (baik ID tombol WABA maupun nomor/kata kunci WAHA)
 * dengan responseText yang telah disetting oleh merchant pada satu menu tertentu.
 */
export function findMenuOptionResponse(
  menuData: InteractiveMenu,
  userMessageOrOptionId: string
): InteractiveMenuOption | null {
  if (!menuData || !Array.isArray(menuData.options)) return null;
  const cleanInput = userMessageOrOptionId.trim().toLowerCase();

  // 1. Cek kecocokan persis dengan Option ID (dari WABA button/list reply)
  const byId = menuData.options.find(
    (opt) => opt.id && opt.id.toLowerCase() === cleanInput
  );
  if (byId) return byId;

  // 2. Cek apakah pengguna mengetik nomor urut (WAHA format: "1", "2", dst.)
  const parsedIndex = parseInt(cleanInput, 10);
  if (!isNaN(parsedIndex) && parsedIndex >= 1 && parsedIndex <= menuData.options.length) {
    return menuData.options[parsedIndex - 1];
  }

  // 3. Cek kecocokan berdasarkan judul opsi
  const byTitle = menuData.options.find(
    (opt) =>
      opt.title.toLowerCase() === cleanInput ||
      cleanInput.includes(opt.title.toLowerCase()) ||
      opt.title.toLowerCase().includes(cleanInput)
  );
  if (byTitle) return byTitle;

  return null;
}

/**
 * Helper untuk mencari opsi menu yang cocok di seluruh array interactive_menus tenant.
 */
export function findMenuResponseAcrossMenus(
  menus: InteractiveMenu[],
  userMessageOrOptionId: string
): { menu: InteractiveMenu; option: InteractiveMenuOption } | null {
  if (!Array.isArray(menus) || menus.length === 0) return null;
  for (const menu of menus) {
    const found = findMenuOptionResponse(menu, userMessageOrOptionId);
    if (found) return { menu, option: found };
  }
  return null;
}

/**
 * Cek apakah pesan pengguna memicu pembukaan menu (misal: "menu", "pilihan", atau judul trigger menu).
 */
export function findMatchingMenuTrigger(
  menus: InteractiveMenu[],
  userMessage: string
): InteractiveMenu | null {
  if (!Array.isArray(menus) || menus.length === 0) return null;
  const clean = userMessage.trim().toLowerCase();
  if (!clean) return null;

  // Keyword umum pemanggil menu
  if (/^(menu|pilihan|daftar menu|pilihan menu|help|bantuan|opsi|list)\b/i.test(clean)) {
    return menus[0];
  }

  for (const menu of menus) {
    const trigger = (menu.trigger || menu.title || '').trim().toLowerCase();
    if (trigger && (clean === trigger || clean.includes(trigger) || trigger.includes(clean))) {
      return menu;
    }
  }

  return null;
}

/**
 * Format ringkasan seluruh Interactive Menus untuk diinjeksi ke System Prompt LLM (Mode Hybrid).
 */
export function formatInteractiveMenusSummary(menus: InteractiveMenu[]): string {
  if (!Array.isArray(menus) || menus.length === 0) return '';
  return menus
    .map((m, idx) => {
      const header = m.trigger || m.title || `Menu ${idx + 1}`;
      const opts = (m.options || [])
        .map(
          (o, oIdx) =>
            `  ${oIdx + 1}. [${o.title}]${o.description ? ` (${o.description})` : ''}: ${o.responseText}`
        )
        .join('\n');
      return `### Menu ${idx + 1}: ${header}\n${opts}`;
    })
    .join('\n\n');
}
