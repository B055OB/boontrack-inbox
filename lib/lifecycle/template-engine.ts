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

    // Contextual intelligent fallbacks
    switch (key) {
      case 'customer_name':
        return 'Ayah/Bunda';
      case 'product_title':
        return 'Konsultasi Tumbuh Kembang';
      case 'doctor_name':
        return 'dr. Harys Maulana & dr. Azizah Ridwan';
      case 'consultation_channel':
        return 'Google Meet / Klinik';
      case 'consultation_time':
        return 'Sesuai Konfirmasi Admin';
      case 'session_link':
        return 'Akan dikirimkan oleh admin sebelum sesi dimulai';
      case 'kidmap_url':
        return payload.order_number
          ? `https://shop.boontrack.com/tumbuh-kembang-anak/kidmap?order=${encodeURIComponent(payload.order_number)}`
          : 'https://shop.boontrack.com/tumbuh-kembang-anak';
      case 'upsell_url':
        return 'https://shop.boontrack.com/tumbuh-kembang-anak/p/play-n-grow-ecourse';
      case 'promo_code':
        return 'ALUMNIGROW';
      default:
        return '';
    }
  });
}
