/**
 * @file lib/paymentParsers/mandiriParser.ts
 * @description Modular parser for Bank Mandiri mutation notifications (Livin' by Mandiri / e-Banking).
 *
 * Invariant: Strict UU PDP Data Minimization.
 * Only extracts amount, referenceNumber, and occurredAt.
 * Completely excludes and discards balance, account numbers, and personal info.
 */

import { ParsedBankMutation, BankParserInput } from './types';

/**
 * Extracts raw textual content and potential date hint from BankParserInput.
 */
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

/**
 * Parses numeric IDR amount from string.
 * Supports formats: "IDR 150.000,00", "Rp 150.000", "150.000", "150000".
 */
function parseIdrAmount(raw: string): number | null {
  let cleaned = raw.trim();
  // Strip decimals like ,00 or .00 at the end if present
  if (cleaned.endsWith(',00') || cleaned.endsWith('.00')) {
    cleaned = cleaned.slice(0, -3);
  }
  // Strip trailing currency indicators
  cleaned = cleaned.replace(/[,-]$/, '');
  // Keep only digits
  const digits = cleaned.replace(/[^0-9]/g, '');
  const parsed = parseInt(digits, 10);
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/**
 * Parses date string in Indonesian/Standard formats.
 */
function parseDateFromText(text: string, fallback?: Date): Date {
  // Pattern: DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss or YYYY-MM-DD
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

  // ISO format check
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) return d;
  }

  return fallback || new Date();
}

/**
 * Parse Bank Mandiri notification payload.
 *
 * @param input Raw text or Cloudflare Worker payload
 * @returns ParsedBankMutation or null if not valid Mandiri mutation
 */
export function parseMandiriMutation(input: BankParserInput): ParsedBankMutation | null {
  const { text, dateHint } = extractContent(input);
  if (!text || text.trim().length === 0) return null;

  // Debit guard: do not process outgoing debits if explicitly marked DEBET / DB without KREDIT / CR
  const upper = text.toUpperCase();
  if ((upper.includes('DEBET') || upper.includes('DEBIT')) && !upper.includes('KREDIT') && !upper.includes('CR') && !upper.includes('DANA MASUK')) {
    return null;
  }

  // 1. Extract Amount
  // Pattern A: Nominal/Jumlah: IDR 150.000,00 or Rp 150.000
  const amountPatternA = /(?:nominal|jumlah|dana masuk|kredit|cr|sebesar)\s*[:=]?\s*(?:idr|rp\.?)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,})/i;
  // Pattern B: Rp / IDR directly
  const amountPatternB = /(?:idr|rp\.?)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,})/i;

  const matchAmount = text.match(amountPatternA) || text.match(amountPatternB);
  if (!matchAmount) return null;

  const amount = parseIdrAmount(matchAmount[1]);
  if (!amount) return null;

  // 2. Extract Reference Number
  const refPattern = /(?:no\.?\s*referensi|nomor\s*referensi|ref\.?\s*no|reference\s*no|no\.?\s*transaksi|transaction\s*id)[:\s=]*([A-Za-z0-9\-_]+)/i;
  const matchRef = text.match(refPattern);
  const referenceNumber = matchRef ? matchRef[1].trim() : undefined;

  // 3. Extract Occurred Date
  const occurredAt = parseDateFromText(text, dateHint);

  return {
    amount,
    referenceNumber,
    occurredAt,
    bank: 'MANDIRI',
  };
}
