/**
 * @file lib/crm/followup-engine.ts
 * @description Logic engine for customer lifecycle follow-ups:
 * H+3 (Evaluation/check-in), H+7 (Weekly review / next session), and Birthday Reminder.
 */

import { FollowUpInfo } from './types';

export function calculateFollowUpInfo(params: {
  customerName: string;
  birthDate?: string | null;
  lastVisitDate?: string | null;
  tenantName?: string;
}): FollowUpInfo {
  const { customerName, birthDate, lastVisitDate, tenantName } = params;
  const storeName = tenantName || 'Tumbuh Kembang Anak';
  const now = new Date();

  // 1. Birthday Check (Trigger priority: Birthday takes top precedence on the day of birth)
  if (birthDate) {
    const bDate = new Date(birthDate);
    if (!isNaN(bDate.getTime())) {
      const isBirthdayToday =
        bDate.getDate() === now.getDate() && bDate.getMonth() === now.getMonth();

      if (isBirthdayToday) {
        return {
          type: 'BIRTHDAY',
          label: 'Ulang Tahun Hari Ini 🎂',
          badgeCls: 'bg-rose-50 text-rose-700 border-rose-200 font-black',
          isDueToday: true,
          targetDate: birthDate,
          templateText: `Halo Ayah/Bunda ${customerName}, Selamat Ulang Tahun untuk si kecil! 🎂🎉 Semoga senantiasa sehat, tumbuh cerdas, dan penuh keceriaan. Kami dari ${storeName} selalu mendoakan yang terbaik. Spesial di hari bahagia ini, kami siapkan hadiah voucher spesial untuk sesi atau program tumbuh kembang bulan ini 🎁✨`,
        };
      }
    }
  }

  // 2. Post-visit H+3 & H+7 Check
  if (lastVisitDate) {
    const visit = new Date(lastVisitDate);
    if (!isNaN(visit.getTime())) {
      const diffTime = now.getTime() - visit.getTime();
      const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (daysDiff === 3) {
        return {
          type: 'H3_DUE',
          label: 'Follow-Up H+3 (Hari Ini)',
          badgeCls: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
          isDueToday: true,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, bagaimana perkembangan si kecil setelah sesi 3 hari lalu di ${storeName}? Apakah ada keluhan atau respon perkembangan yang ingin dikonsultasikan kembali? Kami siap membantu evaluasi kondisinya 🙏`,
        };
      }

      if (daysDiff > 3 && daysDiff < 7) {
        return {
          type: 'H3_PAST',
          label: `H+${daysDiff} (Check-in Kondisi)`,
          badgeCls: 'bg-amber-50/70 text-amber-700 border-amber-200 font-medium',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, bagaimana kondisi si kecil saat ini? Apakah proses stimulasi di rumah berjalan lancar? Bila ada yang ingin ditanyakan kepada tim kami, silakan balas pesan ini ya 🙏`,
        };
      }

      if (daysDiff === 7) {
        return {
          type: 'H7_DUE',
          label: 'Follow-Up H+7 (Hari Ini)',
          badgeCls: 'bg-blue-50 text-blue-800 border-blue-300 font-bold',
          isDueToday: true,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, sudah 1 minggu sejak sesi kunjungan terakhir. Untuk memastikan kemajuan stimulasi dan tumbuh kembang si kecil berjalan optimal, apakah ingin menjadwalkan sesi evaluasi lanjutan minggu ini? 😊`,
        };
      }

      if (daysDiff > 7 && daysDiff <= 14) {
        return {
          type: 'H7_PAST',
          label: `H+${daysDiff} (Evaluasi Lanjutan)`,
          badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-medium',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, mengingatkan untuk jadwal evaluasi berkala si kecil agar program tumbuh kembangnya tetap berlanjut optimal. Apakah Ayah/Bunda ingin reservasi slot jadwal minggu ini? 😊`,
        };
      }

      if (daysDiff < 3) {
        const remaining = 3 - daysDiff;
        return {
          type: 'UPCOMING_H3',
          label: `H+3 (${remaining} hari lagi)`,
          badgeCls: 'bg-slate-100 text-slate-600 border-slate-200',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, terima kasih atas kunjungannya ke ${storeName}. Semoga si kecil nyaman dan proses perkembangannya semakin membahagiakan 🙏`,
        };
      }

      if (daysDiff > 14) {
        return {
          type: 'RETENTION',
          label: `Kunjungan ${daysDiff} hari lalu`,
          badgeCls: 'bg-slate-100 text-slate-500 border-slate-200',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, apa kabar si kecil? Sudah cukup lama sejak sesi kunjungan terakhir. Jika memerlukan pendampingan stimulasi atau evaluasi baru, pintu klinik kami selalu terbuka untuk Ayah/Bunda 🙏`,
        };
      }
    }
  }

  return {
    type: 'NONE',
    label: 'Belum Ada Jadwal',
    badgeCls: 'bg-slate-50 text-slate-400 border-slate-200',
    isDueToday: false,
    templateText: `Halo Ayah/Bunda ${customerName}, ada yang bisa kami bantu seputar layanan di ${storeName}?`,
  };
}
