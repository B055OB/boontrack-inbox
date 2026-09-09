import { createClient } from '@supabase/supabase-js';

function getEngineSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-anon-key';
  return createClient(supabaseUrl, supabaseKey);
}

export interface ProcessMessagePayload {
  tenant_id: string;
  channel: 'WEBCHAT' | 'WHATSAPP';
  session_id: string;
  user_identifier: string;
  message: string;
}

export interface EngineResult {
  reply: string;
  next_state: string;
  state_trace: string[];
  entities: Record<string, any>;
  is_booking_ready: boolean;
}

interface ServiceConfigItem {
  capacity: number;
  price: number;
  [key: string]: any;
}

export class ConversationEngine {
  static async process(payload: ProcessMessagePayload): Promise<EngineResult> {
    const supabase = getEngineSupabase();
    const { tenant_id, channel, session_id, user_identifier, message } = payload;
    const cleanMsg = message.trim();
    const trace: string[] = [];

    // 1. Ambil Sesi & State Saat Ini
    let { data: session } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('session_id', session_id)
      .maybeSingle();

    if (!session) {
      const { data: newSession } = await supabase
        .from('conversation_sessions')
        .insert({
          tenant_id,
          session_id,
          channel,
          user_identifier,
          current_state: 'GREETING'
        })
        .select()
        .single();
      session = newSession || { current_state: 'GREETING' };
    }

    trace.push(session.current_state);

    // 2. Ambil Entity Terkumpul
    let { data: entities } = await supabase
      .from('conversation_entities')
      .select('*')
      .eq('session_id', session_id)
      .maybeSingle();

    if (!entities) {
      entities = {
        session_id,
        tenant_id,
        capacity: null,
        price: null,
        customer_name: null,
        address: null,
        scheduled_date: null,
        scheduled_time: null
      };
    }

    // 3. Ambil Daftar Harga Resmi Deterministic
    const { data: serviceList } = await supabase
      .from('tenant_service_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('capacity', { ascending: true });

    const services: ServiceConfigItem[] = (serviceList as ServiceConfigItem[]) || [];

    // --- STEP A: DETERMINISTIC ROUTER (ON-TRACK FLOW) ---
    
    // GREETING -> Tampilkan Opsi Kapasitas
    if (session.current_state === 'GREETING') {
      const optionsText = services.length > 0
        ? services
            .map((s: ServiceConfigItem) => `• *${s.capacity} Liter* : Rp ${Number(s.price).toLocaleString('id-ID')}`)
            .join('\n')
        : '• *350 Liter* : Rp 130.000\n• *520 Liter* : Rp 160.000\n• *1000 Liter* : Rp 200.000';

      await supabase
        .from('conversation_sessions')
        .update({ current_state: 'ASK_CAPACITY' })
        .eq('session_id', session_id);

      trace.push('ASK_CAPACITY');
      return {
        reply: `Halo Kak! Selamat datang di layanan *Kuras Toren*. 🚰\n\nUntuk estimasi biaya, toren airnya ukuran berapa liter kak?\n\n*Pilihan Kapasitas:*\n${optionsText}\n\nKetik angkanya saja ya Kak (misal: *520*).`,
        next_state: 'ASK_CAPACITY',
        state_trace: trace,
        entities,
        is_booking_ready: false
      };
    }

    // MATCHING CAPACITY (Deterministik Regex / Number Check)
    const matchedNumber = cleanMsg.match(/\b(250|300|350|500|520|650|1000|1500|2000)\b/);
    if (session.current_state === 'ASK_CAPACITY' && matchedNumber) {
      const selectedCap = parseInt(matchedNumber[0], 10);
      const matchedService = services.find((s: ServiceConfigItem) => s.capacity === selectedCap);
      const price = matchedService ? Number(matchedService.price) : 160000;

      entities.capacity = selectedCap;
      entities.price = price;

      await supabase.from('conversation_entities').upsert(entities);
      await supabase.from('conversation_sessions').update({ current_state: 'COLLECT_BOOKING' }).eq('session_id', session_id);

      trace.push('SHOW_PRICE', 'COLLECT_BOOKING');
      return {
        reply: `Siap Kak! Untuk kapasitas *${selectedCap} Liter*, biayanya *Rp ${price.toLocaleString('id-ID')}*.\n\nUntuk penjadwalan teknisi kami ke lokasi, boleh dibantu kirim data berikut ya Kak:\n\n*Nama:*\n*Alamat / Kecamatan:*\n*Rencana Hari/Tgl Kuras:*`,
        next_state: 'COLLECT_BOOKING',
        state_trace: trace,
        entities,
        is_booking_ready: false
      };
    }

    // --- STEP B: SMART AI INTERCEPTOR (OFF-TRACK / SIDE QUESTION) ---
    const isQuestion = cleanMsg.includes('?') || cleanMsg.length > 25 || /(aman|kimia|garansi|kotor|bau|lumut|berapa lama|sabun|kuras)/i.test(cleanMsg);

    if (isQuestion && session.current_state !== 'GREETING') {
      trace.push('SIDE_QUESTION', 'PULLBACK');

      let sideAnswer = 'Pengerjaan kuras toren kami menggunakan semprotan tekanan tinggi dan pembersih higienis alami tanpa bahan kimia berbahaya, jadi air langsung aman digunakan kembali Kak.';
      
      if (/garansi/i.test(cleanMsg)) {
        sideAnswer = 'Kami berikan garansi bersih tuntas 100% Kak. Jika masih berlumut atau bau saat teknisi selesai, langsung kami bersihkan ulang tanpa biaya tambahan.';
      } else if (/berapa lama|durasi|jam/i.test(cleanMsg)) {
        sideAnswer = 'Estimasi pengerjaan kuras toren biasanya memakan waktu sekitar 45 - 60 menit per toren sampai kering dan bersih total Kak.';
      }

      let pullbackText = 'Mau kami jadwalkan untuk toren ukuran berapa liter ya Kak?';
      if (session.current_state === 'COLLECT_BOOKING') {
        pullbackText = 'Boleh dibantu kirim nama dan alamat lokasinya Kak agar kami cek rute teknisi hari ini?';
      }

      return {
        reply: `${sideAnswer}\n\n👉 *${pullbackText}*`,
        next_state: session.current_state,
        state_trace: trace,
        entities,
        is_booking_ready: false
      };
    }

    // --- STEP C: PARSING BOOKING DATA & STRICT BOUNDARY CHECK ---
    if (session.current_state === 'COLLECT_BOOKING') {
      if (!entities.customer_name && cleanMsg.length > 3) {
        entities.address = cleanMsg;
        entities.customer_name = user_identifier || 'Pelanggan';
      }

      const isComplete = Boolean(entities.capacity && entities.address);

      if (isComplete) {
        trace.push('VALIDATE_BOOKING', 'BOOKING_READY');
        entities.status = 'BOOKING_READY';
        await supabase.from('conversation_entities').upsert(entities);
        await supabase.from('conversation_sessions').update({ current_state: 'BOOKING_READY' }).eq('session_id', session_id);

        return {
          reply: `Terima kasih banyak Kak! Data booking sudah kami rekap:\n\n📋 *Rincian Booking Kuras Toren:*\n• Layanan: *Toren ${entities.capacity} Liter*\n• Total Biaya: *Rp ${Number(entities.price).toLocaleString('id-ID')}*\n• Alamat Lokasi: *${entities.address}*\n• Metode: *Bayar di Tempat (Tunai/QRIS setelah selesai)*\n\nTeknisi kami akan segera mengonfirmasi jadwal keberangkatan ke WhatsApp Kakak ya. Terima kasih! 🙏`,
          next_state: 'BOOKING_READY',
          state_trace: trace,
          entities,
          is_booking_ready: true
        };
      }
    }

    // Fallback response
    return {
      reply: 'Boleh dibantu info ukuran torennya Kak (misal: 350, 520, atau 1000 liter)?',
      next_state: session.current_state,
      state_trace: trace,
      entities,
      is_booking_ready: false
    };
  }
}