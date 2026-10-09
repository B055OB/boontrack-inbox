/**
 * @file lib/crm/followup-engine.ts
 * @description Logic engine for customer lifecycle follow-ups:
 * H+3 (Evaluation/check-in), H+7 (Weekly review / next session), and Birthday Reminder.
 */

import {
  FollowUpInfo,
  FollowUpRules,
  DEFAULT_FOLLOW_UP_RULES,
  FollowUpTriggerType,
} from './types';

export function formatFollowUpTemplate(
  template: string,
  variables: { name: string; store: string; days?: number }
): string {
  return template
    .replace(/\[nama\]|\{\{nama\}\}|\{\{customerName\}\}/gi, variables.name)
    .replace(/\[toko\]|\[nama_toko\]|\{\{toko\}\}|\{\{storeName\}\}/gi, variables.store)
    .replace(/\[hari\]|\{\{hari\}\}|\{\{days\}\}/gi, String(variables.days ?? ''));
}

export function calculateFollowUpInfo(params: {
  customerName: string;
  birthDate?: string | null;
  lastVisitDate?: string | null;
  tenantName?: string;
  rules?: Partial<FollowUpRules> | null;
}): FollowUpInfo {
  const { customerName, birthDate, lastVisitDate, tenantName, rules } = params;
  const storeName = tenantName || 'Toko Resmi';
  const now = new Date();

  const h1Days = Math.max(1, Math.floor(Number(rules?.h1Days ?? DEFAULT_FOLLOW_UP_RULES.h1Days)));
  const h2Days = Math.max(h1Days + 1, Math.floor(Number(rules?.h2Days ?? DEFAULT_FOLLOW_UP_RULES.h2Days)));
  const h1Enabled = rules?.h1Enabled !== false;
  const h2Enabled = rules?.h2Enabled !== false;
  const birthdayEnabled = rules?.birthdayEnabled !== false;

  const h1Template = rules?.h1Template || DEFAULT_FOLLOW_UP_RULES.h1Template;
  const h2Template = rules?.h2Template || DEFAULT_FOLLOW_UP_RULES.h2Template;
  const birthdayTemplate = rules?.birthdayTemplate || DEFAULT_FOLLOW_UP_RULES.birthdayTemplate;
  const retentionTemplate = rules?.retentionTemplate || DEFAULT_FOLLOW_UP_RULES.retentionTemplate || '';

  // 1. Birthday Check (Trigger priority: Birthday takes top precedence on the day of birth)
  if (birthdayEnabled && birthDate) {
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
          templateText: formatFollowUpTemplate(birthdayTemplate, {
            name: customerName,
            store: storeName,
          }),
        };
      }
    }
  }

  // 2. Post-visit Check with Dynamic Day Rules
  if (lastVisitDate) {
    const visit = new Date(lastVisitDate);
    if (!isNaN(visit.getTime())) {
      const diffTime = now.getTime() - visit.getTime();
      const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (h1Enabled && daysDiff === h1Days) {
        const type: FollowUpTriggerType = h1Days === 3 ? 'H3_DUE' : 'H1_DUE';
        return {
          type,
          label: `Follow-Up H+${h1Days} (Hari Ini)`,
          badgeCls: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
          isDueToday: true,
          targetDate: lastVisitDate,
          templateText: formatFollowUpTemplate(h1Template, {
            name: customerName,
            store: storeName,
            days: h1Days,
          }),
        };
      }

      if (h1Enabled && daysDiff > h1Days && daysDiff < h2Days) {
        const type: FollowUpTriggerType = h1Days === 3 ? 'H3_PAST' : 'H1_PAST';
        return {
          type,
          label: `H+${daysDiff} (Check-in Kondisi)`,
          badgeCls: 'bg-amber-50/70 text-amber-700 border-amber-200 font-medium',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: formatFollowUpTemplate(h1Template, {
            name: customerName,
            store: storeName,
            days: daysDiff,
          }),
        };
      }

      if (h2Enabled && daysDiff === h2Days) {
        const type: FollowUpTriggerType = h2Days === 7 ? 'H7_DUE' : 'H2_DUE';
        return {
          type,
          label: `Follow-Up H+${h2Days} (Hari Ini)`,
          badgeCls: 'bg-blue-50 text-blue-800 border-blue-300 font-bold',
          isDueToday: true,
          targetDate: lastVisitDate,
          templateText: formatFollowUpTemplate(h2Template, {
            name: customerName,
            store: storeName,
            days: h2Days,
          }),
        };
      }

      if (h2Enabled && daysDiff > h2Days && daysDiff <= h2Days * 2) {
        const type: FollowUpTriggerType = h2Days === 7 ? 'H7_PAST' : 'H2_PAST';
        return {
          type,
          label: `H+${daysDiff} (Evaluasi Lanjutan)`,
          badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-medium',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: formatFollowUpTemplate(h2Template, {
            name: customerName,
            store: storeName,
            days: daysDiff,
          }),
        };
      }

      if (h1Enabled && daysDiff < h1Days) {
        const remaining = h1Days - daysDiff;
        const type: FollowUpTriggerType = h1Days === 3 ? 'UPCOMING_H3' : 'UPCOMING_H1';
        return {
          type,
          label: `H+${h1Days} (${remaining} hari lagi)`,
          badgeCls: 'bg-slate-100 text-slate-600 border-slate-200',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: `Halo Ayah/Bunda ${customerName}, terima kasih atas kunjungannya ke ${storeName}. Semoga si kecil nyaman dan proses perkembangannya semakin membahagiakan 🙏`,
        };
      }

      if (daysDiff > h2Days * 2) {
        return {
          type: 'RETENTION',
          label: `Kunjungan ${daysDiff} hari lalu`,
          badgeCls: 'bg-slate-100 text-slate-500 border-slate-200',
          isDueToday: false,
          targetDate: lastVisitDate,
          templateText: formatFollowUpTemplate(retentionTemplate, {
            name: customerName,
            store: storeName,
            days: daysDiff,
          }),
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
