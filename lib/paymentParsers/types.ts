/**
 * @file lib/paymentParsers/types.ts
 * @description Standardized contracts for bank mutation parsers (Cloudflare Worker Payload Contract).
 *
 * Invariant: Strict UU PDP Data Minimization.
 * DILARANG KERAS menyimpan atau mengembalikan raw body email penuh, total saldo rekening,
 * saldo akhir mutasi, atau nomor rekening lengkap tanpa masking.
 */

export interface ParsedBankMutation {
  amount: number;
  referenceNumber?: string;
  occurredAt: Date;
  bank: 'MANDIRI' | 'BSI' | 'BCA';
}

export type BankParserInput =
  | string
  | {
      subject?: string;
      body?: string;
      text?: string;
      html?: string;
      date?: string | Date;
      timestamp?: string | number;
    };
