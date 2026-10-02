/**
 * @file __tests__/payment/dana_reader.test.ts
 * @description Unit tests for DANA Notification Parser Hardening (ACT-01).
 *
 * Verifies:
 * 1. Rejection of all false-positive and promo/cashback/voucher keywords.
 * 2. Mandatory genuine credit mutation regex patterns.
 * 3. Strict numerical extraction without decimal ambiguity.
 * 4. 100% exact numerical match validation before confirming PAID status.
 */

import {
  parseDanaNotification,
  extractDanaExactAmount,
  extractDanaSender,
  validateOrderPaymentMatch,
} from '@/lib/payment/dana-reader';

describe('ACT-01: DANA Notification Parser Hardening', () => {
  describe('Anti False-Positive & Promo/Cashback Rejection Guard', () => {
    const falsePositiveSamples = [
      'Cashback Rp 5.000 telah masuk ke saldo DANA Anda',
      'Voucher diskon 50% berhasil diklaim untuk transaksi berikutnya',
      'Promo seru: dapatkan potongan belanja hingga Rp 25.000',
      'Saldo bertambah karena promo DANA Kaget Rp 10.000',
      'Isi saldo gagal sebesar Rp 50.000, silakan coba beberapa saat lagi',
      'Kamu telah membayar Rp 75.000 ke Toko Kopi Sejahtera',
      'Kirim uang berhasil sebesar Rp 100.000 ke rekening BCA',
      'Tagihan berhasil dibayar sebesar Rp 150.000',
      'Klaim voucher diskon Rp 20.000 sekarang di aplikasi DANA',
      'Selamat! Anda mendapatkan reward cashback Rp 2.500',
      'Ikuti promo DANA Kaget dan menangkan saldo gratis',
      'Pembaruan sistem DANA: Nikmati fitur pembayaran terbaru kami',
      '',
    ];

    test.each(falsePositiveSamples)(
      'rejects non-mutation or false-positive notification: "%s"',
      (sample) => {
        const result = parseDanaNotification(sample);
        expect(result.isValidCredit).toBe(false);
        expect(result.isRejected).toBe(true);
        expect(result.amount).toBeNull();
        expect(result.rejectionReason).toBeTruthy();
      }
    );
  });

  describe('Genuine Credit Mutation Detection & Strict Numeric Extraction', () => {
    test('parses DANA Bisnis standard customer payment with sender', () => {
      const text = 'DANA Bisnis: Kamu menerima pembayaran sebesar Rp1.771 dari Sakti Alamsyah';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(1771);
      expect(result.sender).toBe('Sakti Alamsyah');
    });

    test('parses DANA money received notification with comma sen separator', () => {
      const text = 'DANA: Berhasil menerima uang masuk Rp 50.000,00 dari John Doe';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(50000);
      expect(result.sender).toBe('John Doe');
    });

    test('parses DANA transfer incoming notification', () => {
      const text = 'Transfer dari Jane Doe sebesar Rp 100.000 telah masuk ke akun Anda';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(100000);
      expect(result.sender).toBe('Jane Doe');
    });

    test('parses official top up notification', () => {
      const text = 'Top up berhasil sebesar Rp 25.000';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(25000);
    });

    test('parses kiriman uang incoming notification', () => {
      const text = 'Kiriman uang sebesar Rp 75.000 dari Ani Wijaya';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(75000);
      expect(result.sender).toBe('Ani Wijaya');
    });

    test('parses QRIS payment received with dash sen separator', () => {
      const text = 'Pembayaran QRIS diterima Rp 1.771.- dari Pelanggan';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(1771);
    });

    test('parses large transaction amount with multiple thousand delimiters', () => {
      const text = 'DANA Bisnis: Transaksi QRIS sebesar Rp1.500.000,00 sukses';
      const result = parseDanaNotification(text);

      expect(result.isRejected).toBe(false);
      expect(result.isValidCredit).toBe(true);
      expect(result.amount).toBe(1500000);
    });
  });

  describe('extractDanaExactAmount() helper edge cases', () => {
    test('correctly strips currency indicators and trailing punctuation', () => {
      expect(extractDanaExactAmount('Rp 1.771.')).toBe(1771);
      expect(extractDanaExactAmount('IDR 250000')).toBe(250000);
      expect(extractDanaExactAmount('sebesar Rp 99.000,-')).toBe(99000);
      expect(extractDanaExactAmount('menerima Rp 10.000,00')).toBe(10000);
      expect(extractDanaExactAmount('pembayaran Rp 15000')).toBe(15000);
    });

    test('returns null for empty or non-numeric input', () => {
      expect(extractDanaExactAmount('')).toBeNull();
      expect(extractDanaExactAmount('Tidak ada angka di sini')).toBeNull();
    });
  });

  describe('validateOrderPaymentMatch() strict 100% numerical verification', () => {
    test('returns true when incoming amount matches order gross amount 100%', () => {
      expect(validateOrderPaymentMatch(1771, 1771)).toBe(true);
      expect(validateOrderPaymentMatch(150000, 150000)).toBe(true);
    });

    test('returns false when amounts mismatch by even 1 rupiah', () => {
      expect(validateOrderPaymentMatch(1771, 1770)).toBe(false);
      expect(validateOrderPaymentMatch(1771, 1772)).toBe(false);
    });

    test('strictly rejects fuzzy 1-999 tolerance differences', () => {
      // Order is 50000, but notification is 50123 (difference 123)
      expect(validateOrderPaymentMatch(50000, 50123)).toBe(false);
      // Order is 50000, notification is 49999 (difference 1)
      expect(validateOrderPaymentMatch(50000, 49999)).toBe(false);
    });

    test('returns false for zero or negative values', () => {
      expect(validateOrderPaymentMatch(0, 1000)).toBe(false);
      expect(validateOrderPaymentMatch(1000, 0)).toBe(false);
      expect(validateOrderPaymentMatch(-1000, -1000)).toBe(false);
    });
  });
});
