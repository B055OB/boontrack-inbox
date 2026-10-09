import {
  detectPediatricTriageIntent,
  resolveTriageLockedProduct,
  extractClinicIntakeData,
  processConsultationLeadFunnel,
  isClinicConsultationTenant,
  resolveClinicDoctorTeam,
  buildDoctorTeamLabel,
  resolveClinicPaymentAccount,
  generateBoonPilotSystemPrompt,
  CLINIC_OFFICIAL_SCREENING_URL,
  CLINIC_KIDMAP_ASSESSMENT_URL,
  CLINIC_BCA_ACCOUNT,
  BOONPILOT_TRIAGE_SYSTEM_PROMPT,
  type ClinicDoctor,
  type ClinicPaymentAccount,
} from '@/lib/funnel/consultation-lead-funnel';

describe('BoonPilot Pediatric Child Development & Nutrition Triage Bot Specification', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // TEST FIXTURES
  // ──────────────────────────────────────────────────────────────────────────
  const mockTenantProducts = [
    {
      id: 'eat_grow_chat',
      name: 'EAT & GROW - Chat Consultation Dokter Spesialis Anak',
      slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
      price: 150000,
      promo_price: 150000,
    },
    {
      id: 'eat_grow_meet',
      name: 'EAT & GROW - Google Meet Consultation',
      slug: 'eat-and-grow-google-meet',
      price: 250000,
      promo_price: 250000,
    },
    {
      id: 'klinik_screening',
      name: 'Konsultasi Klinik / Screening Tumbuh Kembang',
      slug: 'screening-tumbuh-kembang',
      price: 250000,
      promo_price: 250000,
    },
    {
      id: 'play_n_grow',
      name: 'PLAY N GROW - E-Course Stimulasi Bermain Anak 0-5 Tahun',
      slug: 'play-n-grow-ecourse',
      price: 199000,
      promo_price: 199000,
    },
  ];

  /**
   * Dynamic tenant fixture — uses structured doctor objects & payment_accounts.
   * Slug is arbitrary to prove zero hardcoding policy.
   */
  const mockDynamicClinicTenant = {
    id: 'b7c1a890-4111-4cb5-8f6a-123456789abc',
    slug: 'klinik-tumbuh-hebat',
    name: 'Klinik Tumbuh Hebat',
    category: 'KLINIK_KONSULTASI',
    business_type: 'CLINIC',
    metadata: {
      category: 'KLINIK_KONSULTASI',
      doctors: [
        { doctor_id: 'dr_001', doctor_name: 'dr. Harys Maulana, Sp.A', specialty: 'Spesialis Anak', is_active: true },
        { doctor_id: 'dr_002', doctor_name: 'dr. Azizah Ridwan, Sp.A', specialty: 'Konsultan Laktasi', is_active: true },
      ],
      payment_accounts: [
        {
          bank_name: 'BCA',
          account_number: '3741672471',
          account_holder: 'Muhamad Harys Maulana',
          is_primary: true,
        },
      ],
      products: mockTenantProducts,
      custom_domain: 'konsul.tumbuhhebat.com',
    },
  };

  /**
   * Second tenant with 4 doctors to test collective label logic.
   */
  const mockLargeClinicTenant = {
    id: 'c0000000-0000-0000-0000-000000000001',
    slug: 'klinik-multi-dokter',
    name: 'Klinik Multi Dokter',
    category: 'KLINIK_KONSULTASI',
    business_type: 'CLINIC',
    metadata: {
      category: 'KLINIK_KONSULTASI',
      doctors: [
        { doctor_id: 'dr_a', doctor_name: 'dr. Ana', is_active: true },
        { doctor_id: 'dr_b', doctor_name: 'dr. Budi', is_active: true },
        { doctor_id: 'dr_c', doctor_name: 'dr. Cici', is_active: true },
        { doctor_id: 'dr_d', doctor_name: 'dr. Dedi', is_active: true },
      ],
      payment_accounts: [
        { bank_name: 'Mandiri', account_number: '1234567890', account_holder: 'RS Multi Dokter', is_primary: true },
      ],
      products: mockTenantProducts,
    },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. DYNAMIC TENANT DETECTION (ZERO HARDCODING)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Dynamic Tenant Detection (Zero Hardcoding Compliance)', () => {
    it('detects clinic tenant with dynamic slug based purely on category & metadata', () => {
      const isClinic = isClinicConsultationTenant(
        mockDynamicClinicTenant,
        mockDynamicClinicTenant.metadata,
        mockDynamicClinicTenant.metadata.products
      );
      expect(isClinic).toBe(true);
    });

    it('rejects non-clinic retail tenant', () => {
      const retailTenant = {
        id: '123',
        slug: 'toko-baju-anak',
        category: 'FASHION',
        metadata: { category: 'FASHION', products: [] },
      };
      expect(isClinicConsultationTenant(retailTenant, retailTenant.metadata, [])).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. DYNAMIC DOCTOR TEAM RESOLVERS
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Dynamic Doctor Team Resolvers', () => {
    it('resolves structured doctor objects from metadata.doctors[]', () => {
      const team = resolveClinicDoctorTeam(mockDynamicClinicTenant.metadata);
      expect(team).toHaveLength(2);
      expect(team[0].doctor_name).toBe('dr. Harys Maulana, Sp.A');
      expect(team[1].doctor_name).toBe('dr. Azizah Ridwan, Sp.A');
    });

    it('resolves string-array doctors from metadata.doctors[]', () => {
      const meta = { doctors: ['dr. Sari, Sp.A', 'dr. Budi, Sp.GK'] };
      const team = resolveClinicDoctorTeam(meta);
      expect(team).toHaveLength(2);
      expect(team[0].doctor_name).toBe('dr. Sari, Sp.A');
    });

    it('filters out inactive doctors (is_active: false)', () => {
      const meta = {
        doctors: [
          { doctor_name: 'dr. Aktif', is_active: true },
          { doctor_name: 'dr. Nonaktif', is_active: false },
        ],
      };
      const team = resolveClinicDoctorTeam(meta);
      expect(team).toHaveLength(1);
      expect(team[0].doctor_name).toBe('dr. Aktif');
    });

    it('falls back to legacy dr_name field', () => {
      const meta = { dr_name: 'dr. Legacy' };
      const team = resolveClinicDoctorTeam(meta);
      expect(team).toHaveLength(1);
      expect(team[0].doctor_name).toBe('dr. Legacy');
    });

    it('returns empty array when no doctor config', () => {
      const team = resolveClinicDoctorTeam({});
      expect(team).toHaveLength(0);
    });

    it('buildDoctorTeamLabel: shows collective identity when no doctors configured', () => {
      const label = buildDoctorTeamLabel({});
      expect(label).toBe('Tim Dokter Spesialis Anak & Konsultan Tumbuh Kembang');
    });

    it('buildDoctorTeamLabel: joins 2 doctor names with &', () => {
      const label = buildDoctorTeamLabel(mockDynamicClinicTenant.metadata);
      expect(label).toContain('&');
      expect(label).toContain('dr. Harys Maulana, Sp.A');
      expect(label).toContain('dr. Azizah Ridwan, Sp.A');
    });

    it('buildDoctorTeamLabel: uses count label for 4+ doctors', () => {
      const label = buildDoctorTeamLabel(mockLargeClinicTenant.metadata);
      expect(label).toContain('4 Dokter Aktif');
    });

    it('generateBoonPilotSystemPrompt: uses dynamic doctor label in system prompt', () => {
      const prompt = generateBoonPilotSystemPrompt(mockDynamicClinicTenant.metadata);
      expect(prompt).toContain('dr. Harys Maulana, Sp.A');
      expect(prompt).toContain('dr. Azizah Ridwan, Sp.A');
      expect(prompt).toContain('JANGAN CROSS-OFFER');
      expect(prompt).toContain('EAT & GROW');
      expect(prompt).toContain('KONSULTASI KLINIK');
      expect(prompt).toContain('PLAY N GROW');
    });

    it('generateBoonPilotSystemPrompt: uses collective identity when no doctors', () => {
      const prompt = generateBoonPilotSystemPrompt({ products: mockTenantProducts });
      expect(prompt).toContain('Tim Dokter Spesialis Anak & Konsultan Tumbuh Kembang');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. DYNAMIC PAYMENT ACCOUNT RESOLVERS
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Dynamic Payment Account Resolvers', () => {
    it('reads primary payment account from metadata.payment_accounts[]', () => {
      const acct = resolveClinicPaymentAccount(mockDynamicClinicTenant.metadata);
      expect(acct.bank_name).toBe('BCA');
      expect(acct.account_number).toBe('3741672471');
      expect(acct.account_holder).toBe('Muhamad Harys Maulana');
    });

    it('resolves different bank for different tenant', () => {
      const acct = resolveClinicPaymentAccount(mockLargeClinicTenant.metadata);
      expect(acct.bank_name).toBe('Mandiri');
      expect(acct.account_number).toBe('1234567890');
      expect(acct.account_holder).toBe('RS Multi Dokter');
    });

    it('falls back to legacy bca_account_number field', () => {
      const meta = {
        bca_account_number: '9876543210',
        bca_account_holder: 'Dr. Baru',
      };
      const acct = resolveClinicPaymentAccount(meta);
      expect(acct.account_number).toBe('9876543210');
      expect(acct.account_holder).toBe('Dr. Baru');
      expect(acct.bank_name).toBe('BCA');
    });

    it('falls back to CLINIC_BCA_ACCOUNT constant when no config', () => {
      const acct = resolveClinicPaymentAccount({});
      expect(acct.account_number).toBe(CLINIC_BCA_ACCOUNT.account_number);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. INTENT DETECTION & STRICT PRODUCT LOCKING
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Intent Detection & Strict Product Locking', () => {
    it('locks feeding / GTM / BB seret complaints strictly to EAT & GROW', () => {
      const gtmMessages = [
        'Anak saya 18 bulan GTM parah menolak nasi sama sekali',
        'BB anak saya seret dan stuck sudah 2 bulan, makan selalu dilepeh',
        'Si kecil makan lama sekali, diemut terus sampai 1 jam lebih',
        'Jadwal makan anak berantakan dan menolak tekstur MPASI kasar',
      ];

      for (const msg of gtmMessages) {
        const intent = detectPediatricTriageIntent(msg);
        expect(intent).toBe('FEEDING_GTM_BB');

        const lockedProduct = resolveTriageLockedProduct(intent!, mockTenantProducts);
        expect(lockedProduct.name).toContain('EAT & GROW');
        expect(lockedProduct.price).toBe(150000);
      }
    });

    it('locks direct physical examination / clinical delay to KONSULTASI KLINIK', () => {
      const clinicMessages = [
        'Saya mau periksa fisik langsung ke klinik untuk evaluasi keterlambatan jalan',
        'Mau jadwal periksa langsung tatap muka dengan dokter spesialis di klinik',
        'Si kecil dicurigai speech delay 2 tahun belum bicara, mau kunjungan klinik langsung',
      ];

      for (const msg of clinicMessages) {
        const intent = detectPediatricTriageIntent(msg);
        expect(intent).toBe('CLINIC_PHYSICAL_SCREENING');

        const lockedProduct = resolveTriageLockedProduct(intent!, mockTenantProducts);
        expect(lockedProduct.name).toContain('Konsultasi Klinik');
        expect(lockedProduct.price).toBe(250000);
      }
    });

    it('locks healthy play ideas & stimulation to PLAY N GROW', () => {
      const playMessages = [
        'Mau ide main anak 1 tahun untuk stimulasi motorik di rumah',
        'Ada modul atau ide bermain anak sehat usia 2 tahun?',
        'Mau beli e-course play n grow stimulasi anak',
      ];

      for (const msg of playMessages) {
        const intent = detectPediatricTriageIntent(msg);
        expect(intent).toBe('PLAY_STIMULATION');

        const lockedProduct = resolveTriageLockedProduct(intent!, mockTenantProducts);
        expect(lockedProduct.name).toContain('PLAY N GROW');
        expect(lockedProduct.price).toBe(199000);
      }
    });

    it('ZERO CROSS-OFFER: feeding complaint NEVER yields Play N Grow even if play keyword is present', () => {
      const mixedMessage = 'Anak saya GTM dan BB seret, sambil diajak bermain tetap melepeh makanan';
      const intent = detectPediatricTriageIntent(mixedMessage);
      expect(intent).toBe('FEEDING_GTM_BB');

      const lockedProduct = resolveTriageLockedProduct(intent!, mockTenantProducts);
      expect(lockedProduct.name).toContain('EAT & GROW');
      expect(lockedProduct.name).not.toContain('PLAY N GROW');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. 5-STEP CONVERSATION FLOW (STATE MACHINE)
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. 5-Step Conversation Flow (State Machine Verification)', () => {
    it('Step 1 (Greeting): Warm 1-2 sentences, asks parent name & child age, no product/invoice pitch', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Halo selamat siang dokter',
        senderPhone: '6281234567801',
        hasPreviousGreeting: false,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('GREETING');
      expect(result.reply).toContain('Ayah/Bunda');
      expect(result.reply).toContain('si kecil');
      // Must NOT contain product pitches in STEP 1
      expect(result.reply).not.toContain('Rp 150.000');
      expect(result.reply).not.toContain('INVOICE');
      // Screening URL must NOT be in STEP 1 (only from STEP 3 onwards)
      expect(result.reply).not.toContain(CLINIC_OFFICIAL_SCREENING_URL);
    });

    it('Step 2 (Anamnesis): Empathetically listens to parent name, asks for complaint', async () => {
      const intake = extractClinicIntakeData('Bunda Rina. Anak saya GTM susah makan nasi.');
      expect(intake.data.parentName).toBe('Bunda Rina');
      expect(intake.data.intent).toBe('FEEDING_GTM_BB');

      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Halo, saya Bunda Rina. Si kecil usia 14 bulan GTM susah makan',
        senderPhone: '6281234567802',
      });

      expect(result.handled).toBe(true);
      expect(result.reply).toContain('Bunda Rina');
      expect(result.reply).toContain(CLINIC_OFFICIAL_SCREENING_URL);
    });

    it('Step 3 (Skrining Awal): Directs parent to official screening form', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Si kecil 18 bulan makan diemut terus dan BB susah naik di Bandung',
        senderPhone: '6281234567803',
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('SCREENING_OFFER');
      expect(result.reply).toContain(CLINIC_OFFICIAL_SCREENING_URL);
      expect(result.reply).toContain('evaluasi awal perkembangan');
    });

    it('Step 4 (Solusi & Closing): Offers locked product with flexible payment (dynamic account)', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Hasil skrining kemarin statusnya waspada, saya mau daftar konsultasi dokter dan bayar',
        senderPhone: '6281234567804',
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('HYBRID_CHECKOUT');
      // Payment info comes from tenant metadata.payment_accounts[], not hardcoded
      const paymentAcct = resolveClinicPaymentAccount(mockDynamicClinicTenant.metadata);
      expect(result.reply).toContain(paymentAcct.account_number);
      expect(result.reply).toContain(paymentAcct.account_holder);
      expect(result.reply).toContain(paymentAcct.bank_name);
      expect(result.checkoutUrl).toBeDefined();
    });

    it('Step 4 (Closing): Reply uses dynamic doctor team label instead of hardcoded names', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Skrining sudah waspada, mau bayar dan konsultasi sekarang',
        senderPhone: '6281234567804b',
      });

      const doctorLabel = buildDoctorTeamLabel(mockDynamicClinicTenant.metadata);
      expect(result.reply).toContain(doctorLabel);
    });

    it('Step 5 (Post-Payment): Dispatches Form KIDMAP URL when payment is confirmed', async () => {
      const postPaymentMessages = [
        'Saya sudah transfer ke BCA ya min, ini bukti transfernya',
        'Pembayaran lunas ya dok, mohon dicek',
        'Sudah bayar via checkout, langkah berikutnya apa?',
      ];

      for (const msg of postPaymentMessages) {
        const result = await processConsultationLeadFunnel({
          tenant: mockDynamicClinicTenant,
          tenantSlug: mockDynamicClinicTenant.slug,
          message: msg,
          senderPhone: '6281234567805',
        });

        expect(result.handled).toBe(true);
        expect(result.type).toBe('LEAD_CAPTURED');
        expect(result.reply).toContain(CLINIC_KIDMAP_ASSESSMENT_URL);
        expect(result.reply).toContain('KIDMAP');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. MULTI-TURN ANTI-LOOP: GREETING HANYA MUNCUL 1x
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Multi-Turn Anti-Loop: Greeting fires exactly once', () => {
    it('Turn 1: short greeting triggers GREETING response', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Halo',
        senderPhone: '6289900000001',
        hasPreviousGreeting: false,
      });

      expect(result.type).toBe('GREETING');
      expect(result.handled).toBe(true);
    });

    it('Turn 2: same short greeting with hasPreviousGreeting=true does NOT repeat greeting', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Halo',
        senderPhone: '6289900000001',
        hasPreviousGreeting: true, // session already greeted
      });

      // Should NOT return a GREETING type after first greeting
      // Either handled=false (pass-through) or a different type
      if (result.handled) {
        expect(result.type).not.toBe('GREETING');
      } else {
        expect(result.handled).toBe(false);
      }
    });

    it('Turn 2: follow-up message with conversationHistory does NOT repeat greeting', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Hai',
        senderPhone: '6289900000002',
        hasPreviousGreeting: false,
        conversationHistory: [
          { role: 'assistant', text: 'Halo Ayah/Bunda! Selamat datang...' },
        ],
      });

      if (result.handled) {
        expect(result.type).not.toBe('GREETING');
      } else {
        expect(result.handled).toBe(false);
      }
    });

    it('Multi-turn: complaint message after greeting does NOT re-greet but shows screening flow', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Anak saya 2 tahun GTM dan BB seret terus sudah 3 bulan',
        senderPhone: '6289900000003',
        hasPreviousGreeting: true, // already greeted in a previous turn
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('SCREENING_OFFER');
      // No re-greeting in reply
      expect(result.reply).not.toMatch(/Selamat datang di layanan/);
    });

    it('Multi-turn: payment request does NOT trigger greeting even if message is short', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'mau bayar',
        senderPhone: '6289900000004',
        hasPreviousGreeting: true,
      });

      expect(result.handled).toBe(true);
      expect(result.type).not.toBe('GREETING');
    });

    it('Multi-turn: parent name only message after greeting transitions to STEP_2_ANAMNESIS, not re-greet', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockDynamicClinicTenant,
        tenantSlug: mockDynamicClinicTenant.slug,
        message: 'Bunda Dewi',
        senderPhone: '6289900000005',
        hasPreviousGreeting: true,
      });

      if (result.handled) {
        expect(result.type).toBe('CONSULTATION_OFFER');
        expect(result.nextState).toBe('STEP_2_ANAMNESIS');
        expect(result.reply).toContain('Bunda Dewi');
      }
    });

    it('Multi-turn: large clinic with 4 doctors uses count label in all replies', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockLargeClinicTenant,
        tenantSlug: mockLargeClinicTenant.slug,
        message: 'Halo',
        senderPhone: '6289900000006',
        hasPreviousGreeting: false,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('GREETING');
      // Must use collective label with count, not hardcoded doctor names
      expect(result.reply).toContain('4 Dokter Aktif');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. BACKWARD COMPATIBILITY
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Official System Prompt & Constants Backward Compatibility', () => {
    it('static BOONPILOT_TRIAGE_SYSTEM_PROMPT still contains core identity and anti cross-offer rules', () => {
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('BoonPilot');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('JANGAN CROSS-OFFER');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('EAT & GROW');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('KONSULTASI KLINIK');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('PLAY N GROW');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain(CLINIC_OFFICIAL_SCREENING_URL);
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain(CLINIC_KIDMAP_ASSESSMENT_URL);
    });

    it('static BOONPILOT_TRIAGE_SYSTEM_PROMPT includes default BCA fallback account', () => {
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain(CLINIC_BCA_ACCOUNT.account_number);
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain(CLINIC_BCA_ACCOUNT.account_holder);
    });

    it('static BOONPILOT_TRIAGE_SYSTEM_PROMPT includes default doctor names (backward compat fixture)', () => {
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('dr. Harys Maulana');
      expect(BOONPILOT_TRIAGE_SYSTEM_PROMPT).toContain('dr. Azizah Ridwan');
    });
  });
});
