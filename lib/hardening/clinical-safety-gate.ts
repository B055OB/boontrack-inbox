/**
 * lib/hardening/clinical-safety-gate.ts
 * Clinical Safety Gate for Hardening P0 (HARDENING_V1).
 *
 * Enforces:
 * 1. Pre-LLM Emergency Detection:
 *    Intercepts pediatric / clinical medical emergencies, acute danger signals,
 *    and urgent complaints BEFORE probabilistic LLM inference.
 * 2. Deterministic AI STOP: Stops conversational AI immediately upon detection.
 * 3. Human & Medical Escalation: Hands over session to human / medical team
 *    and directs parents to nearest hospital Emergency Room (IGD).
 * 4. Structured telemetry with `hardening_policy_version: 'HARDENING_V1'`.
 */

export interface ClinicalEmergencySignal {
  category:
    | 'RESPIRATORY_DISTRESS'
    | 'SEIZURE'
    | 'ALTERED_CONSCIOUSNESS_DEHYDRATION'
    | 'SEVERE_BLEEDING_VOMITING'
    | 'POISON_CHOKING_FOREIGN_BODY'
    | 'EXTREME_HYPERPYREXIA'
    | 'CRITICAL_EMERGENCY_COMPLAINT';
  label: string;
  patterns: RegExp[];
}

export const CLINICAL_EMERGENCY_SIGNALS: ClinicalEmergencySignal[] = [
  {
    category: 'RESPIRATORY_DISTRESS',
    label: 'Kegawatan Pernapasan / Tersedak / Sianosis',
    patterns: [
      /\b(sesak\s*napas|sulit\s*bernafas|susah\s*nafas|megap\s*megap|tarikan\s*(?:dinding\s*)?dada|retraksi\s*dada|stridor|nafas\s*bunyi|tersedak|tersumbat|choking)\b/i,
      /\b(membiru|bibir\s*biru|ujung\s*kuku\s*biru|sianosis|kurang\s*oksigen)\b/i,
    ],
  },
  {
    category: 'SEIZURE',
    label: 'Kejang / Step / Penurunan Kesadaran Akut',
    patterns: [
      /\b(kejang|step|kelonjotan|kaku\s*tubuh|mata\s*melotot\s*ke\s*atas|bibir\s*(?:bergetar|terkunci))\b/i,
    ],
  },
  {
    category: 'ALTERED_CONSCIOUSNESS_DEHYDRATION',
    label: 'Penurunan Kesadaran / Dehidrasi Sangat Berat',
    patterns: [
      /\b(tidak\s*sadar|hilang\s*kesadaran|pingsan|tidak\s*merespon|lemas\s*lunglai|tidur\s*terus\s*tidak\s*bangun|koma)\b/i,
      /\b(tidak\s*(?:bisa\s*)?pipis\s*(?:>|lebih\s*dari)?\s*6\s*jam|popok\s*kering\s*(?:seharian|8\s*jam)|mata\s*sangat\s*cekung|ubun\s*ubun\s*cekung)\b/i,
    ],
  },
  {
    category: 'SEVERE_BLEEDING_VOMITING',
    label: 'Muntah Darah / Cairan Hijau / Pendarahan Akut',
    patterns: [
      /\b(muntah\s*darah|muntah\s*(?:cairan\s*)?hijau|muntah\s*(?:menyembur|terus\s*menerus\s*>|hitam))\b/i,
      /\b(bab\s*darah|feses\s*(?:berdarah|hitam\s*pekat)|perdarahan|pendarahan\s*hebat)\b/i,
    ],
  },
  {
    category: 'POISON_CHOKING_FOREIGN_BODY',
    label: 'Keracunan / Tertelan Benda Asing / Anafilaksis',
    patterns: [
      /\b(keracunan|tertelan\s*(?:baterai|jarum|kelereng|logam|obat\s*keras|racun|minyak|deterjen))\b/i,
      /\b(anafilaksis|bibir\s*bengkak\s*tiba\s*tiba|alergi\s*berat\s*sesak)\b/i,
    ],
  },
  {
    category: 'EXTREME_HYPERPYREXIA',
    label: 'Demam Ekstrem Tinggi Disertai Menggigil Hebat / Kaku',
    patterns: [
      /\b(demam\s*(?:40|41|39\.8|39\.9)|suhu\s*(?:40|41)|kaku\s*kuduk|demam\s*menggigil\s*hebat)\b/i,
    ],
  },
  {
    category: 'CRITICAL_EMERGENCY_COMPLAINT',
    label: 'Kondisi Kritis / Darurat Medis Mendesak',
    patterns: [
      /\b(anak\s*(?:kritis|sekarat|gawat)|kondisi\s*(?:kritis|darurat\s*medis)|tolong\s*gawat|darurat\s*medis|segera\s*dokter\s*darurat)\b/i,
    ],
  },
];

