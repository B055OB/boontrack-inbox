import { calculateFollowUpInfo } from '@/lib/crm/followup-engine';
import { toE164, formatDisplayPhone } from '@/lib/crm/phone-utils';

describe('CRM Follow-Up Automation Engine & Phone Utils', () => {
  describe('Phone Utils', () => {
    it('normalizes local Indonesian numbers to E.164 format', () => {
      expect(toE164('08123456789')).toBe('+628123456789');
      expect(toE164('628123456789')).toBe('+628123456789');
      expect(toE164('+628123456789')).toBe('+628123456789');
      expect(toE164('8123456789')).toBe('+628123456789');
      expect(toE164('0812-3456-789')).toBe('+628123456789');
    });

    it('formats display phone cleanly', () => {
      expect(formatDisplayPhone('+628123456789')).toContain('+62 812');
      expect(formatDisplayPhone(null)).toBe('-');
    });
  });

  describe('Birthday Reminder Trigger', () => {
    it('triggers BIRTHDAY when child birth date matches current day and month', () => {
      const today = new Date();
      const yyyy = today.getFullYear() - 3;
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const birthDate = `${yyyy}-${mm}-${dd}`;

      const res = calculateFollowUpInfo({
        customerName: 'Bunda Laras',
        birthDate,
        lastVisitDate: null,
        tenantName: 'Klinik Tumbuh Kembang dr. Harys',
      });

      expect(res.type).toBe('BIRTHDAY');
      expect(res.isDueToday).toBe(true);
      expect(res.label).toContain('Ulang Tahun Hari Ini');
      expect(res.templateText).toContain('Bunda Laras');
      expect(res.templateText).toContain('Selamat Ulang Tahun');
    });
  });

  describe('H+3 Follow-Up Trigger', () => {
    it('triggers H3_DUE when last visit was exactly 3 days ago', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const res = calculateFollowUpInfo({
        customerName: 'Ayah Dimas',
        birthDate: null,
        lastVisitDate: threeDaysAgo,
        tenantName: 'Klinik Tumbuh Kembang dr. Harys',
      });

      expect(res.type).toBe('H3_DUE');
      expect(res.isDueToday).toBe(true);
      expect(res.label).toContain('H+3');
      expect(res.templateText).toContain('Ayah Dimas');
      expect(res.templateText).toContain('sesi 3 hari lalu');
    });

    it('shows UPCOMING_H3 when visit was 1 day ago', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

      const res = calculateFollowUpInfo({
        customerName: 'Ayah Dimas',
        birthDate: null,
        lastVisitDate: oneDayAgo,
        tenantName: 'Klinik dr. Harys',
      });

      expect(res.type).toBe('UPCOMING_H3');
      expect(res.isDueToday).toBe(false);
      expect(res.label).toContain('H+3 (2 hari lagi)');
    });
  });

  describe('H+7 Follow-Up Trigger', () => {
    it('triggers H7_DUE when visit was 7 days ago', () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const res = calculateFollowUpInfo({
        customerName: 'Bunda Sarah',
        birthDate: null,
        lastVisitDate: sevenDaysAgo,
        tenantName: 'Klinik dr. Harys',
      });

      expect(res.type).toBe('H7_DUE');
      expect(res.isDueToday).toBe(true);
      expect(res.label).toContain('H+7');
      expect(res.templateText).toContain('Bunda Sarah');
      expect(res.templateText).toContain('sejak sesi kunjungan terakhir');
    });
  });

  describe('Dynamic Tenant Rules (Custom Days & Templates)', () => {
    it('supports custom H+5 and H+14 intervals configured by tenant', () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const customRules = {
        h1Days: 5,
        h2Days: 14,
        h1Template: 'Halo [nama], evaluasi sesi [hari] hari lalu di [toko] 🙏',
        h2Template: 'Halo [nama], follow-up berkala [hari] hari dari [toko] ✨',
      };

      // Test H+5
      const resH1 = calculateFollowUpInfo({
        customerName: 'Bunda Jessica',
        birthDate: null,
        lastVisitDate: fiveDaysAgo,
        tenantName: 'Klinik Tumbuh Kembang Sejahtera',
        rules: customRules,
      });

      expect(resH1.isDueToday).toBe(true);
      expect(resH1.label).toContain('H+5');
      expect(resH1.templateText).toBe('Halo Bunda Jessica, evaluasi sesi 5 hari lalu di Klinik Tumbuh Kembang Sejahtera 🙏');

      // Test H+14
      const resH2 = calculateFollowUpInfo({
        customerName: 'Bunda Jessica',
        birthDate: null,
        lastVisitDate: fourteenDaysAgo,
        tenantName: 'Klinik Tumbuh Kembang Sejahtera',
        rules: customRules,
      });

      expect(resH2.isDueToday).toBe(true);
      expect(resH2.label).toContain('H+14');
      expect(resH2.templateText).toBe('Halo Bunda Jessica, follow-up berkala 14 hari dari Klinik Tumbuh Kembang Sejahtera ✨');
    });

    it('respects disabled flags (e.g. birthdayEnabled: false)', () => {
      const today = new Date();
      const yyyy = today.getFullYear() - 2;
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const birthDate = `${yyyy}-${mm}-${dd}`;

      const res = calculateFollowUpInfo({
        customerName: 'Bunda Dian',
        birthDate,
        lastVisitDate: null,
        tenantName: 'Klinik dr. Harys',
        rules: {
          birthdayEnabled: false,
        },
      });

      expect(res.type).toBe('NONE');
      expect(res.isDueToday).toBe(false);
    });
  });
});
