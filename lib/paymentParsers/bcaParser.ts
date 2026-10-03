/**
 * @file lib/paymentParsers/bcaParser.ts
 * @description Modular parser for Bank Central Asia (BCA) mutation notifications (m-BCA / KlikBCA / Email).
 *
 * Invariant: Strict UU PDP Data Minimization.
 * Only extracts amount, referenceNumber, and occurredAt.
 * Completely excludes and discards balance, account numbers, and personal info.
 */

import { ParsedBankMutation, BankParserInput } from './types';

function extractContent(input: BankParserInput): { text: string; dateHint?: Date } {
  if (typeof input === 'string') {
    return { text: input };
  }
  const parts: string[] = [];
  if (input.subject) parts.push(input.subject);
  if (input.text) parts.push(input.text);
  if (input.body) parts.push(input.body);
  if (input.html) {
    parts.push(input.html.replace(/<[^>]*>?/gm, ' '));
  }
  let dateHint: Date | undefined;
  if (input.date) {
    const d = input.date instanceof Date ? input.date : new Date(input.date);
    if (!isNaN(d.getTime())) dateHint = d;
  } else if (input.timestamp) {
    const d = new Date(input.timestamp);
    if (!isNaN(d.getTime())) dateHint = d;
  }
  return { text: parts.join('\n'), dateHint };
}

function parseIdrAmount(raw: string): number | null {
  let cleaned = raw.trim();
  if (cleaned.endsWith(',00') || cleaned.endsWith('.00')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.replace(/[,-]$/, '');
  const digits = cleaned.replace(/[^0-9]/g, '');
  const parsed = parseInt(digits, 10);
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function parseDateFromText(text: string, fallback?: Date): Date {
  // Pattern 1: Tanggal: DD/MM/YYYY Jam: HH:mm:ss
  const tanggalJamMatch = text.match(/(?:tanggal|tgl)[:\s]*(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[^\n\r]*?(?:jam|waktu|pukul)[:\s]*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/i);
  if (tanggalJamMatch) {
    const day = parseInt(tanggalJamMatch[1], 10);
    const month = parseInt(tanggalJamMatch[2], 10) - 1;
    const year = parseInt(tanggalJamMatch[3], 10);
    const hours = tanggalJamMatch[4] ? parseInt(tanggalJamMatch[4], 10) : 0;
    const minutes = tanggalJamMatch[5] ? parseInt(tanggalJamMatch[5], 10) : 0;
    const seconds = tanggalJamMatch[6] ? parseInt(tanggalJamMatch[6], 10) : 0;
    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d;
  }

  // Pattern 2: DD/MM/YYYY HH:mm:ss
  const dmyMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d;
  }

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) return d;
  }

  return fallback || new Date();
}

/**
 * Parse Bank Central Asia (BCA) notification payload.
 *
 * @param input Raw text or Cloudflare Worker payload
 * @returns ParsedBankMutation or null if not valid BCA mutation
 */
export function parseBcaMutation(input: BankParserInput): ParsedBankMutation | null {
  const { text, dateHint } = extractContent(input);
  if (!text || text.trim().length === 0) return null;

  // Debit guard: BCA notifications often have "DB" or "Debet" vs "CR" or "Kredit"
  const upper = text.toUpperCase();
  if ((upper.includes('DEBET') || upper.includes('DEBIT')) && !upper.includes('KREDIT') && !upper.includes('CR') && !upper.includes('TRANSFER MASUK') && !upper.includes('DANA MASUK')) {
    return null;
  }

  // 1. Extract Amount
  // Pattern A: Nominal/Jumlah: IDR 250.000,00 or Rp 250.000
  const amountPatternA = /(?:nominal|jumlah|transfer masuk|dana masuk|kredit|cr|sebesar)\s*[:=]?\s*(?:idr|rp\.?)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,})/i;
  const amountPatternB = /(?:idr|rp\.?)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,})/i;

  const matchAmount = text.match(amountPatternA) || text.match(amountPatternB);
  if (!matchAmount) return null;

  const amount = parseIdrAmount(matchAmount[1]);
  if (!amount) return null;

  // 2. Extract Reference Number (BCA uses No. Transaksi, No. Referensi, or Ref)
  const refPattern = /(?:no\.?\s*referensi|nomor\s*referensi|no\.?\s*transaksi|nomor\s*transaksi|ref\.?\s*no|reference\s*no)[:\s=]*([A-Za-z0-9\-_]+)/i;
  const matchRef = text.match(refPattern);
  const referenceNumber = matchRef ? matchRef[1].trim() : undefined;

  // 3. Extract Occurred Date
  const occurredAt = parseDateFromText(text, dateHint);

  return {
    amount,
    referenceNumber,
    occurredAt,
    bank: 'BCA',
  };
}
