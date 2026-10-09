/**
 * lib/ai/clinic-output-validator.ts
 *
 * Post-LLM Safety Output Validator for CLINIC / CONSULTATION_V1 tenants.
 *
 * Strict Medical & Platform Guardrails:
 * 1. Definitive Diagnosis Claim Prohibition:
 *    Bot MUST NOT assert definitive medical diagnoses ("anak Anda menderita...", "anak Anda divonis...", "kami mendiagnosis...").
 * 2. Prescription / Hard Drug Prohibition:
 *    Bot MUST NOT prescribe, recommend, or dose hard drugs / prescription medicines
 *    (antibiotik, amoxicillin, cefixime, dexamethasone, metilprednisolon, puyer dokter, dll).
 * 3. Unauthorized Foreign URL Blocker:
 *    Bot MUST NOT output external URLs outside tenant official domains, official screening forms
 *    (screening.littlebitefeeding.com, etc.), and *.boontrack.com.
 *
 * Fail-Closed: If any violation is detected, output is rejected and replaced
 * with an empathetic, safe front-desk educational fallback.
 */

export type ClinicSafetyViolationType =
  | 'DEFINITIVE_DIAGNOSIS'
  | 'HARD_DRUG_PRESCRIPTION'
  | 'UNAUTHORIZED_URL';

export interface ClinicOutputValidationResult {
  isValid: boolean;
  sanitizedReply: string;
  violations: ClinicSafetyViolationType[];
  reason?: string;
  blockedUrls?: string[];
}

export interface ClinicValidationContext {
  tenant?: any;
  meta?: any;
}

// ── 1. DEFINITIVE DIAGNOSIS DETECTION REGEX ──────────────────────────────────
export const DEFINITIVE_DIAGNOSIS_REGEX =
  /\b((?:anak\s+(?:anda|ibu|bunda|ayah|kakak)|si\s+kecil)\s+(?:menderita|mengidap|terkena\s+(?:penyakit|gangguan\s+kronis)|divonis|didiagnosis|mengalami\s+(?:penyakit|kelainan\s+medis))|(?:saya|kami)\s+mendiagnosis|diagnosis\s+pasti(?:nya)?\s+adalah|vonis\s+(?:dokter|medis)\s+adalah|didiagnosis\s+menderita)\b/i;

// ── 2. PRESCRIPTION & HARD DRUGS REGEX ──────────────────────────────────────
export const HARD_DRUGS_REGEX =
  /\b(antibiotik|amoxicillin|amoksisilin|cefixime|cefadroxil|azithromycin|ciprofloxacin|eritromisin|gentamisin|dexamethasone|deksametason|prednison(?:e)?|metilprednisolon|methylprednisolone|kortikosteroid|puyer\s+dokter|puyer\s+racikan|obat\s+keras|resep\s+obat\s+keras|resepkan\s+obat|resep\s+obat\s+resep|diazepam|fenobarbital|luminal)\b/i;

// ── 3. ALLOWED DOMAINS / HOSTNAMES ──────────────────────────────────────────
export const OFFICIAL_ALLOWED_HOSTNAMES = new Set([
  'boontrack.com',
  'screening.littlebitefeeding.com',
  'screening.tumbuhkembanganak.com',
  'konsul.littlebitefeeding.com',
  'wa.me',
  'api.whatsapp.com',
  'quickchart.io',
]);

const URL_EXTRACT_REGEX = /https?:\/\/[^\s"'<>()[\]]+/gi;

/**
 * Builds safe, empathetic front-desk fallback message.
 */
export function buildSafeFrontDeskFallback(meta?: any): string {
  const screeningUrl = meta?.screening_url || 'https://screening.littlebitefeeding.com/';
  return (
    `Terima kasih atas pertanyaannya Ayah/Bunda. 🙏\n\n` +
    `Sebagai asisten front-desk dan edukasi layanan tumbuh kembang, kami tidak berwenang menegakkan diagnosis medis pasti ataupun memberikan anjuran resep obat keras.\n\n` +
    `Untuk evaluasi medis mendalam mengenai kondisi si kecil langsung oleh dokter spesialis kami, Ayah/Bunda dapat melakukan skrining awal resmi terlebih dahulu melalui tautan berikut:\n` +
    `👉 ${screeningUrl}\n\n` +
    `Setelah mengisi formulir, tim kami akan segera membantu menjadwalkan sesi konsultasi resmi dokter. Tim kami siap mendampingi Ayah/Bunda. Tetap semangat ya Bun/Yah! 😊`
  );
}

/**
 * Validates outgoing bot message for clinical & link safety.
 */
export function validateClinicBotOutput(
  output: string,
  context?: ClinicValidationContext
): ClinicOutputValidationResult {
  const text = (output || '').trim();
  if (!text) {
    return {
      isValid: true,
      sanitizedReply: '',
      violations: [],
    };
  }

  const violations: ClinicSafetyViolationType[] = [];
  const reasons: string[] = [];
  const blockedUrls: string[] = [];

  // A. Check definitive diagnosis claims
  if (DEFINITIVE_DIAGNOSIS_REGEX.test(text)) {
    violations.push('DEFINITIVE_DIAGNOSIS');
    reasons.push('Output contains definitive medical diagnosis claim');
  }

  // B. Check prescription / hard drugs
  if (HARD_DRUGS_REGEX.test(text)) {
    violations.push('HARD_DRUG_PRESCRIPTION');
    reasons.push('Output contains prescription or hard drug recommendation');
  }

  // C. Check external URLs against whitelist
  const meta = context?.meta || {};
  const tenant = context?.tenant || {};

  // Build dynamic allowed hosts
  const dynamicAllowedHosts = new Set<string>(OFFICIAL_ALLOWED_HOSTNAMES);

  const addHostFromUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      dynamicAllowedHosts.add(parsed.hostname.toLowerCase());
    } catch (_) {}
  };

  addHostFromUrl(meta.screening_url);
  addHostFromUrl(meta.kidmap_assessment_url);
  addHostFromUrl(meta.custom_domain);
  addHostFromUrl(tenant.custom_domain);
  if (tenant.domain) addHostFromUrl(tenant.domain);
  if (tenant.slug) {
    dynamicAllowedHosts.add(`shop.boontrack.com`);
    dynamicAllowedHosts.add(`app.boontrack.com`);
  }

  const foundUrls = text.match(URL_EXTRACT_REGEX) || [];
  for (const rawUrl of foundUrls) {
    const cleanUrl = rawUrl.replace(/[.,!?]+$/, '');
    try {
      const parsed = new URL(cleanUrl);
      const host = parsed.hostname.toLowerCase();

      const isAllowed =
        dynamicAllowedHosts.has(host) ||
        host.endsWith('.boontrack.com') ||
        host === 'boontrack.com';

      if (!isAllowed) {
        blockedUrls.push(cleanUrl);
      }
    } catch (_) {
      blockedUrls.push(cleanUrl);
    }
  }

  if (blockedUrls.length > 0) {
    violations.push('UNAUTHORIZED_URL');
    reasons.push(`Output contains unauthorized foreign URLs: ${blockedUrls.join(', ')}`);
  }

  if (violations.length > 0) {
    return {
      isValid: false,
      sanitizedReply: buildSafeFrontDeskFallback(meta),
      violations,
      reason: reasons.join('; '),
      blockedUrls,
    };
  }

  return {
    isValid: true,
    sanitizedReply: text,
    violations: [],
  };
}
