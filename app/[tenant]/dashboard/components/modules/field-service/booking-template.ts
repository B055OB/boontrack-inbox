export const DEFAULT_BOOKING_SUMMARY_TEMPLATE = `JASA TOREN KARAWANG
🚰 Order ukuran toren : {ukuran_toren}
👤 Nama Client : {nama_client}
🏠 Alamat : {alamat}
🗓️ Tanggal Eksekusi : {tanggal}
⏰ Waktu : {jam}
📱 No. WA : {no_wa}
📍 Link Google map : {link_maps}`;

export interface BookingTemplateVariables {
  nama_client?: string;
  ukuran_toren?: string;
  alamat?: string;
  tanggal?: string;
  jam?: string;
  no_wa?: string;
  link_maps?: string;
}

export const TEMPLATE_VARIABLES_HINTS = [
  { tag: '{nama_client}', desc: 'Nama pelanggan' },
  { tag: '{ukuran_toren}', desc: 'Ukuran / jenis toren' },
  { tag: '{alamat}', desc: 'Alamat lengkap pengerjaan' },
  { tag: '{tanggal}', desc: 'Tanggal kunjungan' },
  { tag: '{jam}', desc: 'Slot waktu / jam eksekusi' },
  { tag: '{no_wa}', desc: 'Nomor WhatsApp client' },
  { tag: '{link_maps}', desc: 'Link Google Maps' },
];

export function parseBookingSummaryTemplate(
  template: string | undefined | null,
  variables: BookingTemplateVariables
): string {
  const tpl = template && template.trim() ? template : DEFAULT_BOOKING_SUMMARY_TEMPLATE;
  return tpl
    .replace(/{nama_client}/gi, variables.nama_client || '-')
    .replace(/{ukuran_toren}/gi, variables.ukuran_toren || '-')
    .replace(/{alamat}/gi, variables.alamat || '-')
    .replace(/{tanggal}/gi, variables.tanggal || '-')
    .replace(/{jam}/gi, variables.jam || '-')
    .replace(/{no_wa}/gi, variables.no_wa || '-')
    .replace(/{link_maps}/gi, variables.link_maps && variables.link_maps.trim() ? variables.link_maps.trim() : '-');
}

export function getStoredBookingTemplate(tenantSlug: string): string {
  if (typeof window === 'undefined') return DEFAULT_BOOKING_SUMMARY_TEMPLATE;
  try {
    const custom = localStorage.getItem(`boontrack_booking_template_${tenantSlug}`);
    if (custom && custom.trim()) return custom;
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_BOOKING_SUMMARY_TEMPLATE;
}

export function setStoredBookingTemplate(tenantSlug: string, template: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`boontrack_booking_template_${tenantSlug}`, template);
  } catch {
    // Ignore storage errors
  }
}
