import { ChatConversation } from './TeamChatTab';

const CITIES = [
  'Bandung, Jawa Barat', 'Jakarta Selatan', 'Surabaya, Jawa Timur', 'Semarang, Jawa Tengah',
  'Medan, Sumatera Utara', 'Tangerang, Banten', 'Yogyakarta', 'Depok, Jawa Barat',
  'Bekasi, Jawa Barat', 'Jakarta Barat', 'Malang, Jawa Timur', 'Solo, Jawa Tengah',
  'Bogor, Jawa Barat', 'Palembang, Sumatera Selatan', 'Cirebon, Jawa Barat', 'Batam, Kepulauan Riau',
  'Makassar, Sulawesi Selatan', 'Pekalongan, Jawa Tengah', 'Sukabumi, Jawa Barat', 'Denpasar, Bali',
  'Tasikmalaya, Jawa Barat', 'Pekanbaru, Riau', 'Banjarmasin, Kalimantan Selatan', 'Lampung'
];

function getInitials(name: string): string {
  if (!name) return 'CS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatChatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  if (diffDays <= 0) {
    return `${hh}:${mm} WIB`;
  }
  if (diffDays === 1) {
    return `Kemarin, ${hh}:${mm} WIB`;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${date.getDate()} ${months[date.getMonth()]}, ${hh}:${mm} WIB`;
}

/**
 * Menghasilkan 1.200 - 1.800 percakapan inbox yang ditautkan langsung
 * dengan nama, nomor WhatsApp, produk, dan transaksi dari tabel orders.
 */
export function generateConversationsFromOrders(orders: any[]): ChatConversation[] {
  if (!Array.isArray(orders) || orders.length === 0) {
    return BUZZERUKM_INBOX_CONVERSATIONS;
  }

  // Ambil hingga 1.500 pesanan untuk diselaraskan 1:1 ke percakapan inbox
  const sampleOrders = orders.slice(0, 1600);
  const result: ChatConversation[] = [];

  for (let i = 0; i < sampleOrders.length; i++) {
    const ord = sampleOrders[i];
    const customerName = ord.customer_name || 'Pelanggan Toko';
    const customerPhone = ord.customer_phone || `0812${10000000 + i}`;
    const productTitle = ord.product_title || ord.product_name || 'Kelas Online Dimsum Pro / Resep Masak';
    const grossAmount = Number(ord.gross_amount || ord.total_amount || 99000);
    const invoiceNo = ord.invoice_no || ord.id || `ORD-${i + 1}`;
    const initials = getInitials(customerName);
    const orderDate = new Date(ord.created_at || Date.now() - (i * 25 * 60 * 1000));
    const timeStr = formatChatTime(orderDate);
    const city = CITIES[i % CITIES.length];
    const firstName = customerName.split(' ')[0] || 'Kak';

    // Proporsi Status Lead:
    // - 70% Closed / Lunas (disertai histori bot mengirimkan invoice QRIS dan konfirmasi pembayaran)
    // - 15% Menunggu Pembayaran / Follow Up (Hot Lead)
    // - 10% Tanya-tanya Modul / Konsultasi (Warm Lead)
    // - 5% Cold Lead / Batal
    const bucket = i % 100;

    if (bucket < 70) {
      // ── 70% CLOSED / LUNAS ──────────────────────────────────────────────
      const isOnline = i % 4 === 0;
      const agentAssigned = i % 2 === 0 ? 'my_chat' : 'Rina Pratiwi (CS 1)';
      const agentName = i % 2 === 0 ? 'Anda (CS Aktif)' : 'Rina Pratiwi (CS 1)';

      const isWhitelist = productTitle.toLowerCase().includes('whitelist');
      const closingMsg = isWhitelist
        ? 'Alhamdulillah pembayaran top up saldo berhasil diverifikasi. Saldo iklan sudah di-inject ke BM.'
        : 'Terima kasih kak! Pembayaran sudah kami verifikasi otomatis. Akses materi dan grup VIP sudah aktif di email & WA ini.';

      result.push({
        id: `conv-${ord.id || i + 1}`,
        customerPhone,
        customerName,
        avatarInitials: initials,
        lastMessage: closingMsg,
        time: timeStr,
        status: isOnline ? 'online' : 'offline',
        assignedTo: agentAssigned,
        assignedAgentName: agentName,
        isBotActive: false,
        tag: i % 3 === 0 ? 'Repeat Buyer' : 'Konfirmasi Bayar',
        unreadCount: 0,
        crm: {
          totalOrders: i % 3 === 0 ? 3 : 1,
          lifetimeValue: i % 3 === 0 ? grossAmount * 3 : grossAmount,
          city,
          notes: `Pembeli lunas untuk ${productTitle}. Invoice ${invoiceNo}`,
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: `Halo min, saya mau pesan ${productTitle}. Apakah masih tersedia?`,
            time: '09:10',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: `Halo Kak ${firstName}! Ya, slot ${productTitle} masih dibuka. Berikut tagihan resmi dengan QRIS Dinamis kilat:`,
            time: '09:11',
            isQris: true,
            qrisData: {
              orderId: invoiceNo,
              amount: grossAmount,
              description: productTitle,
              qrValue: `00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1`,
              status: 'PAID',
            },
          },
          {
            id: `msg-${i}-3`,
            sender: 'customer',
            text: `Sudah saya transfer/scan QRIS ya min sebesar Rp ${grossAmount.toLocaleString('id-ID')}.`,
            time: '09:18',
          },
          {
            id: `msg-${i}-4`,
            sender: 'agent',
            senderName: agentName,
            text: closingMsg,
            time: '09:20',
          },
        ],
      });
    } else if (bucket < 85) {
      // ── 15% MENUNGGU PEMBAYARAN / FOLLOW UP (HOT LEAD) ──────────────────
      const followUpMsg = `Halo Kak ${firstName}, tagihan QRIS untuk ${productTitle} masih aktif. Ada kendala saat pembayaran kak?`;

      result.push({
        id: `conv-${ord.id || i + 1}`,
        customerPhone,
        customerName,
        avatarInitials: initials,
        lastMessage: followUpMsg,
        time: timeStr,
        status: 'online',
        assignedTo: 'my_chat',
        assignedAgentName: 'Anda (CS Aktif)',
        isBotActive: false,
        tag: 'Hot Lead',
        unreadCount: 1,
        crm: {
          totalOrders: 0,
          lifetimeValue: 0,
          city,
          notes: `Hot Lead menunggu pembayaran untuk ${productTitle}.`,
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: `Min, saya mau daftar ${productTitle}. Minta tagihan pembayarannya ya.`,
            time: '14:20',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: `Halo Kak ${firstName}! Ini invoice resmi untuk ${productTitle}. Pembayaran mendukung QRIS, Transfer BCA/Mandiri, dan e-Wallet:`,
            time: '14:21',
            isQris: true,
            qrisData: {
              orderId: invoiceNo,
              amount: grossAmount,
              description: productTitle,
              qrValue: `00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1`,
              status: 'WAITING_PAYMENT',
            },
          },
          {
            id: `msg-${i}-3`,
            sender: 'agent',
            senderName: 'Anda (CS Aktif)',
            text: followUpMsg,
            time: '14:35',
          },
        ],
      });
    } else if (bucket < 95) {
      // ── 10% TANYA-TANYA MODUL / KONSULTASI (WARM LEAD) ─────────────────
      const question = productTitle.toLowerCase().includes('dimsum')
        ? 'Min, apakah bahan baku dimsum dan kulit siomay nya mudah dicari di pasar tradisional?'
        : productTitle.toLowerCase().includes('whitelist')
        ? 'Akun Whitelist Meta Ads ini apakah sudah lolos BM verified dan bebas limit spend harian?'
        : 'Di e-course affiliate apakah diajarkan strategi traffic organik TikTok tanpa pasang iklan?';

      const botReply = productTitle.toLowerCase().includes('dimsum')
        ? 'Halo Kak! Sangat mudah kak, seluruh bahan baku ayam, udang, bumbu resto, dan kulit siomay tersedia luas di pasar tradisional atau supermarket terdekat.'
        : productTitle.toLowerCase().includes('whitelist')
        ? 'Halo Kak! Benar sekali, akun whitelist kami sudah verified agency dengan limit spending harian unlimited dan mitigasi anti-restriction.'
        : 'Halo Kak! Betul, diajarkan strategi FYP organik serta alur funnel Click-to-WhatsApp otomatis.';

      result.push({
        id: `conv-${ord.id || i + 1}`,
        customerPhone,
        customerName,
        avatarInitials: initials,
        lastMessage: question,
        time: timeStr,
        status: 'online',
        assignedTo: 'unassigned',
        assignedAgentName: 'Unassigned / AI Bot',
        isBotActive: true,
        tag: 'Tanya Produk',
        unreadCount: 0,
        crm: {
          totalOrders: 0,
          lifetimeValue: 0,
          city,
          notes: `Prospek bertanya modul untuk ${productTitle}.`,
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: question,
            time: '11:15',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: botReply,
            time: '11:16',
          },
        ],
      });
    } else {
      // ── 5% COLD LEAD / BATAL ───────────────────────────────────────────
      result.push({
        id: `conv-${ord.id || i + 1}`,
        customerPhone,
        customerName,
        avatarInitials: initials,
        lastMessage: 'Baik kak, invoice otomatis kadaluarsa. Jika nanti berminat kembali silakan hubungi kami ya.',
        time: timeStr,
        status: 'offline',
        assignedTo: 'unassigned',
        assignedAgentName: 'Unassigned / AI Bot',
        isBotActive: false,
        tag: 'Keluhan',
        unreadCount: 0,
        crm: {
          totalOrders: 0,
          lifetimeValue: 0,
          city,
          notes: 'Invoice kadaluarsa / batal checkout.',
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: 'Min, saya tunda dulu checkoutnya ya, mau koordinasi budget dengan rekan dulu.',
            time: '16:00',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: 'Baik kak, invoice otomatis kadaluarsa. Jika nanti berminat kembali silakan hubungi kami ya.',
            time: '16:01',
          },
        ],
      });
    }
  }

  return result;
}

// ── PRE-GENERATED 1.450 MOCK SESSIONS SEBAGAI DATA AWAL PRESENTASI ───────────
// Menjamin tab inbox langsung menampilkan 1.450 percakapan sebelum atau tanpa query API.
const SAMPLE_NAMES = [
  'Ahmad Pratama', 'Budi Santoso', 'Dian Wijaya', 'Rizky Fauzi', 'Siti Saputra',
  'Eka Kusuma', 'Hendra Hidayat', 'Putri Nugroho', 'Aditya Lestari', 'Maya Ramadhan',
  'Fajar Setiawan', 'Dewi Wahyuni', 'Wahyu Utami', 'Rini Purnomo', 'Dimas Rahmawati',
  'Nita Wibowo', 'Aris Anggraini', 'Tri Firmansyah', 'Bayu Suryani', 'Mega Maulana',
  'Yusuf Permana', 'Fitri Susanti', 'Reza Gunawan', 'Lestari Astuti', 'Bambang Kurniawan',
  'Wulan Damayanti', 'Danang Syahputra', 'Intan Handayani', 'Galih Prasetyo', 'Anisa Maharani',
  'Agus Hermawan', 'Nurul Hartati', 'Indra Subagyo', 'Ratna Purwanti', 'Teguh Kurnia',
  'Ayu Puspitasari', 'Gilang Prakoso', 'Rina Sucipto', 'Bagus Suhartono', 'Desi Octaviani',
  'Fikri Haryanto', 'Sari Widodo', 'Ilham Kosasih', 'Tia Budiman', 'Surya Iskandar',
  'Melinda Halim', 'Rudi Subekti', 'Hani Nasution', 'Denny Siregar', 'Novita Harahap'
];

const SAMPLE_PRODUCTS = [
  { title: 'Kelas Online Dimsum Pro / Resep Masak', price: 99000 },
  { title: 'Belajar Affiliate Produk Digital', price: 199000 },
  { title: '7-Day Sprint CTWA Mastery', price: 100000 },
  { title: 'Top Up Saldo Akun Whitelist Meta & TikTok (Fee 5%)', price: 1000000 },
  { title: 'Top Up Saldo Akun Whitelist Meta & TikTok (Fee 5%)', price: 2000000 },
  { title: 'Top Up Saldo Akun Whitelist Meta & TikTok (Fee 5%)', price: 5000000 }
];

function buildInitialMockConversations(): ChatConversation[] {
  const TOTAL = 1450;
  const list: ChatConversation[] = [];
  const baseTime = new Date('2026-09-19T11:00:00.000Z').getTime();

  for (let i = 0; i < TOTAL; i++) {
    const name = SAMPLE_NAMES[i % SAMPLE_NAMES.length];
    const phone = `0812${String(10000000 + (i * 739) % 89999999).padStart(8, '0')}`;
    const prod = SAMPLE_PRODUCTS[i % SAMPLE_PRODUCTS.length];
    const orderDate = new Date(baseTime - (i * 35 * 60 * 1000)); // terdistribusi ~35 hari
    const timeStr = formatChatTime(orderDate);
    const initials = getInitials(name);
    const city = CITIES[i % CITIES.length];
    const firstName = name.split(' ')[0] || 'Kak';

    const bucket = i % 100;

    if (bucket < 70) {
      // 70% Closed / Lunas
      const isOnline = i % 5 === 0;
      const isMyChat = i % 2 === 0;
      const closingMsg = prod.title.includes('Whitelist')
        ? 'Alhamdulillah pembayaran top up saldo berhasil diverifikasi. Saldo iklan sudah di-inject ke BM.'
        : 'Terima kasih kak! Pembayaran sudah kami verifikasi otomatis. Akses materi dan grup VIP sudah aktif di email & WA ini.';

      list.push({
        id: `conv-mock-${i + 1}`,
        customerPhone: phone,
        customerName: name,
        avatarInitials: initials,
        lastMessage: closingMsg,
        time: timeStr,
        status: isOnline ? 'online' : 'offline',
        assignedTo: isMyChat ? 'my_chat' : 'Rina Pratiwi (CS 1)',
        assignedAgentName: isMyChat ? 'Anda (CS Aktif)' : 'Rina Pratiwi (CS 1)',
        isBotActive: false,
        tag: i % 3 === 0 ? 'Repeat Buyer' : 'Konfirmasi Bayar',
        unreadCount: 0,
        crm: {
          totalOrders: i % 3 === 0 ? 3 : 1,
          lifetimeValue: i % 3 === 0 ? prod.price * 3 : prod.price,
          city,
          notes: `Pembeli lunas untuk ${prod.title}`,
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: `Halo min, saya mau daftar ${prod.title}. Masih ready kuotanya?`,
            time: '10:05',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: `Halo Kak ${firstName}! Ya, pendaftaran ${prod.title} masih dibuka. Silakan selesaikan via QRIS berikut:`,
            time: '10:06',
            isQris: true,
            qrisData: {
              orderId: `INV-${1000 + i}`,
              amount: prod.price,
              description: prod.title,
              qrValue: '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1',
              status: 'PAID',
            },
          },
          {
            id: `msg-${i}-3`,
            sender: 'customer',
            text: `Sudah saya bayar ya min Rp ${prod.price.toLocaleString('id-ID')}.`,
            time: '10:12',
          },
          {
            id: `msg-${i}-4`,
            sender: 'agent',
            senderName: isMyChat ? 'Anda (CS)' : 'Rina Pratiwi',
            text: closingMsg,
            time: '10:14',
          },
        ],
      });
    } else if (bucket < 85) {
      // 15% Hot Lead
      list.push({
        id: `conv-mock-${i + 1}`,
        customerPhone: phone,
        customerName: name,
        avatarInitials: initials,
        lastMessage: `Halo Kak ${firstName}, tagihan QRIS untuk ${prod.title} masih aktif ya. Mau dibantu untuk pembayarannya?`,
        time: timeStr,
        status: 'online',
        assignedTo: 'my_chat',
        assignedAgentName: 'Anda (CS Aktif)',
        isBotActive: false,
        tag: 'Hot Lead',
        unreadCount: 1,
        crm: {
          totalOrders: 0,
          lifetimeValue: 0,
          city,
          notes: `Menunggu pembayaran ${prod.title}`,
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: `Min, saya mau order ${prod.title}. Minta QRIS nya ya.`,
            time: '13:00',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: `Halo Kak ${firstName}! Ini tagihan resmi untuk ${prod.title}:`,
            time: '13:01',
            isQris: true,
            qrisData: {
              orderId: `INV-${1000 + i}`,
              amount: prod.price,
              description: prod.title,
              qrValue: '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1',
              status: 'WAITING_PAYMENT',
            },
          },
          {
            id: `msg-${i}-3`,
            sender: 'agent',
            senderName: 'Anda (CS)',
            text: `Halo Kak ${firstName}, tagihan QRIS untuk ${prod.title} masih aktif ya. Mau dibantu untuk pembayarannya?`,
            time: '13:15',
          },
        ],
      });
    } else if (bucket < 95) {
      // 10% Warm Lead / Tanya Produk
      list.push({
        id: `conv-mock-${i + 1}`,
        customerPhone: phone,
        customerName: name,
        avatarInitials: initials,
        lastMessage: `Min, materi ${prod.title} apakah bisa dipelajari lewat HP atau harus pakai laptop?`,
        time: timeStr,
        status: 'online',
        assignedTo: 'unassigned',
        assignedAgentName: 'Unassigned / AI Bot',
        isBotActive: true,
        tag: 'Tanya Produk',
        unreadCount: 0,
        crm: {
          totalOrders: 0,
          lifetimeValue: 0,
          city,
          notes: `Tanya spek materi ${prod.title}`,
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: `Min, materi ${prod.title} apakah bisa dipelajari lewat HP atau harus pakai laptop?`,
            time: '15:20',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: `Halo Kak ${firstName}! Materi sangat fleksibel dan ramah smartphone, bisa diakses 100% dari HP kak.`,
            time: '15:21',
          },
        ],
      });
    } else {
      // 5% Cold Lead / Batal
      list.push({
        id: `conv-mock-${i + 1}`,
        customerPhone: phone,
        customerName: name,
        avatarInitials: initials,
        lastMessage: 'Baik kak, invoice otomatis kadaluarsa. Jika nanti berminat kembali silakan hubungi kami ya.',
        time: timeStr,
        status: 'offline',
        assignedTo: 'unassigned',
        assignedAgentName: 'Unassigned / AI Bot',
        isBotActive: false,
        tag: 'Keluhan',
        unreadCount: 0,
        crm: {
          totalOrders: 0,
          lifetimeValue: 0,
          city,
          notes: 'Invoice kadaluarsa',
        },
        messages: [
          {
            id: `msg-${i}-1`,
            sender: 'customer',
            text: 'Min, saya belum sempat bayar dan mau pending dulu ya.',
            time: '17:30',
          },
          {
            id: `msg-${i}-2`,
            sender: 'bot',
            senderName: 'BoonPilot AI',
            text: 'Baik kak, invoice otomatis kadaluarsa. Jika nanti berminat kembali silakan hubungi kami ya.',
            time: '17:31',
          },
        ],
      });
    }
  }

  return list;
}

export const BUZZERUKM_INBOX_CONVERSATIONS: ChatConversation[] = buildInitialMockConversations();
