/**
 * @file lib/lifecycle/template-engine.ts
 * @description Variable substitution engine for lifecycle message templates.
 */

import { LifecycleEventPayload } from './types';

/**
 * Standard variable resolution map with intelligent fallbacks
 */
export function resolveTemplateVariables(
  templateBody: string,
  payload: LifecycleEventPayload
): string {
  if (!templateBody) return '';

  return templateBody.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const val = payload[key];
    if (val !== undefined && val !== null && val !== '') {
      return String(val);
    }

    // Contextual intelligent fallbacks (Strict Zero Hardcoding & Isolation)
    switch (key) {
      case 'customer_name':
        return 'Pelanggan';
      case 'product_title':
        return 'Layanan';
      case 'doctor_name':
        return '';
      case 'consultation_channel':
        return 'WhatsApp / Online';
      case 'consultation_time':
        return 'Sesuai Konfirmasi Admin';
      case 'session_link':
        return 'Akan dikirimkan oleh admin sebelum sesi dimulai';
      case 'kidmap_url':
        return '';
      case 'upsell_url':
        return '';
      case 'promo_code':
        return '';
      default:
        return '';
    }
  });
}
