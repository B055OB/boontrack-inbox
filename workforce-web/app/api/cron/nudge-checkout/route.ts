import { NextResponse } from 'next/server';

export interface OutboxEntry {
  id: string;
  idempotency_key: string;
  shift_id: string;
  officer_id: string;
  officer_name: string;
  target_phone: string;
  site_name: string;
  event_type: 'PRE_SHIFT_REMINDER_T_MINUS_15' | 'GRACE_WARNING_T_PLUS_15' | 'UNVERIFIED_CHECKOUT_ESCALATION';
  message: string;
  sent_at: string;
  status: 'SENT' | 'SIMULATED' | 'FAILED';
}

export interface ShiftEvaluationRecord {
  id: string;
  officer_id: string;
  officer_name: string;
  officer_nip: string;
  phone: string;
  site_name: string;
  post: string;
  shift_start: string;
  shift_end: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'ON_DUTY' | 'COMPLETED' | 'GRACE_PERIOD' | 'UNVERIFIED_CHECKOUT';
  minutes_until_end?: number;
  minutes_since_end?: number;
}

// In-memory Outbox for Deduplication & Idempotency tracking
const notificationOutbox: OutboxEntry[] = [];

// Sample live shift state for cron evaluation
let managedShifts: ShiftEvaluationRecord[] = [
  {
    id: 'SHIFT-20261104-01',
    officer_id: 'OFF-01',
    officer_name: 'Cindy Aurini',
    officer_nip: '268.0112.25',
    phone: '081234567891',
    site_name: 'Gudang Wuling Soreang',
    post: 'Pos 1 Gerbang Utama',
    shift_start: '08:00',
    shift_end: '20:00',
    clock_in: '07:42',
    clock_out: null,
    status: 'ON_DUTY',
    minutes_until_end: 14, // Rule 1: T-15 Menit (< 15 min remaining)
  },
  {
    id: 'SHIFT-20261104-02',
    officer_id: 'OFF-04',
    officer_name: 'Agus Setiawan',
    officer_nip: '268.0201.26',
    phone: '081234567894',
    site_name: 'Gudang Wuling Soreang',
    post: 'Pos Parkir Truk Barat',
    shift_start: '08:00',
    shift_end: '12:00',
    clock_in: '08:10',
    clock_out: null,
    status: 'ON_DUTY',
    minutes_since_end: 18, // Rule 2: T+15 Menit (overdue 18 mins, grace period)
  },
  {
    id: 'SHIFT-20261104-03',
    officer_id: 'OFF-06',
    officer_name: 'Budi Santoso',
    officer_nip: '268.0310.25',
    phone: '081234567896',
    site_name: 'Gudang Wuling Soreang',
    post: 'Pos Logistik Retur',
    shift_start: '00:00',
    shift_end: '08:00',
    clock_in: '23:55',
    clock_out: null, // STRICT CTO MANDATE: KEEP NULL, NO FICTITIOUS CLOCK OUT
    status: 'ON_DUTY',
    minutes_since_end: 155, // Rule 3: > 2 Hours (> 120 mins) overdue
  },
  {
    id: 'SHIFT-20261104-04',
    officer_id: 'OFF-02',
    officer_name: 'Bambang Sutrisno',
    officer_nip: '268.0094.24',
    phone: '081234567892',
    site_name: 'Gudang Wuling Soreang',
    post: 'Loading Dock Gudang A',
    shift_start: '08:00',
    shift_end: '20:00',
    clock_in: '07:50',
    clock_out: null,
    status: 'ON_DUTY',
    minutes_until_end: 360, // Normal, not near end
  },
];

function getServerTimeWIB(): string {
  const now = new Date();
  return (
    now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  );
}

