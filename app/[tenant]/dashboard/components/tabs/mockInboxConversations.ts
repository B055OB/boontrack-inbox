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
    return [];
  }

  // Ambil hingga 1.500 pesanan untuk diselaraskan 1:1 ke percakapan inbox
  const sampleOrders = orders.slice(0, 1600);
  const result: ChatConversation[] = [];

  for (let i = 0; i < sampleOrders.length; i++) {
    const ord = sampleOrders[i];
    const customerName = ord.customer_name || 'Pelanggan Toko';
    const customerPhone = ord.customer_phone || `0812${10000000 + i}`;
    const productTitle = ord.product_title || ord.product_name || 'Produk Toko';
    const grossAmount = Number(ord.gross_amount || ord.total_amount || 99000);
    const invoiceNo = ord.invoice_no || ord.id || `ORD-${i + 1}`;
    const initials = getInitials(customerName);
    const orderDate = new Date(ord.created_at || Date.now() - (i * 25 * 60 * 1000));
    const timeStr = formatChatTime(orderDate);
    const city = CITIES[i % CITIES.length];
    const firstName = customerName.split(' ')[0] || 'Kak';

    const isPaid = ord.status === 'PAID' || ord.status === 'COMPLETED';
    const isOnline = i % 4 === 0;
    const isMyChat = i % 2 === 0;

    const closingMsg = isPaid
      ? `Terima kasih Kak ${firstName}! Pembayaran Rp ${grossAmount.toLocaleString('id-ID')} untuk ${productTitle} sudah kami terima. Pesanan sedang diproses.`
      : `Halo Kak ${firstName}, tagihan untuk ${productTitle} sebesar Rp ${grossAmount.toLocaleString('id-ID')} masih aktif. Ada yang bisa kami bantu?`;

    result.push({
      id: `conv-ord-${ord.id || i + 1}`,
      customerPhone,
      customerName,
      avatarInitials: initials,
      lastMessage: closingMsg,
      time: timeStr,
      status: isOnline ? 'online' : 'offline',
      assignedTo: isMyChat ? 'my_chat' : 'Rina Pratiwi (CS 1)',
      assignedAgentName: isMyChat ? 'Anda (CS Aktif)' : 'Rina Pratiwi (CS 1)',
      isBotActive: !isPaid,
      tag: isPaid ? 'Customer Paid' : 'Pending Payment',
      unreadCount: isPaid ? 0 : 1,
      crm: {
        totalOrders: isPaid ? 1 : 0,
        lifetimeValue: isPaid ? grossAmount : 0,
        city,
        notes: `Pesanan #${invoiceNo} (${productTitle})`,
      },
      messages: [
        {
          id: `msg-${ord.id || i}-1`,
          sender: 'customer',
          text: `Halo, saya ingin memesan ${productTitle}.`,
          time: '10:00',
        },
        {
          id: `msg-${ord.id || i}-2`,
          sender: 'bot',
          senderName: 'BoonPilot AI',
          text: `Halo Kak ${firstName}! Berikut rincian pesanan untuk ${productTitle} total Rp ${grossAmount.toLocaleString('id-ID')}:`,
          time: '10:01',
          isQris: true,
          qrisData: {
            orderId: invoiceNo,
            amount: grossAmount,
            description: productTitle,
            qrValue: '00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1',
            status: ord.status || 'PENDING',
          },
        },
        {
          id: `msg-${ord.id || i}-3`,
          sender: isPaid ? 'customer' : 'agent',
          senderName: isPaid ? customerName : 'Anda (CS)',
          text: isPaid ? `Sudah saya bayar ya min Rp ${grossAmount.toLocaleString('id-ID')}.` : `Halo Kak ${firstName}, ada kendala saat pembayaran?`,
          time: '10:15',
        },
        {
          id: `msg-${ord.id || i}-4`,
          sender: 'agent',
          senderName: isMyChat ? 'Anda (CS)' : 'Rina Pratiwi',
          text: closingMsg,
          time: '10:18',
        },
      ],
    });
  }

  return result;
}
