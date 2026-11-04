/**
 * lib/qr/qrExporter.ts
 *
 * High-Resolution QR Code Engine and PNG Image Exporter Utility.
 *
 * Implements:
 * 1. High-resolution client-side QR Code generation (default 512x512 px, Level 'H').
 * 2. Instant PNG download helper with standardized naming (qr-[tenant]-[reseller_code].png).
 * 3. Sanitized filename generator and WhatsApp reseller dispatch URL builder.
 */

import QRCode from 'qrcode';

export interface ResellerQrOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: {
    dark?: string;
    light?: string;
  };
}

export const DEFAULT_QR_OPTIONS: ResellerQrOptions = {
  width: 512,
  margin: 2,
  errorCorrectionLevel: 'H',
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
};

/**
 * Sanitizes tenant and reseller slug/code into safe filename segment.
 * E.g. 'Shabu Ajhi', 'Reva Cantika' -> 'qr-shabu-ajhi-reva-cantika.png'
 */
export function formatResellerQrFileName(
  tenantSlug: string,
  resellerCodeOrSlug: string
): string {
  const cleanTenant = (tenantSlug || 'tenant')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');

  const cleanReseller = (resellerCodeOrSlug || 'reseller')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');

  return `qr-${cleanTenant}-${cleanReseller}.png`;
}

/**
 * Generates high-resolution PNG Data URL for a given referral URL.
 * Defaults to 512x512px with high error correction ('H') for clear print/scan readability.
 */
export async function generateResellerQrDataUrl(
  url: string,
  options?: ResellerQrOptions
): Promise<string> {
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new Error('URL referral tidak boleh kosong.');
  }

  const mergedOptions: QRCode.QRCodeToDataURLOptions = {
    width: options?.width ?? DEFAULT_QR_OPTIONS.width,
    margin: options?.margin ?? DEFAULT_QR_OPTIONS.margin,
    errorCorrectionLevel:
      options?.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
    color: {
      dark: options?.color?.dark ?? DEFAULT_QR_OPTIONS.color?.dark,
      light: options?.color?.light ?? DEFAULT_QR_OPTIONS.color?.light,
    },
  };

  return await QRCode.toDataURL(url.trim(), mergedOptions);
}

/**
 * Triggers instant client-side PNG download in the user's browser.
 * Does not require external server round-trip or page reload.
 */
export function downloadQrAsPng(params: {
  dataUrl: string;
  tenantSlug: string;
  resellerCodeOrSlug: string;
  customFileName?: string;
}): boolean {
  const { dataUrl, tenantSlug, resellerCodeOrSlug, customFileName } = params;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    console.error('[downloadQrAsPng] Invalid data URL provided');
    return false;
  }

  const fileName =
    customFileName || formatResellerQrFileName(tenantSlug, resellerCodeOrSlug);

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  return true;
}

/**
 * Builds direct WhatsApp dispatch link for CS/Admin to share referral link & instructions with the reseller.
 */
export function buildResellerWhatsAppShareUrl(params: {
  phone?: string;
  resellerName: string;
  referralCode: string;
  referralUrl: string;
  storeName?: string;
}): { waUrl: string; message: string; targetPhone: string } {
  const rawPhone = (params.phone || '').replace(/\D/g, '');
  const cleanPhone = rawPhone.startsWith('0')
    ? '62' + rawPhone.slice(1)
    : rawPhone.startsWith('62')
    ? rawPhone
    : rawPhone ? '62' + rawPhone : '';

  const storeName = params.storeName || 'BoonTrack Store';

  const message =
    `Halo ${params.resellerName},\n\n` +
    `Berikut adalah tautan referral & barcode promosi resmi Anda untuk toko *${storeName}*:\n\n` +
    `🔗 *Link Toko Anda:* ${params.referralUrl}\n` +
    `🏷️ *Kode Referral:* ${params.referralCode}\n\n` +
    `💡 *Tips Promosi:* Simpan gambar Barcode / QR Code promosi Anda dan bagikan ke media sosial (WhatsApp Status, Instagram Story, TikTok) untuk mencatat komisi penjualan otomatis.\n\n` +
    `Semoga laris manis!`;

  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { waUrl, message, targetPhone: cleanPhone };
}

