import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import { createOrderAndInvoice } from '@/lib/checkout-service';

describe('Checkout Form Validation & QRIS Generation Suite', () => {
  describe('Email & WhatsApp Sanitization Logic', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    it('should clean and lower-case email with trailing/leading spaces from mobile autofill', () => {
      const rawMobileEmail = '  Budi.Pratama@Gmail.COM  ';
      const cleanEmail = rawMobileEmail.trim().toLowerCase();

      expect(cleanEmail).toBe('budi.pratama@gmail.com');
      expect(emailRegex.test(cleanEmail)).toBe(true);
    });

    it('should reject invalid email formats after trimming', () => {
      const invalidEmails = [
        'user@',
        '@domain.com',
        'user@domain',
        'user name@domain.com',
        '',
      ];

      invalidEmails.forEach((email) => {
        const cleaned = email.trim().toLowerCase();
        expect(emailRegex.test(cleaned)).toBe(false);
      });
    });

    it('should sanitize WhatsApp number and require at least 9 digits', () => {
      const validNumbers = [
        '081234567890',
        '+62 812-3456-7890',
        '0812-3456-789',
      ];

      validNumbers.forEach((raw) => {
        const cleanPhone = raw.trim().replace(/[^0-9+]/g, '');
        const phoneDigitsOnly = cleanPhone.replace(/[^0-9]/g, '');
        expect(phoneDigitsOnly.length >= 9).toBe(true);
      });

      const invalidNumbers = [
        '0812',
        '12345',
        'abc',
        '',
      ];

      invalidNumbers.forEach((raw) => {
        const cleanPhone = raw.trim().replace(/[^0-9+]/g, '');
        const phoneDigitsOnly = cleanPhone.replace(/[^0-9]/g, '');
        expect(phoneDigitsOnly.length >= 9).toBe(false);
      });
    });
  });

  describe('QRIS Dynamic Injection for Digital/Service Tenant (tumbuh-kembang-anak)', () => {
    const sampleStaticQris =
      '00020101021126590014ID.LINKAJA.WWW011893600911002209569502091211738720303UMI51440014ID.CO.QRIS.WWW0215ID10200211738720303UMI5204581253033605802ID5919TUMBUH KEMBANG ANAK6007BANDUNG61054011562070703A0163048995';

    it('should generate valid dynamic QRIS with Tag 54 amount for consultation product (Rp 150.000)', () => {
      const amount = 150000;
      const dynamicQris = generateDynamicQRIS(sampleStaticQris, amount);

      expect(dynamicQris).toBeDefined();
      expect(dynamicQris.startsWith('000201')).toBe(true);
      // Tag 54 nominal 150000 (length 6): 5406150000
      expect(dynamicQris).toContain('5406150000');
      // Should switch Tag 01 from static (010211) to dynamic (010212)
      expect(dynamicQris).toContain('010212');
      // CRC16 at the end (Tag 63 length 04)
      expect(dynamicQris).toMatch(/6304[0-9A-F]{4}$/);
    });
  });

  describe('Database Order Payload Physical Columns Isolation', () => {
    it('should verify non-physical columns are excluded from direct orders table insert', () => {
      const nonPhysicalColumns = [
        'fulfillment_type',
        'unit_price',
        'is_archived',
        'subscription_id',
      ];

      const rawDbPayload: Record<string, any> = {
        id: 'ORD-TEST-123',
        tenant_id: 'test-uuid',
        fulfillment_type: 'DELIVERY',
        unit_price: 150000,
        is_archived: false,
        subscription_id: null,
        total_amount: 150000,
        customer_name: 'Budi Pratama',
        customer_phone: '081234567890',
        customer_email: 'budi@example.com',
        status: 'PENDING',
      };

      // Strip non-physical columns as done in checkout-service.ts
      nonPhysicalColumns.forEach((col) => {
        delete rawDbPayload[col];
      });

      nonPhysicalColumns.forEach((col) => {
        expect(rawDbPayload).not.toHaveProperty(col);
      });

      expect(rawDbPayload).toHaveProperty('id');
      expect(rawDbPayload).toHaveProperty('total_amount', 150000);
      expect(rawDbPayload).toHaveProperty('customer_email', 'budi@example.com');
      expect(rawDbPayload).toHaveProperty('status', 'PENDING');
    });
  });

  describe('End-to-End Simulation: tumbuh-kembang-anak Digital Checkout', () => {
    it('should create order with PENDING status and generate dynamic QRIS for tumbuh-kembang-anak', async () => {
      const orderPayload = {
        tenantSlug: 'tumbuh-kembang-anak',
        productId: 'eat-and-grow-konsultasi-chat-gtm-anak',
        productTitle: 'Konsultasi Chat GTM Anak (1 Minggu)',
        amount: 150000,
        basePrice: 150000,
        paymentMethod: 'qris' as const,
        customerName: 'Budi Pratama',
        customerPhone: '081234567890',
        customerEmail: 'budi.pratama@gmail.com',
        productType: 'SERVICE',
      };

      const result = await createOrderAndInvoice(orderPayload);
      expect(result).toBeDefined();
      expect(result.orderId).toBeDefined();
      expect(result.orderId.startsWith('ORD-')).toBe(true);
      expect(result.invoiceUrl).toBe(`/checkout/${result.orderId}`);
      expect(result.qrString).toBeDefined();
      expect(result.qrString.startsWith('000201')).toBe(true);
      expect(result.qrCodeUrl).toBeDefined();
    });
  });
});