// Evolution API helper for sending individual WA reminder
async function sendEvolutionWhatsAppText(phone: string, text: string): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL || 'https://gateway.boontrack.com';
  const apiKey = process.env.EVOLUTION_API_KEY || 'satya_enterprise_secret_token';
  const instance = process.env.EVOLUTION_INSTANCE || 'satya-ops';

  const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '62');
  const targetJid = `${cleanPhone}@s.whatsapp.net`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: targetJid,
        text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

// Engine Core: Evaluate all active shifts according to CTO Rules
function runNudgeScheduler() {
  const nowWIB = getServerTimeWIB();
  const todayDate = new Date().toISOString().split('T')[0];

  const actionsTaken: Array<{
    shift_id: string;
    officer_name: string;
    rule: string;
    action: string;
    message?: string;
  }> = [];

  let preShiftCount = 0;
  let graceWarningCount = 0;
  let unverifiedCheckoutCount = 0;
  let skippedIdempotentCount = 0;

  for (const shift of managedShifts) {
    // Skip shifts that have already clocked out or already finalized
    if (shift.clock_out !== null || shift.status === 'COMPLETED') {
      continue;
    }

    // -------------------------------------------------------------
    // RULE 3: MANDAT KEPATUHAN CTO (Overdue > 2 Hours / 120 Minutes)
    // -------------------------------------------------------------
    if (shift.minutes_since_end && shift.minutes_since_end >= 120) {
      const idempotencyKey = `${shift.id}-UNVERIFIED-${todayDate}`;
      const isAlreadyLogged = notificationOutbox.some(
        (o) => o.idempotency_key === idempotencyKey
      );

      // MANDAT CTO ABSOLUT:
      // Ubah status kehadiran menjadi "UNVERIFIED_CHECKOUT".
      // DILARANG MEMBUAT JAM PULANG FIKTIF (clock_out tetap null).
      shift.status = 'UNVERIFIED_CHECKOUT';
      // shift.clock_out stays null!

      if (!isAlreadyLogged) {
        const outboxEntry: OutboxEntry = {
          id: `OUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          idempotency_key: idempotencyKey,
          shift_id: shift.id,
          officer_id: shift.officer_id,
          officer_name: shift.officer_name,
          target_phone: shift.phone,
          site_name: shift.site_name,
          event_type: 'UNVERIFIED_CHECKOUT_ESCALATION',
          message: `Shift melewati batas toleransi 2 jam tanpa checkout. Status dialihkan ke UNVERIFIED_CHECKOUT (jam pulang dikosongkan untuk audit supervisor).`,
          sent_at: nowWIB,
          status: 'SENT',
        };
        notificationOutbox.unshift(outboxEntry);
        unverifiedCheckoutCount++;
        actionsTaken.push({
          shift_id: shift.id,
          officer_name: shift.officer_name,
          rule: 'RULE 3: CTO Fail-Safe Overdue > 2 Jam',
          action: 'Set status presensi = UNVERIFIED_CHECKOUT (Jam pulang dibiarkan null tanpa manipulasi fiktif).',
        });
      } else {
        skippedIdempotentCount++;
      }
      continue;
    }

    // -------------------------------------------------------------
    // RULE 2: Grace-Period Warning (T+15 Menit Belum Checkout)
    // -------------------------------------------------------------
    if (shift.minutes_since_end && shift.minutes_since_end >= 15 && shift.minutes_since_end < 120) {
      const idempotencyKey = `${shift.id}-GRACE15-${todayDate}`;
      const isAlreadySent = notificationOutbox.some(
        (o) => o.idempotency_key === idempotencyKey
      );

      shift.status = 'GRACE_PERIOD';

      if (!isAlreadySent) {
        const warningMsg = `⚠️ PERINGATAN: Rekan ${shift.officer_name}, Anda belum melakukan absen pulang di site ${shift.site_name}. Segera verifikasi via aplikasi SATYA sebelum status shift dialihkan ke koreksi supervisor.`;

        const outboxEntry: OutboxEntry = {
          id: `OUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          idempotency_key: idempotencyKey,
          shift_id: shift.id,
          officer_id: shift.officer_id,
          officer_name: shift.officer_name,
          target_phone: shift.phone,
          site_name: shift.site_name,
          event_type: 'GRACE_WARNING_T_PLUS_15',
          message: warningMsg,
          sent_at: nowWIB,
          status: 'SENT',
        };

        notificationOutbox.unshift(outboxEntry);
        sendEvolutionWhatsAppText(shift.phone, warningMsg).catch(() => {});
        graceWarningCount++;
        actionsTaken.push({
          shift_id: shift.id,
          officer_name: shift.officer_name,
          rule: 'RULE 2: Grace-Period Warning (T+15 Menit)',
          action: `Kirim WA peringatan checkout ke ${shift.phone}`,
          message: warningMsg,
        });
      } else {
        skippedIdempotentCount++;
      }
      continue;
    }

    // -------------------------------------------------------------
    // RULE 1: Pre-Shift Reminder (T-15 Menit Sebelum Selesai)
    // -------------------------------------------------------------
    if (
      shift.minutes_until_end !== undefined &&
      shift.minutes_until_end <= 15 &&
      shift.minutes_until_end > 0
    ) {
      const idempotencyKey = `${shift.id}-PRE15-${todayDate}`;
      const isAlreadySent = notificationOutbox.some(
        (o) => o.idempotency_key === idempotencyKey
      );

      if (!isAlreadySent) {
        const reminderMsg = `Halo Rekan ${shift.officer_name}, 15 menit lagi shift Anda di ${shift.site_name} selesai. Siapkan serah terima pos dan lakukan verifikasi absen pulang via aplikasi SATYA.`;

        const outboxEntry: OutboxEntry = {
          id: `OUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          idempotency_key: idempotencyKey,
          shift_id: shift.id,
          officer_id: shift.officer_id,
          officer_name: shift.officer_name,
          target_phone: shift.phone,
          site_name: shift.site_name,
          event_type: 'PRE_SHIFT_REMINDER_T_MINUS_15',
          message: reminderMsg,
          sent_at: nowWIB,
          status: 'SENT',
        };

        notificationOutbox.unshift(outboxEntry);
        sendEvolutionWhatsAppText(shift.phone, reminderMsg).catch(() => {});
        preShiftCount++;
        actionsTaken.push({
          shift_id: shift.id,
          officer_name: shift.officer_name,
          rule: 'RULE 1: Pre-Shift Reminder (T-15 Menit)',
          action: `Kirim WA pengingat persiapan checkout ke ${shift.phone}`,
          message: reminderMsg,
        });
      } else {
        skippedIdempotentCount++;
      }
    }
  }

  return {
    evaluated_at: nowWIB,
    summary: {
      evaluated_shifts_count: managedShifts.length,
      pre_shift_nudges_sent: preShiftCount,
      grace_warnings_sent: graceWarningCount,
      unverified_checkouts_marked: unverifiedCheckoutCount,
      skipped_idempotent: skippedIdempotentCount,
    },
    actions: actionsTaken,
    outbox_count: notificationOutbox.length,
    notification_outbox: notificationOutbox.slice(0, 10),
    managed_shifts_snapshot: managedShifts,
  };
}

// GET: Run Nudge evaluation and return outbox status
export async function GET() {
  const result = runNudgeScheduler();
  return NextResponse.json(
    {
      success: true,
      message: 'Engine Nudge Scheduler berhasil dieksekusi.',
      ...result,
    },
    { status: 200 }
  );
}

// POST: Trigger manual nudge scheduler with optional reset or override
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.reset_outbox) {
      notificationOutbox.length = 0;
    }

    const result = runNudgeScheduler();
    return NextResponse.json(
      {
        success: true,
        message: 'Engine Nudge Scheduler dieksekusi secara manual via trigger.',
        ...result,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: 'Gagal menjalankan cron nudge: ' + (err as Error).message,
      },
      { status: 500 }
    );
  }
}
