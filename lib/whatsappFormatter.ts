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
 */
export function formatWabaInteractive(menuData: InteractiveMenu): WabaInteractivePayload {
  const headerText = (menuData.trigger || menuData.title || 'Pilih Menu').slice(0, 60);
  const bodyText = (
    menuData.description ||
    'Silakan pilih salah satu opsi di bawah ini untuk melanjutkan:'
  ).slice(0, 1024);
  const options = Array.isArray(menuData.options) ? menuData.options : [];

  // Jika opsi <= 3: Gunakan WhatsApp Interactive Buttons
  if (options.length <= 3) {
    const buttons: WabaReplyButton[] = options.map((opt, idx) => ({
      type: 'reply',
      reply: {
        id: opt.id || `opt_${idx + 1}`,
        title: (opt.title || `Pilihan ${idx + 1}`).slice(0, 20),
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
          text: 'BoonTrack AI Assistant',
        },
        action: {
          buttons,
        },
      },
    };
  }

  // Jika opsi > 3: Gunakan WhatsApp Interactive List (maksimal 10 rows)
  const rows: WabaListRow[] = options.slice(0, 10).map((opt, idx) => ({
    id: opt.id || `opt_${idx + 1}`,
    title: (opt.title || `Opsi ${idx + 1}`).slice(0, 24),
    description: opt.description ? opt.description.slice(0, 72) : undefined,
  }));

  const sectionTitle = (menuData.title || menuData.trigger || 'Daftar Pilihan').slice(0, 24);

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
        text: 'BoonTrack AI Assistant',
      },
      action: {
        button: 'Lihat Pilihan',
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
 * dengan responseText yang telah disetting oleh merchant.
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
