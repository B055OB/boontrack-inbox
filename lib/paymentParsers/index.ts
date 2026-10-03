/**
 * @file lib/paymentParsers/index.ts
 * @description Central registry and dispatcher for bank mutation parsers (Cloudflare Worker Payload Contract).
 *
 * Invariant: Strict UU PDP Data Minimization.
 */

export * from './types';
export * from './mandiriParser';
export * from './bsiParser';
export * from './bcaParser';

import { ParsedBankMutation, BankParserInput } from './types';
import { parseMandiriMutation } from './mandiriParser';
import { parseBsiMutation } from './bsiParser';
import { parseBcaMutation } from './bcaParser';

/**
 * Dispatcher to parse bank mutation based on bank identifier.
 */
export function parseBankMutation(
  bank: 'MANDIRI' | 'BSI' | 'BCA',
  input: BankParserInput
): ParsedBankMutation | null {
  switch (bank) {
    case 'MANDIRI':
      return parseMandiriMutation(input);
    case 'BSI':
      return parseBsiMutation(input);
    case 'BCA':
      return parseBcaMutation(input);
    default:
      return null;
  }
}
