import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  get7DaySlotsAvailability,
  formatAvailableSlotsForWhatsApp,
  AvailableSlotOption,
} from '@/lib/schedule-slot-service';

export interface FunnelBookingResult {
  isHandled: boolean;
  replyText?: string;
  isBookingCreated?: boolean;
  bookingData?: {
    id: string;
    customer_name: string;
    customer_phone: string;
    address: string;
    service_item: string;
    total_price: number;
    payment_method: string;
    scheduled_at: string;
    status: string;
  };
}

export interface ProcessFunnelMessageParams {
  tenantSlug: string;
  senderPhone: string;
  message: string;
  interactiveReply?: {
    id?: string;
    title?: string;
    type?: string;
  };
}

interface ConversationState {
  step: 'STEP_1_INQUIRY' | 'STEP_2_LOCATION' | 'STEP_3_PAYMENT' | 'STEP_4_SCHEDULE' | 'COMPLETED';
  capacity?: string;
  service_item?: string;
  total_price?: number;
  customer_name?: string;
  address?: string;
  payment_method?: 'QRIS' | 'COD' | string;
  scheduled_at?: string;
  time_slot?: string;
  offered_slots?: AvailableSlotOption[];
}

// In-memory cache fallback untuk conversational session state
const memorySessionStore = new Map<string, { state: ConversationState; updatedAt: number }>();

function getSessionKey(tenantSlug: string, phone: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `${tenantSlug.toLowerCase()}_${cleanPhone || 'anon'}`;
}

// Pricing default untuk paket kuras toren
const TOREN_PRICING: Record<string, number> = {
  '350': 150000,
  '520': 160000,
  '650': 170000,
  '800': 180000,
  '1000': 200000,
  '1500': 275000,
  '2000': 350000,
};

