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
  processConsultationLeadFunnel,
  isGaptekOrCasualMessage,
  validateClinicBotOutput,
  buildSafeFrontDeskFallback,
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

      // Strict Medical Boundary & Anti-Overstepping
      expect(prompt).toContain('BUKAN DOKTER');
      expect(prompt).toContain('DILARANG KERAS memvonis atau mendiagnosis');
      expect(prompt).toContain('DILARANG MERESEPKAN OBAT-OBATAN KERAS / MEDIS');
      expect(prompt).toContain('ATURAN UTAMA ASISTEN KLINIK (ANTI-OVERSTEPPING MEDIS - MUTLAK)');
      expect(prompt).toContain('DILARANG KERAS memberikan langkah terapi, instruksi stimulasi fisik/oral');
      expect(prompt).toContain('ASISTEN ADMINISTRASI & NAVIGASI, BUKAN DOKTER');
      expect(prompt).toContain('JANGAN PERNAH TERLIHAT LEBIH PINTAR DARI DOKTER');
      expect(prompt).toContain('Memahami kekhawatiran Ayah/Bunda, fase adaptasi tekstur');

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

  const mockDynamicClinicTenant = {
    id: 'tenant-clinic-101',
    slug: 'ziad-medika',
    name: 'Klinik Ziad Medika',
    category: 'CLINIC',
    tier: 'PRO_SCALE',
    metadata: mockClinicMetadata,
  };

  // ── TEST 5: INTERCEPTOR AUDIT & GAPTEK / CASUAL CHAT BYPASS ────────────────
  describe('5. Interceptor Audit & "Gaptek" / Casual Chat Bypass', () => {
    it('correctly detects gaptek and casual chat requests via isGaptekOrCasualMessage', () => {
      expect(isGaptekOrCasualMessage('Halo dok, saya gaptek nih')).toBe(true);
      expect(isGaptekOrCasualMessage('saya bingung buka link form nya')).toBe(true);
      expect(isGaptekOrCasualMessage('mau tanya-tanya santai dulu ya dok')).toBe(true);
      expect(isGaptekOrCasualMessage('bisa dijelaskan langsung di chat wa aja?')).toBe(true);
      expect(isGaptekOrCasualMessage('curhat dulu dong dok soal anak saya')).toBe(true);

      // Normal clinical anamnesis messages without gaptek signals must NOT trigger bypass
      expect(isGaptekOrCasualMessage('Si kecil 18 bulan makan diemut terus dan BB susah naik')).toBe(false);
      expect(isGaptekOrCasualMessage('Halo selamat siang dokter')).toBe(false);
      expect(isGaptekOrCasualMessage('Hasil skrining kemarin waspada, mau bayar')).toBe(false);
    });

    it('bypasses static screening interceptor when parent mentions gaptek (handled: false -> passes to LLM)', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Halo dok, saya gaptek nih mau tanya-tanya dulu soal anak saya susah makan',
        senderPhone: '6281234567890',
      });

      // Must NOT be intercepted by static rigid template screening reply
      expect(result.handled).toBe(false);
      expect(result.reply).toBe('');
      // Flow falls through to Gemini 3.8 Flash which uses generateBoonPilotSystemPrompt
    });

    it('bypasses static screening interceptor when parent requests casual chat directly in WA', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Dok mau tanya-tanya santai dulu di chat aja ya, belum mau isi form link luar',
        senderPhone: '6281234567891',
      });

      expect(result.handled).toBe(false);
      expect(result.reply).toBe('');
    });

    it('bypasses static screening interceptor when parent inquires about other products / e-book', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Saya mau beli produk lain atau modul e-book panduan makan ada gak dok?',
        senderPhone: '6281234567899',
      });

      expect(result.handled).toBe(false);
      expect(result.reply).toBe('');
    });

    it('completely bypasses "Terima kasih infonya Ayah/Bunda. Masalah GTM" static template when skipConversationalTemplates is true', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'anak saya gtm susah makan usia 2 tahun bb seret',
        senderPhone: '6281234567898',
        skipConversationalTemplates: true,
      });

      expect(result.handled).toBe(false);
      expect(result.reply).not.toContain('Terima kasih infonya Ayah/Bunda. Masalah GTM');
      expect(result.reply).toBe('');
    });

    it('completely bypasses static template when tenant has blueprint_code CONSULTATION_V1', async () => {
      const tenantWithBlueprint = {
        ...mockDynamicClinicTenant,
        metadata: {
          ...mockDynamicClinicTenant.metadata,
          blueprint_code: 'CONSULTATION_V1',
        },
      };

      const result = await processConsultationLeadFunnel({
        tenant: tenantWithBlueprint,
        tenantSlug: tenantWithBlueprint.slug,
        message: 'anak saya gtm susah makan',
        senderPhone: '6281234567897',
      });

      expect(result.handled).toBe(false);
      expect(result.reply).not.toContain('Terima kasih infonya Ayah/Bunda. Masalah GTM');
      expect(result.reply).toBe('');
    });
  });

  // ── TEST 6: PRE-LLM DETERMINISTIC EMERGENCY SAFETY GATE ───────────────────
  describe('6. Pre-LLM Deterministic Emergency Safety Gate', () => {
    it('immediately intercepts "anak saya kejang" deterministically with IGD referral and human handover', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Tolong dok anak saya kejang matanya melotot ke atas!',
        senderPhone: '6281234567892',
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('EMERGENCY_ESCALATION');
      expect(result.nextState).toBe('HANDOVER_TO_HUMAN');
      expect(result.reply).toContain('[PERINGATAN KEGAWATDARURATAN MEDIS]');
      expect(result.reply).toContain('Instalasi Gawat Darurat (IGD)');
      expect(result.reply).toContain('DIHENTIKAN SEKETIKA');
      expect(result.reply).toContain('kejang');
    });

    it('intercepts "tidak sadar lemas lunglai" and triggers emergency gate', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Anak saya pingsan tidak sadar lemas lunglai tidak merespon',
        senderPhone: '6281234567893',
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('EMERGENCY_ESCALATION');
      expect(result.nextState).toBe('HANDOVER_TO_HUMAN');
      expect(result.reply).toContain('IGD');
    });

    it('intercepts "sesak napas berat" and "henti napas" acute signals', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Tolong dok si kecil sesak napas berat dan bibir biru membiru',
        senderPhone: '6281234567894',
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('EMERGENCY_ESCALATION');
      expect(result.nextState).toBe('HANDOVER_TO_HUMAN');
      expect(result.reply).toContain('IGD');
    });
  });

  // ── TEST 7: POST-LLM OUTPUT VALIDATOR ─────────────────────────────────────
  describe('7. Post-LLM Output Validator (Post-Inference Safety Guardrails)', () => {
    it('blocks definitive diagnosis claims ("anak Anda menderita...") and returns safe front-desk fallback', () => {
      const dangerousOutput =
        'Berdasarkan gejala yang Bunda sampaikan, anak Anda menderita stunting kronis dan gizi buruk berat. Segera lakukan penanganan ini.';

      const validation = validateClinicBotOutput(dangerousOutput, {
        tenant: mockDynamicClinicTenant,
        meta: mockClinicMetadata,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.violations).toContain('DEFINITIVE_DIAGNOSIS');
      expect(validation.sanitizedReply).toContain('Sebagai asisten front-desk dan edukasi');
      expect(validation.sanitizedReply).toContain('tidak berwenang menegakkan diagnosis medis pasti');
      expect(validation.sanitizedReply).not.toContain('anak Anda menderita stunting kronis');
    });

    it('blocks prescription or hard drug recommendations ("antibiotik amoxicillin...") and returns safe fallback', () => {
      const dangerousDrugOutput =
        'Untuk mengatasi demam dan radang si kecil, Bunda bisa berikan antibiotik amoxicillin puyer racikan 3 kali sehari.';

      const validation = validateClinicBotOutput(dangerousDrugOutput, {
        tenant: mockDynamicClinicTenant,
        meta: mockClinicMetadata,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.violations).toContain('HARD_DRUG_PRESCRIPTION');
      expect(validation.sanitizedReply).toContain('tidak berwenang');
      expect(validation.sanitizedReply).toContain('resep obat keras');
      expect(validation.sanitizedReply).not.toContain('amoxicillin');
    });

    it('blocks prescriptive home therapy or oral stimulation instructions ("lakukan pijat oral...") and returns safe fallback', () => {
      const therapyOversteppingOutput =
        'Untuk mengatasi GTM si kecil, Bunda bisa lakukan pijat oral pada gusi dan lidah si kecil setiap sebelum makan, lalu ikuti aturan menaikkan tekstur secara mandiri.';

      const validation = validateClinicBotOutput(therapyOversteppingOutput, {
        tenant: mockDynamicClinicTenant,
        meta: mockClinicMetadata,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.violations).toContain('THERAPY_OVERSTEPPING');
      expect(validation.sanitizedReply).toContain('Sebagai asisten front-desk dan edukasi');
      expect(validation.sanitizedReply).toContain('instruksi terapi teknis');
      expect(validation.sanitizedReply).not.toContain('pijat oral');
    });

    it('blocks unauthorized foreign URLs outside tenant and official screening whitelist', () => {
      const foreignLinkOutput =
        'Untuk beli suplemen anak, silakan kunjungi link toko ini: https://shopee.co.id/toko-herbal-murah atau https://random-blog.xyz/obat';

      const validation = validateClinicBotOutput(foreignLinkOutput, {
        tenant: mockDynamicClinicTenant,
        meta: mockClinicMetadata,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.violations).toContain('UNAUTHORIZED_URL');
      expect(validation.blockedUrls).toContain('https://shopee.co.id/toko-herbal-murah');
      expect(validation.sanitizedReply).toContain('Sebagai asisten front-desk');
    });

    it('permits safe front-desk output with official whitelisted screening link', () => {
      const safeOutput =
        `Halo Bunda Rina! Terima kasih sudah berbagi. Masalah si kecil yang mulai pemilih makanan di usia 14 bulan adalah hal yang umum terjadi.\n\n` +
        `Agar tim dokter kami mendapatkan gambaran lengkap mengenai riwayat makan si kecil, silakan isi form skrining resmi berikut ya:\n` +
        `👉 https://screening.littlebitefeeding.com/\n\n` +
        `Tim kami siap mendampingi. Tetap semangat ya Bun! 😊`;

      const validation = validateClinicBotOutput(safeOutput, {
        tenant: mockDynamicClinicTenant,
        meta: mockClinicMetadata,
      });

      expect(validation.isValid).toBe(true);
      expect(validation.violations.length).toBe(0);
      expect(validation.sanitizedReply).toBe(safeOutput);
    });
  });
});

