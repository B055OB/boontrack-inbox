/**
 * __tests__/bot/clinic_consultation_v1_system_prompt.test.ts
 *
 * Test Suite for Clinic Consultation System Prompt (CONSULTATION_V1) on Gemini 3.8 Flash.
 * Validates:
 * 1. Role & Medical Boundaries: Front-desk & educative role, strictly no doctor diagnosing or prescription.
 * 2. Adaptive Communication Flow: Listen first, accommodate "gaptek" parents without forcing links.
 * 3. 3-Signal Patient Triage:
 *    - Signal 1: Self-guided / education -> digital products (e-book, feeding rules, PLAY N GROW).
 *    - Signal 2: Explicit doctor consultation -> teleconsultation & initial screening form.
 *    - Signal 3: Medical emergency (red flags) -> immediate referral to IGD & human escalation.
 * 4. Operating Hours Policy: Mon - Sat 08:00 - 20:00 WIB, graceful after-hours recording & next-day 08:00 processing.
 * 5. Warm, supportive, conversational tone for Gemini 3.8 Flash.
 */

import {
  generateBoonPilotSystemPrompt,
  getClinicOperatingHoursStatus,
  BOONPILOT_TRIAGE_SYSTEM_PROMPT,
  CLINIC_OFFICIAL_SCREENING_URL,
  CLINIC_KIDMAP_ASSESSMENT_URL,
} from '@/lib/funnel/consultation-lead-funnel';
import { KnownBlueprintCodeSchema } from '@/lib/types/tenant-bot-config';