export async function processFunnelBookingMessage(
  params: ProcessFunnelMessageParams
): Promise<FunnelBookingResult> {
  const { tenantSlug, senderPhone, message, interactiveReply } = params;
  const cleanSlug = (tenantSlug || '').trim().toLowerCase();
  const cleanPhone = (senderPhone || '').replace(/[^0-9]/g, '');
  const rawMsg = (interactiveReply?.title || interactiveReply?.id || message || '').trim();
  const lowerMsg = rawMsg.toLowerCase();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { isHandled: false };
  }

  // 1. Ambil data tenant untuk verifikasi apakah tenant ini memiliki interactive_menu
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name, category, metadata')
    .eq('slug', cleanSlug)
    .maybeSingle();

  if (!tenant) {
    return { isHandled: false };
  }

  const metadata = tenant.metadata || {};
  const interactiveMenu = metadata.interactive_menu;
  const menuItems: any[] = Array.isArray(interactiveMenu?.items) ? interactiveMenu.items : [];

  // Jika tenant tidak memiliki menu items sama sekali, serahkan ke handler biasa
  if (menuItems.length === 0) {
    return { isHandled: false };
  }

  // Ambil catalog harga tenant dari metadata.products jika ada
  const tenantProducts: any[] = Array.isArray(metadata.products) ? metadata.products : [];

  // 2. Ambil session state pelanggan
  const sessionKey = getSessionKey(cleanSlug, cleanPhone);
  let session = memorySessionStore.get(sessionKey)?.state;

  // Coba ambil dari database Supabase (conversation_entities) jika in-memory kosong
  if (!session) {
    try {
      const { data: entRow } = await supabase
        .from('conversation_entities')
        .select('*')
        .eq('session_id', sessionKey)
        .maybeSingle();

      if (entRow && entRow.metadata?.funnel_state) {
        session = entRow.metadata.funnel_state;
      }
    } catch {}
  }

  if (!session) {
    session = {
      step: 'STEP_1_INQUIRY',
    };
  }

  // Helper untuk menyimpan state
  const saveState = async (newState: ConversationState) => {
    memorySessionStore.set(sessionKey, { state: newState, updatedAt: Date.now() });
    try {
      await supabase.from('conversation_entities').upsert({
        session_id: sessionKey,
        tenant_id: cleanSlug,
        customer_name: newState.customer_name || null,
        address: newState.address || null,
        metadata: {
          funnel_state: newState,
          updated_at: new Date().toISOString(),
        },
      });
    } catch {}
  };

  // =========================================================================
  // STEP DETECTION & NATURAL EXTRACTION
  // =========================================================================

  // STEP 1: DETEKSI UKURAN TOREN & HARGA
  const capMatch = lowerMsg.match(/\b(350|520|650|800|1000|1500|2000)\b/);
  if (capMatch) {
    const cap = capMatch[1];
    session.capacity = `${cap}L`;
    session.service_item = `Kuras Toren ${cap} Liter`;

    // Cari harga resmi dari produk tenant atau matrix default
    const foundProd = tenantProducts.find((p) => {
      const pName = (p.name || '').toLowerCase();
      return pName.includes(cap);
    });

    session.total_price = foundProd
      ? Number(foundProd.promo_price || foundProd.price)
      : (TOREN_PRICING[cap] || 200000);

    // Otomatis arahkan ke Step 2 (tanya lokasi dan nama)
    session.step = 'STEP_2_LOCATION';
    await saveState(session);

    // Ambil template balasan Step 2 dari interactive_menu jika diset
    const step2Menu = menuItems.find((m) => m.id === 'step_2_closing_signal');
    const replyText = step2Menu?.reply_content ||
      `Siap kak! Layanan ${session.service_item} (Rp ${session.total_price.toLocaleString('id-ID')}) sudah kami siapkan.\n\nAgar tim teknisi kami bisa segera bersiap, boleh diinfo:\n- Dengan Kakak siapa?\n- Alamat lengkap / share location rumahnya di mana kak?`;

    return {
      isHandled: true,
      replyText,
    };
  }

  // STEP 2: DETEKSI SINYAL CLOSING & ALAMAT / NAMA
  const isAddressKeyword = /jalan|jl|perum|perumahan|rt|rw|desa|kecamatan|kelurahan|gang|blok|no\.|karawang|klari|telukjambe|cikampek|rengasdengklok/i.test(lowerMsg);
  const isClosingSignalKeyword = /deal|oke mau pesan|jadwalkan|siap kak|boleh kak|mau kuras|pesan sekarang/i.test(lowerMsg);

  if (session.step === 'STEP_2_LOCATION' || isAddressKeyword) {
    if (isClosingSignalKeyword && !isAddressKeyword && !session.address) {
      // Masih sinyal closing awal, minta alamat
      session.step = 'STEP_2_LOCATION';
      await saveState(session);
      const step2Menu = menuItems.find((m) => m.id === 'step_2_closing_signal');
      return {
        isHandled: true,
        replyText: step2Menu?.reply_content ||
          `Siap kak! Agar teknisi kami bisa segera bersiap, boleh diinfo:\n- Dengan Kakak siapa?\n- Alamat lengkap / share location rumahnya di mana kak?`,
      };
    }

    if (rawMsg.length > 5) {
      // Ekstrak nama pelanggan dan alamat dari pesan
      let extractedName = session.customer_name || '';
      let extractedAddress = rawMsg;

      // Parsing pola "Saya Budi, Alamat ..." atau "Nama: ... Alamat: ..."
      const nameMatch = rawMsg.match(/(?:nama|saya|kak|pak|ibu|dengan)\s+([A-Za-z\s]{2,25})/i);
      if (nameMatch && nameMatch[1]) {
        extractedName = nameMatch[1].trim();
      }

      session.customer_name = extractedName || session.customer_name || 'Pelanggan';
      session.address = extractedAddress;
      session.step = 'STEP_3_PAYMENT';
      await saveState(session);

      const step3Menu = menuItems.find((m) => m.id === 'step_3_payment_method');
      const replyText = step3Menu?.reply_content ||
        `Terima kasih detail alamatnya Kak ${session.customer_name}.\n\nUntuk pembayarannya nanti kakak lebih nyaman via apa?\n1. Transfer Bank / QRIS\n2. Bayar di Tempat (COD setelah toren bersih)`;

      return {
        isHandled: true,
        replyText,
      };
    }
  }

  // STEP 3: DETEKSI PILIHAN METODE PEMBAYARAN
  const isQris = /transfer|qris|bank|bri|bca|mandiri|bayar sekarang/i.test(lowerMsg);
  const isCod = /bayar di tempat|cod|tunai|cash|selesai pengerjaan/i.test(lowerMsg);

  if (session.step === 'STEP_3_PAYMENT' || ((isQris || isCod) && session.address)) {
    session.payment_method = isCod ? 'COD' : 'QRIS';
    session.step = 'STEP_4_SCHEDULE';

    // Ambil ketersediaan slot 7 hari ke depan secara dinamis
    let offeredPrompt = '';
    try {
      const { availableList } = await get7DaySlotsAvailability(cleanSlug, supabase);
      session.offered_slots = availableList.slice(0, 5);
      if (session.offered_slots.length > 0) {
        offeredPrompt = formatAvailableSlotsForWhatsApp(session.offered_slots, 5);
      }
    } catch (err) {
      console.warn('[Booking Service] Error getting 7-day slot availability:', err);
    }

    await saveState(session);

    const step4Menu = menuItems.find((m) => m.id === 'step_4_pick_schedule');
    const fallbackText = step4Menu?.reply_content ||
      `Untuk pengerjaannya, kakak mau dijadwalkan hari apa dan jam berapa? (Tim teknisi siap mulai pkl 08.00 - 16.00 WIB)`;

    const replyText =
      `Baik kak, metode pembayaran *${session.payment_method === 'COD' ? 'Bayar di Tempat (COD)' : 'Transfer / QRIS'}* sudah kami catat! 🗓️\n\n` +
      (offeredPrompt || fallbackText);

    return {
      isHandled: true,
      replyText,
    };
  }

  // STEP 4: DETEKSI JADWAL & JAM KUNJUNGAN -> FINAL BOOKING INSERT TO DATABASE
  const isNumberSelection = /^(?:pilih\s+|nomor\s+|no\.?\s*)?([1-9])\b/i.test(lowerMsg);
  const isScheduleKeyword = /besok|lusa|senin|selasa|rabu|kamis|jumat|sabtu|minggu|hari|pagi|siang|sore|jam|\d{1,2}[:.]\d{2}/i.test(lowerMsg);

  if (
    session.step === 'STEP_4_SCHEDULE' ||
    ((isNumberSelection || isScheduleKeyword) && session.payment_method && session.address)
  ) {
    let resolvedDate = rawMsg;
    let resolvedTimeSlot = rawMsg.match(/\d{1,2}[:.]\d{2}/)
      ? rawMsg.match(/\d{1,2}[:.]\d{2}/)![0]
      : '09:00 - 12:00 WIB';

    // 1. Cek apakah customer memilih nomor dari daftar slot yang ditawarkan
    const numMatch = lowerMsg.match(/(?:pilih\s+|nomor\s+|no\.?\s*)?([1-9])\b/i);
    let chosenSlot: AvailableSlotOption | undefined;

    if (numMatch && Array.isArray(session.offered_slots) && session.offered_slots.length > 0) {
      const idx = parseInt(numMatch[1], 10);
      chosenSlot = session.offered_slots.find((s) => s.optionIndex === idx);
    }

    // 2. Jika tidak memilih angka murni, cocokkan teks natural dengan slot yang ditawarkan
    if (!chosenSlot && Array.isArray(session.offered_slots) && session.offered_slots.length > 0) {
      chosenSlot = session.offered_slots.find((s) => {
        const d = s.displayDate.toLowerCase();
        const t = s.timeSlot.toLowerCase();
        const r = (s.label || '').toLowerCase();
        const matchDay =
          (lowerMsg.includes('besok') && r.includes('besok')) ||
          (lowerMsg.includes('lusa') && r.includes('lusa')) ||
          d.includes(lowerMsg) ||
          lowerMsg.includes(d.split(',')[0].trim().toLowerCase());

        const matchTime = lowerMsg.includes(t.slice(0, 2)) || !lowerMsg.match(/\d{1,2}/);
        return matchDay && matchTime;
      });
    }

    if (chosenSlot) {
      resolvedDate = chosenSlot.displayDate;
      resolvedTimeSlot = chosenSlot.timeSlot;
    }

    session.scheduled_at = resolvedDate;
    session.time_slot = resolvedTimeSlot;

    const bookingId = `BK-${Date.now().toString().slice(-6)}`;
    const finalItem = session.service_item || 'Kuras Toren 1000 Liter';
    const finalPrice = session.total_price || 200000;
    const finalCustomer = session.customer_name || 'Pelanggan';
    const finalPhone = cleanPhone || '6281319929894';
    const finalAddress = session.address || 'Karawang';
    const finalPaymentMethod = session.payment_method || 'COD';
    const finalSchedule = session.scheduled_at;

    // 1. Simpan ke database Supabase tabel 'orders'
    try {
      await supabase.from('orders').insert({
        id: bookingId,
        tenant_slug: cleanSlug,
        product_id: 'srv-kuras-toren',
        product_title: finalItem,
        gross_amount: finalPrice,
        customer_name: finalCustomer,
        customer_phone: finalPhone,
        customer_email: '',
        status: 'AKTIF',
        utm_content: JSON.stringify({
          address: finalAddress,
          scheduled_at: finalSchedule,
          time_slot: session.time_slot,
          payment_method: finalPaymentMethod,
          service_item: finalItem,
          status: 'AKTIF',
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Booking Service] Error inserting order to orders table:', err);
    }

    // 2. Simpan secara persisten ke kolom tenants.metadata.bookings
    try {
      const existingBookings: any[] = Array.isArray(metadata.bookings) ? metadata.bookings : [];
      const newBookingRecord = {
        id: bookingId,
        customerName: finalCustomer,
        phone: finalPhone,
        serviceName: finalItem,
        date: finalSchedule,
        timeSlot: session.time_slot,
        address: finalAddress,
        technicianName: 'Tim Teknisi',
        status: 'AKTIF',
        notes: `Metode: ${finalPaymentMethod} | Estimasi: Rp ${finalPrice.toLocaleString('id-ID')}`,
        created_at: new Date().toISOString(),
      };

      const updatedMetadata = {
        ...metadata,
        bookings: [newBookingRecord, ...existingBookings].slice(0, 100),
      };

      await supabase
        .from('tenants')
        .update({ metadata: updatedMetadata })
        .eq('id', tenant.id);
    } catch (err) {
      console.error('[Booking Service] Error updating tenant metadata bookings:', err);
    }

    // 3. Update status sesi ke COMPLETED
    session.step = 'COMPLETED';
    await saveState(session);

    const confirmationReply =
      `Alhamdulillah, terima kasih banyak Kak ${finalCustomer}! 🎉\n\nJadwal kunjungan teknisi untuk *${finalItem}* sudah berhasil dikonfirmasi dan SLOT DIKUNCI di sistem kami:\n\n` +
      `📋 *Rincian Penugasan Teknisi:*\n` +
      `• No. Booking: *${bookingId}*\n` +
      `• Paket: *${finalItem}*\n` +
      `• Estimasi Biaya: *Rp ${finalPrice.toLocaleString('id-ID')}*\n` +
      `• Pembayaran: *${finalPaymentMethod === 'COD' ? 'Bayar di Tempat (COD Tunai/QRIS)' : 'Transfer Bank / QRIS'}*\n` +
      `• Jadwal Kunjungan: *${finalSchedule}*\n` +
      `• Jam / Slot: *${session.time_slot}*\n` +
      `• Alamat Lokasi: *${finalAddress}*\n\n` +
      `Tim teknisi kami siap meluncur ke lokasi sesuai jadwal. Jika ada pertanyaan atau perubahan jam, Kakak bisa langsung balas chat ini ya. Terima kasih! 🙏`;

    return {
      isHandled: true,
      replyText: confirmationReply,
      isBookingCreated: true,
      bookingData: {
        id: bookingId,
        customer_name: finalCustomer,
        customer_phone: finalPhone,
        address: finalAddress,
        service_item: finalItem,
        total_price: finalPrice,
        payment_method: finalPaymentMethod,
        scheduled_at: finalSchedule,
        status: 'AKTIF',
      },
    };
  }

  // Jika belum cocok dengan langkah funnel khusus, serahkan ke chat engine default
  return { isHandled: false };
}