export interface ClinicalSafetyEvaluation {
  isEmergency: boolean;
  category?: string;
  label?: string;
  matchedKeywords: string[];
  replyMessage: string;
  hardening_policy_version: 'HARDENING_V1';
}

/**
 * Evaluates whether an incoming message contains acute clinical danger signals.
 */
export function evaluateClinicalSafetyGate(text: string): ClinicalSafetyEvaluation {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    return {
      isEmergency: false,
      matchedKeywords: [],
      replyMessage: '',
      hardening_policy_version: 'HARDENING_V1',
    };
  }

  const matchedKeywords: string[] = [];
  let matchedSignal: ClinicalEmergencySignal | null = null;

  for (const signal of CLINICAL_EMERGENCY_SIGNALS) {
    for (const pattern of signal.patterns) {
      const match = cleanText.match(pattern);
      if (match) {
        matchedKeywords.push(match[0]);
        if (!matchedSignal) {
          matchedSignal = signal;
        }
      }
    }
  }

  if (matchedSignal) {
    console.warn(`[CLINICAL_SAFETY_GATE] Emergency detected (${matchedSignal.label}): "${cleanText}"`, {
      hardening_policy_version: 'HARDENING_V1',
      category: matchedSignal.category,
      matched_keywords: matchedKeywords,
    });

    const replyMessage =
      `🚨 *[PERINGATAN KEGAWATDARURATAN MEDIS]*\n\n` +
      `Ayah/Bunda, gejala yang disampaikan (*${matchedKeywords.slice(0, 3).join(', ')}*) mengindikasikan kondisi yang *memerlukan evaluasi langsung dan tindakan medis SEGERA oleh dokter di Instalasi Gawat Darurat (IGD) atau Rumah Sakit terdekat*.\n\n` +
      `⚠️ *PENTING DARI TIM KLINIK:*\n` +
      `1. Layanan konsultasi chat ini *BUKAN sarana untuk menangani kondisi gawat darurat*.\n` +
      `2. Mohon jangan menunda waktu untuk menunggu balasan chat. Segera bawa si kecil ke IGD RS terdekat sekarang juga demi keselamatan si kecil.\n` +
      `3. Bawa serta riwayat obat atau makanan terakhir yang dikonsumsi si kecil saat menuju IGD.\n\n` +
      `🛑 *Status Sistem:*\n` +
      `Respon otomatis asisten AI telah *DIHENTIKAN SEKETIKA* dan sesi ini dialihkan dengan prioritas tinggi ke pemantauan tim klinik kami. Tetap tenang dan prioritaskan keselamatan si kecil ke IGD ya Ayah/Bunda. 🙏`;

    return {
      isEmergency: true,
      category: matchedSignal.category,
      label: matchedSignal.label,
      matchedKeywords,
      replyMessage,
      hardening_policy_version: 'HARDENING_V1',
    };
  }

  return {
    isEmergency: false,
    matchedKeywords: [],
    replyMessage: '',
    hardening_policy_version: 'HARDENING_V1',
  };
}