describe('CONSULTATION_V1: Clinic Bot System Prompt on Gemini 3.8 Flash', () => {
  const mockClinicMetadata = {
    clinic_name: 'Klinik Tumbuh Kembang Sehat',
    doctors: [
      { doctor_name: 'dr. Harys Maulana, Sp.A', specialty: 'Nutrisi & GTM' },
      { doctor_name: 'dr. Azizah Ridwan, Sp.A', specialty: 'Tumbuh Kembang' },
    ],
    screening_url: 'https://screening.littlebitefeeding.com/',
    kidmap_assessment_url: 'https://screening.tumbuhkembanganak.com/assessment',
    payment_accounts: [
      {
        bank_name: 'BCA',
        account_number: '3741672471',
        account_holder: 'Muhamad Harys Maulana',
        is_primary: true,
      },
    ],
  };

  // ── TEST 1: ROLE & MEDICAL BOUNDARY ─────────────────────────────────────────
  describe('1. Role & Medical Boundary (Clinical Safety Gate)', () => {
    it('defines front-desk and educational role and strictly forbids diagnosing or prescribing', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      // Identity & Front-Desk Role
      expect(prompt).toContain('BoonPilot - Front-Desk & Edukasi Layanan Tumbuh Kembang');
      expect(prompt).toContain('dr. Harys Maulana, Sp.A');
      expect(prompt).toContain('dr. Azizah Ridwan, Sp.A');

      // Strict Medical Boundary
      expect(prompt).toContain('BUKAN DOKTER');
      expect(prompt).toContain('DILARANG KERAS memvonis atau mendiagnosis');
      expect(prompt).toContain('DILARANG MERESEPKAN OBAT-OBATAN KERAS / MEDIS');

      // Parent Greeting & Child reference
      expect(prompt).toContain('Ayah/Bunda');
      expect(prompt).toContain('si kecil');
    });
  });

  // ── TEST 2: ADAPTIVE COMMUNICATION & PATIENT SIGNALS ────────────────────────
  describe('2. Adaptive Communication Flow & Patient Signals', () => {
    it('mandates "Dengarkan & Tampung Dulu" and accommodates gaptek parents without forcing links', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      expect(prompt).toContain('DENGARKAN & TAMPUNG DULU');
      expect(prompt).toContain('Sambut ramah, empatik, dan dengarkan keluhan orang tua');
      expect(prompt).toContain('Gaptek');
      expect(prompt).toContain('tanpa memaksa membuka tautan luar');
    });

    it('implements Signal 1: Self-guided / Education -> Digital products / E-Book / Module', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      expect(prompt).toContain('SINYAL 1: Butuh panduan mandiri / edukasi / solusi praktis');
      expect(prompt).toContain('produk digital / panduan tumbuh kembang');
      expect(prompt).toContain('feeding rules');
      expect(prompt).toContain('PLAY N GROW');
    });

    it('implements Signal 2: Explicit doctor consultation -> Teleconsultation & Screening form', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      expect(prompt).toContain('SINYAL 2: Pasien eksplisit ingin diperiksa dokter / konsultasi privat');
      expect(prompt).toContain('telekonsultasi dokter');
      expect(prompt).toContain('EAT & GROW');
      expect(prompt).toContain('Link Skrining: https://screening.littlebitefeeding.com/');
    });

    it('implements Signal 3: Medical Emergency -> Immediate IGD and Human Escalation', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      expect(prompt).toContain('SINYAL 3: Darurat medis (RED FLAGS / EMERGENCY)');
      expect(prompt).toContain('Kejang');
      expect(prompt).toContain('sesak napas');
      expect(prompt).toContain('lemas dehidrasi');
      expect(prompt).toContain('IGD (Instalasi Gawat Darurat) Rumah Sakit terdekat');
      expect(prompt).toContain('DILARANG menawarkan konsultasi online atau produk digital');
      expect(prompt).toContain('eskalasi ke staf manusia');
    });
  });

  // ── TEST 3: OPERATING HOURS ENGINE ─────────────────────────────────────────
  describe('3. Operating Hours Engine & After-Hours Response', () => {
    it('calculates operating hours correctly during daytime (e.g. Wednesday 10:00 WIB)', () => {
      // Wednesday 10:00 WIB = Wednesday 03:00 UTC
      const wednesdayDaytimeUTC = new Date('2026-10-14T03:00:00Z');
      const status = getClinicOperatingHoursStatus(wednesdayDaytimeUTC);

      expect(status.isOpen).toBe(true);
      expect(status.dayName).toBe('Rabu');
      expect(status.hourWIB).toBe(10);
      expect(status.statusNote).toContain('DALAM JAM OPERASIONAL');
    });

    it('calculates operating hours correctly after-hours (e.g. Wednesday 21:30 WIB)', () => {
      // Wednesday 21:30 WIB = Wednesday 14:30 UTC
      const wednesdayNightUTC = new Date('2026-10-14T14:30:00Z');
      const status = getClinicOperatingHoursStatus(wednesdayNightUTC);

      expect(status.isOpen).toBe(false);
      expect(status.dayName).toBe('Rabu');
      expect(status.hourWIB).toBe(21);
      expect(status.statusNote).toContain('DI LUAR JAM OPERASIONAL');
      expect(status.statusNote).toContain('08.00 WIB besok pagi');
      expect(status.statusNote).toContain('IGD');
    });

    it('calculates operating hours correctly on Sunday (e.g. Sunday 14:00 WIB)', () => {
      // Sunday 14:00 WIB = Sunday 07:00 UTC
      const sundayUTC = new Date('2026-10-18T07:00:00Z');
      const status = getClinicOperatingHoursStatus(sundayUTC);

      expect(status.isOpen).toBe(false);
      expect(status.dayName).toBe('Minggu');
      expect(status.statusNote).toContain('DI LUAR JAM OPERASIONAL');
    });

    it('embeds operating hours policy in system prompt', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      expect(prompt).toContain('JAM LAYANAN OPERASIONAL & RESPON DI LUAR JAM KERJA');
      expect(prompt).toContain('Senin – Sabtu, 08.00 – 20.00 WIB');
      expect(prompt).toContain('08.00 WIB besok pagi');
      expect(prompt).toContain('IGD terdekat jika kondisi si kecil darurat/mendesak');
    });
  });

  // ── TEST 4: TONE OF VOICE & BACKWARD COMPATIBILITY ──────────────────────────
  describe('4. Tone of Voice & Backward Compatibility', () => {
    it('mandates warm, supportive tone without repeating rigid templates', () => {
      const prompt = generateBoonPilotSystemPrompt(mockClinicMetadata);

      expect(prompt).toContain('Santai, hangat, suportif khas admin klinik anak');
      expect(prompt).toContain('tidak kaku');
      expect(prompt).toContain('tidak mengulang-ulang template kalimat yang sama');
    });

    it('maintains backward compatibility with legacy BOONPILOT_TRIAGE_SYSTEM_PROMPT', () => {
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('BoonPilot');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('JANGAN CROSS-OFFER');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('EAT & GROW');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain(CLINIC_OFFICIAL_SCREENING_URL);
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain(CLINIC_KIDMAP_ASSESSMENT_URL);
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('3741672471');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('Muhamad Harys Maulana');
    });

    it('validates CONSULTATION_V1 blueprint code in KnownBlueprintCodeSchema', () => {
      expect(KnownBlueprintCodeSchema.parse('CONSULTATION_V1')).toBe('CONSULTATION_V1');
      expect(KnownBlueprintCodeSchema.parse('CLINIC_CONSULTATION')).toBe('CLINIC_CONSULTATION');
    });
  });
});
