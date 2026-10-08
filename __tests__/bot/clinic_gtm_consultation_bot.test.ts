import {
  isClinicConsultationTenant,
  resolveLockedGtmProduct,
  extractClinicIntakeData,
  processConsultationLeadFunnel,
} from '@/lib/funnel/consultation-lead-funnel';
import {
  sendEvolutionPresence,
  sendEvolutionMediaMessage,
} from '@/lib/whatsapp/evolution-webhook-handler';

// Mock fetch for testing Evolution API
const originalFetch = global.fetch;

describe('Klinik Tumbuh Kembang Anak (dr. Harys) - GTM Consultation Bot & Hybrid Funnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockClinicTenant = {
    id: '692080ea-81b7-496b-87ee-bd8b9565b28c',
    slug: 'tumbuh-kembang-anak',
    name: 'Tumbuh Kembang Anak',
    category: 'KLINIK_KONSULTASI',
    business_type: 'CLINIC',
    metadata: {
      category: 'KLINIK_KONSULTASI',
      business_category: 'KLINIK_KONSULTASI',
      custom_domain: 'konsul.littlebitefeeding.com',
      doctors: ['dr. Harys Maulana, Sp.A'],
      qris_payload: '00020101021126570011ID.DANA.WWW011893600915303581514802090358151480303UMI51440014ID.CO.QRIS.WWW0215ID10266110544730303UMI5204899953033605802ID5920Ziad medika, Service6012Kota Cirebon610545141630458FF',
      products: [
        {
          id: 1791347598115,
          name: 'Konsultasi Chat GTM Anak (dr. Harys)',
          slug: 'eat-and-grow-konsultasi-chat-gtm-anak',
          price: 150000,
          promo_price: 150000,
        },
        {
          id: 'course-mpasi',
          name: 'Course MPASI Anti GTM',
          slug: 'happyeating',
          price: 199000,
        },
      ],
    },
  };

  describe('1. Dynamic Tenant & Service Locking', () => {
    it('detects clinic consultation tenant dynamically without hardcoding', () => {
      const isClinic = isClinicConsultationTenant(
        mockClinicTenant,
        mockClinicTenant.metadata,
        mockClinicTenant.metadata.products
      );
      expect(isClinic).toBe(true);
    });

    it('locks focus to Konsultasi Chat GTM Anak (dr. Harys)', () => {
      const lockedProduct = resolveLockedGtmProduct(
        mockClinicTenant.metadata.products,
        mockClinicTenant.metadata
      );
      expect(lockedProduct.name).toBe('Konsultasi Chat GTM Anak (dr. Harys)');
      expect(lockedProduct.slug).toBe('eat-and-grow-konsultasi-chat-gtm-anak');
      expect(lockedProduct.price).toBe(150000);
    });
  });

  describe('2. Patient Intake Slot Filling (extractClinicIntakeData)', () => {
    it('extracts complete patient intake from structured labeled message', () => {
      const message = `
        Nama Orang Tua: Bunda Sinta
        Nama & Usia Anak: Kenzo, 2 tahun
        Keluhan: Anak GTM sudah 3 minggu menolak nasi dan hanya mau susu
      `;
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Bunda Sinta');
      expect(result.data.childInfo).toBe('Kenzo, 2 tahun');
      expect(result.data.complaint).toContain('GTM');
    });

    it('extracts patient intake from numbered list format', () => {
      const message = `
        1. Ayah Budi
        2. Alisa, 18 bulan
        3. BB seret dan suka melepeh makanan
      `;
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Ayah Budi');
      expect(result.data.childInfo).toBe('Alisa, 18 bulan');
      expect(result.data.complaint).toBe('BB seret dan suka melepeh makanan');
    });

    it('extracts intake from natural non-GTM symptoms (makan lama, mengemut, BB seret)', () => {
      const message = 'Arka 14 bulan makan lama diemut terus dan BB susah naik';
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Ayah/Bunda');
      expect(result.data.childName).toBe('Arka');
      expect(result.data.childAge).toBe('14 bulan');
      expect(result.data.complaint).toContain('makan lama');
    });

    it('extracts intake from feeding rules and texture sensitivity complaints', () => {
      const message = 'jadwal makan anak saya berantakan dan sering melepeh tekstur MPASI';
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(true);
      expect(result.data.parentName).toBe('Ayah/Bunda');
      expect(result.data.complaint).toContain('jadwal makan');
    });

    it('handles partial patient data with only parent name and flags incomplete', () => {
      const message = 'Nama Orang Tua: Bunda Maya';
      const result = extractClinicIntakeData(message);
      expect(result.isComplete).toBe(false);
      expect(result.data.parentName).toBe('Bunda Maya');
      expect(result.data.childInfo).toBeUndefined();
    });
  });

  describe('3. Consultation Lead Funnel Processing', () => {
    it('provides warm supportive greeting with medical boundary on initial greeting', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Halo selamat pagi',
        senderPhone: '62899990001',
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('GREETING');
      expect(result.reply).toContain('Konsultasi Chat GTM Anak bersama dr. Harys Maulana');
      expect(result.reply).toContain('asisten klinik');
      expect(result.reply).toContain('Nama Orang Tua');
      expect(result.reply).toContain('Nama & Usia Anak');
      expect(result.reply).toContain('Keluhan / Kondisi Utama');
    });

    it('handles partial submission with only parent name and asks for child & complaint info', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Nama Orang Tua: Bunda Maya',
        senderPhone: `628999900${Date.now().toString().slice(-4)}1`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('CONSULTATION_OFFER');
      expect(result.reply).toContain('Nama & Usia Anak');
      expect(result.reply).toContain('Keluhan / Kondisi Utama');
    });

    it('prevents looping and immediately dispatches Hybrid Checkout when non-GTM feeding complaint is provided', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Arka 14 bulan makan lama diemut terus dan BB susah naik',
        senderPhone: `628999900${Date.now().toString().slice(-4)}2`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('HYBRID_CHECKOUT');
      expect(result.reply).toContain('INVOICE REGISTRASI KONSULTASI GTM');
      expect(result.reply).toContain('Arka');
      expect(result.reply).toContain('QRIS Otomatis');
      expect(result.checkoutUrl).toContain('konsul.littlebitefeeding.com/checkout');
    });

    it('dispatches Hybrid Checkout when inquiry mentions GTM or difficulty eating without looping', async () => {
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message: 'Halo dokter, anak saya GTM susah makan',
        senderPhone: `628999900${Date.now().toString().slice(-4)}3`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('HYBRID_CHECKOUT');
      expect(result.reply).toContain('INVOICE REGISTRASI KONSULTASI GTM');
      expect(result.reply).toContain('QRIS Otomatis');
    });

    it('dispatches Hybrid Checkout when complete intake data is submitted', async () => {
      const message = `
        1. Bunda Fitri
        2. Rayyan (15 bulan)
        3. Menolak makan nasi padat dan sering muntah jika disuapi
      `;
      const result = await processConsultationLeadFunnel({
        tenant: mockClinicTenant,
        tenantSlug: 'tumbuh-kembang-anak',
        message,
        senderPhone: `628999900${Date.now().toString().slice(-4)}4`,
      });

      expect(result.handled).toBe(true);
      expect(result.type).toBe('HYBRID_CHECKOUT');
      expect(result.mediaUrl).toBeDefined();
      expect(result.mediaUrl).toContain('quickchart.io/qr');
      expect(result.reply).toContain('INVOICE REGISTRASI KONSULTASI GTM');
      expect(result.reply).toContain('Bunda Fitri');
      expect(result.reply).toContain('Rayyan');
      expect(result.reply).toContain('QRIS Otomatis');
      expect(result.checkoutUrl).toContain('konsul.littlebitefeeding.com/checkout');
      expect(result.checkoutUrl).toContain('Bunda%20Fitri');
    });
  });

  describe('4. WhatsApp Presence & Media Sending', () => {
    it('calls sendEvolutionPresence with composing state', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      } as any);

      const success = await sendEvolutionPresence('tumbuh-kembang-instance', '6281234567890', 'composing');
      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/sendPresence/tumbuh-kembang-instance'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"presence":"composing"'),
        })
      );
    });

    it('calls sendEvolutionMediaMessage with QRIS image payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key: { id: 'msg-123' } }),
      } as any);

      const success = await sendEvolutionMediaMessage(
        'tumbuh-kembang-instance',
        '6281234567890',
        'https://quickchart.io/qr?text=000201010212...',
        'QRIS Pembayaran Konsultasi'
      );
      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/sendMedia/tumbuh-kembang-instance'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mediatype":"image"'),
        })
      );
    });
  });
});
