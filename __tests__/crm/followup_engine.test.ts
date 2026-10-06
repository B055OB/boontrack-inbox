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
      expect(res.templateText).toContain('1 minggu sejak sesi kunjungan terakhir');
    });
  });
});
