/**
 * BoonTrack Official Invoice & Receipt Generator
 * Generates an official, standard-compliant PDF (mode PAID) for offline / B2B transactions
 * under PT BOONTRACK INOVASI DIGITAL.
 */

export interface InvoicePdfData {
  client_name: string;
  client_slug?: string;
  amount: number;
  payment_method: 'MANUAL_TRANSFER' | 'CASH' | string;
  invoice_no: string;
  notes?: string;
  category?: 'SAAS_SUBSCRIPTION' | 'B2B_CUSTOM_APP' | 'SPECIAL_CASE' | string;
  status?: string;
  date?: string | Date;
}

/**
 * Escapes characters for PDF string literals.
 */
function escapePdfText(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

/**
 * Auto-generates a standard BoonTrack reference / invoice number:
 * Format: INV/BT/YYYY/MM/XXXX
 */
export function generateDefaultInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const randomSeq = Math.floor(1000 + Math.random() * 9000);
  return `INV/BT/${year}/${month}/${randomSeq}`;
}

/**
 * Builds binary PDF bytes for the official invoice / receipt document.
 * Adheres to standard PDF-1.4 specification with zero external dependencies.
 */
export function generateInvoicePdfBytes(data: InvoicePdfData): Uint8Array {
  const {
    client_name = 'Tenant / Klien',
    client_slug = '',
    amount = 0,
    payment_method = 'MANUAL_TRANSFER',
    invoice_no = generateDefaultInvoiceNumber(),
    notes = '',
    category = 'B2B_CUSTOM_APP',
    status = 'PAID',
    date = new Date(),
  } = data;

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  const formattedAmount = 'Rp ' + Number(amount).toLocaleString('id-ID');
  const paymentChannelLabel =
    payment_method === 'CASH' ? 'Tunai / Direct Cash' : 'Bank Central Asia (BCA)';

  const categoryLabel =
    category === 'SAAS_SUBSCRIPTION'
      ? 'Langganan Toko (SaaS)'
      : category === 'B2B_CUSTOM_APP'
      ? 'Kontrak Custom App / B2B'
      : 'Layanan Khusus / Pilot';

  // Construct drawing instructions for PDF content stream (A4 size: 595.28 x 841.89 pt)
  const streamLines = [
    // ── 1. Header Banner ──
    'q 0.06 0.09 0.16 rg 40 745 515 60 re f Q',
    'q 0.06 0.72 0.51 rg 40 802 515 3 re f Q',
    'q 1 1 1 rg BT /F1 15 Tf 55 778 Td (' + escapePdfText('PT BOONTRACK INOVASI DIGITAL') + ') Tj ET Q',
    'q 0.58 0.64 0.72 rg BT /F2 7.5 Tf 55 762 Td (' + escapePdfText('SaaS & Digital Commerce Infrastructure • PMSE Kemendag RI • Bandung, Jawa Barat') + ') Tj ET Q',
    'q 0.06 0.72 0.51 rg BT /F1 13 Tf 385 778 Td (' + escapePdfText('OFFICIAL INVOICE') + ') Tj ET Q',
    'q 0.8 0.85 0.9 rg BT /F2 7 Tf 365 762 Td (' + escapePdfText('BUKTI KUITANSI PEMBAYARAN SAH') + ') Tj ET Q',

    // ── 2. Client Card (Left) ──
    'q 0.97 0.98 0.99 rg 40 635 250 90 re f Q',
    'q 0.88 0.91 0.94 RG 1 w 40 635 250 90 re S Q',
    'q 0.4 0.45 0.5 rg BT /F1 8 Tf 52 705 Td (' + escapePdfText('DITAGIHKAN KEPADA (CLIENT):') + ') Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 12 Tf 52 685 Td (' + escapePdfText(client_name) + ') Tj ET Q',
    'q 0.06 0.6 0.42 rg BT /F2 8.5 Tf 52 668 Td (' + escapePdfText('Tenant Slug: /' + (client_slug || '-')) + ') Tj ET Q',
    'q 0.4 0.45 0.5 rg BT /F2 7.5 Tf 52 650 Td (' + escapePdfText('Status Akun: AKTIF / TERVERIFIKASI') + ') Tj ET Q',

    // ── 3. Invoice Meta Card (Right) ──
    'q 0.97 0.98 0.99 rg 305 635 250 90 re f Q',
    'q 0.88 0.91 0.94 RG 1 w 305 635 250 90 re S Q',
    'q 0.4 0.45 0.5 rg BT /F1 8 Tf 317 705 Td (' + escapePdfText('NOMOR INVOICE / REFERENSI:') + ') Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 11 Tf 317 687 Td (' + escapePdfText(invoice_no) + ') Tj ET Q',
    'q 0.2 0.25 0.3 rg BT /F2 8 Tf 317 671 Td (' + escapePdfText('Tanggal: ' + formattedDate) + ') Tj ET Q',
    'q 0.2 0.25 0.3 rg BT /F2 8 Tf 317 656 Td (' + escapePdfText('Metode: ' + paymentChannelLabel) + ') Tj ET Q',
    'q 0.06 0.6 0.42 rg BT /F1 8.5 Tf 317 641 Td (' + escapePdfText(`STATUS: ${status.toUpperCase()} (SETTLED)`) + ') Tj ET Q',

    // ── 4. Itemized Table ──
    'q 0.09 0.13 0.20 rg 40 590 515 25 re f Q',
    'q 1 1 1 rg BT /F1 8 Tf 52 598 Td (' + escapePdfText('NO') + ') Tj ET Q',
    'q 1 1 1 rg BT /F1 8 Tf 85 598 Td (' + escapePdfText('DESKRIPSI TRANSAKSI & LAYANAN') + ') Tj ET Q',
    'q 1 1 1 rg BT /F1 8 Tf 340 598 Td (' + escapePdfText('KATEGORI') + ') Tj ET Q',
    'q 1 1 1 rg BT /F1 8 Tf 460 598 Td (' + escapePdfText('TOTAL (IDR)') + ') Tj ET Q',

    'q 1 1 1 rg 40 540 515 50 re f Q',
    'q 0.88 0.91 0.94 RG 1 w 40 540 515 50 re S Q',
    'q 0.1 0.15 0.2 rg BT /F2 9 Tf 54 566 Td (1) Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 9.5 Tf 85 568 Td (' + escapePdfText('Pembayaran Kontrak Layanan Digital BoonTrack') + ') Tj ET Q',
    'q 0.45 0.5 0.55 rg BT /F2 8 Tf 85 552 Td (' + escapePdfText(notes || 'Settlement transaksi offline resmi platform') + ') Tj ET Q',
    'q 0.1 0.15 0.2 rg BT /F2 8.5 Tf 340 565 Td (' + escapePdfText(categoryLabel) + ') Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 10 Tf 445 565 Td (' + escapePdfText(formattedAmount) + ') Tj ET Q',

    // Total Bar
    'q 0.94 0.98 0.96 rg 40 505 515 30 re f Q',
    'q 0.06 0.72 0.51 RG 1 w 40 505 515 30 re S Q',
    'q 0.06 0.09 0.16 rg BT /F1 10 Tf 245 516 Td (' + escapePdfText(`TOTAL DITERIMA (${status.toUpperCase()}):`) + ') Tj ET Q',
    'q 0.06 0.6 0.42 rg BT /F1 12 Tf 435 515 Td (' + escapePdfText(formattedAmount) + ') Tj ET Q',

    // ── 5. Rekening Resmi & Stamp Section ──
    'q 0.97 0.98 0.99 rg 40 365 295 115 re f Q',
    'q 0.88 0.91 0.94 RG 1 w 40 365 295 115 re S Q',
    'q 0.35 0.4 0.45 rg BT /F1 8 Tf 52 462 Td (' + escapePdfText('REKENING RESMI SETTLEMENT PLATFORM:') + ') Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 8.5 Tf 52 444 Td (' + escapePdfText('Bank              : Bank Central Asia (BCA)') + ') Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 9 Tf 52 428 Td (' + escapePdfText('Nomor Rekening    : 8470192344') + ') Tj ET Q',
    'q 0.06 0.09 0.16 rg BT /F1 8.5 Tf 52 412 Td (' + escapePdfText('Atas Nama         : PT BOONTRACK INOVASI DIGITAL') + ') Tj ET Q',
    'q 0.35 0.4 0.45 rg BT /F2 8 Tf 52 396 Td (' + escapePdfText('Cabang Operasional: Bandung, Jawa Barat') + ') Tj ET Q',
    'q 0.5 0.55 0.6 rg BT /F2 7 Tf 52 380 Td (' + escapePdfText('* Rekening resmi berbadan hukum PT (Perseroan Terbatas)') + ') Tj ET Q',

    // Stamp
    'q 0.06 0.72 0.51 RG 2 w 355 365 200 115 re S Q',
    'q 0.06 0.72 0.51 RG 1 w 360 370 190 105 re S Q',
    'q 0.06 0.6 0.42 rg BT /F1 7.5 Tf 372 455 Td (' + escapePdfText('★ PT BOONTRACK INOVASI DIGITAL ★') + ') Tj ET Q',
    'q 0.4 0.45 0.5 rg BT /F2 7 Tf 385 442 Td (' + escapePdfText('DIVISI KEUANGAN & PEMBUKUAN') + ') Tj ET Q',
    'q 0.06 0.72 0.51 rg BT /F1 15 Tf 380 416 Td (' + escapePdfText(`L U N A S / ${status.toUpperCase()}`) + ') Tj ET Q',
    'q 0.06 0.72 0.51 RG 1 w 375 408 m 535 408 l S Q',
    'q 0.1 0.15 0.2 rg BT /F1 7.5 Tf 388 394 Td (' + escapePdfText('SETTLED & VERIFIED INVOICE') + ') Tj ET Q',
    'q 0.4 0.45 0.5 rg BT /F2 6.5 Tf 375 380 Td (' + escapePdfText('Ref: ' + invoice_no) + ') Tj ET Q',

    // ── 6. Notes & Terms ──
    'q 0.98 0.99 1.0 rg 40 270 515 75 re f Q',
    'q 0.88 0.91 0.94 RG 1 w 40 270 515 75 re S Q',
    'q 0.35 0.4 0.45 rg BT /F1 8 Tf 52 330 Td (' + escapePdfText('CATATAN TRANSAKSI & KETENTUAN LAYANAN:') + ') Tj ET Q',
    'q 0.1 0.15 0.2 rg BT /F2 8 Tf 52 312 Td (' + escapePdfText('Catatan Internal : ' + (notes || 'Pembayaran telah diterima penuh & dialokasikan ke kontrak tenant.')) + ') Tj ET Q',
    'q 0.3 0.35 0.4 rg BT /F2 8 Tf 52 296 Td (' + escapePdfText('Audit Trail      : Dicatat secara permanen pada tenant_credit_ledger & general_ledger sistem.') + ') Tj ET Q',
    'q 0.4 0.45 0.5 rg BT /F2 7.5 Tf 52 280 Td (' + escapePdfText('Keabsahan Dokumen: Faktur digital ini merupakan bukti bayar sah sesuai regulasi PMSE & UU ITE.') + ') Tj ET Q',

    // ── 7. Footer ──
    'q 0.85 0.88 0.92 RG 1 w 40 95 515 0 re S Q',
    'q 0.3 0.35 0.4 rg BT /F1 7.5 Tf 95 80 Td (' + escapePdfText('PT BOONTRACK INOVASI DIGITAL • Penyedia Platform Perdagangan Melalui Sistem Elektronik (PMSE)') + ') Tj ET Q',
    'q 0.5 0.55 0.6 rg BT /F2 7 Tf 75 68 Td (' + escapePdfText('Domain Resmi: https://boontrack.com | shop.boontrack.com • Email: billing@boontrack.com') + ') Tj ET Q',
  ];

  const streamContent = streamLines.join('\n') + '\n';
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);
  const streamLength = streamBytes.length;

  const header = '%PDF-1.4\n%âãÏÓ\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /ProcSet [/PDF /Text] >> /Contents 6 0 R >>\nendobj\n';
  const obj4 =
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n';
  const obj5 =
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n';
  const obj6Header = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n`;
  const obj6Footer = '\nendstream\nendobj\n';

  // Compute exact byte offsets
  const hBytes = encoder.encode(header);
  const o1Bytes = encoder.encode(obj1);
  const o2Bytes = encoder.encode(obj2);
  const o3Bytes = encoder.encode(obj3);
  const o4Bytes = encoder.encode(obj4);
  const o5Bytes = encoder.encode(obj5);
  const o6HBytes = encoder.encode(obj6Header);
  const o6FBytes = encoder.encode(obj6Footer);

  let currentOffset = hBytes.length;
  const offsets: number[] = [];

  offsets.push(currentOffset);
  currentOffset += o1Bytes.length;

  offsets.push(currentOffset);
  currentOffset += o2Bytes.length;

  offsets.push(currentOffset);
  currentOffset += o3Bytes.length;

  offsets.push(currentOffset);
  currentOffset += o4Bytes.length;

  offsets.push(currentOffset);
  currentOffset += o5Bytes.length;

  offsets.push(currentOffset);
  currentOffset += o6HBytes.length + streamBytes.length + o6FBytes.length;

  const xrefOffset = currentOffset;

  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const xrefBytes = encoder.encode(xref);
  const trBytes = encoder.encode(trailer);

  const totalLength =
    hBytes.length +
    o1Bytes.length +
    o2Bytes.length +
    o3Bytes.length +
    o4Bytes.length +
    o5Bytes.length +
    o6HBytes.length +
    streamBytes.length +
    o6FBytes.length +
    xrefBytes.length +
    trBytes.length;

  const result = new Uint8Array(totalLength);
  let pos = 0;

  result.set(hBytes, pos); pos += hBytes.length;
  result.set(o1Bytes, pos); pos += o1Bytes.length;
  result.set(o2Bytes, pos); pos += o2Bytes.length;
  result.set(o3Bytes, pos); pos += o3Bytes.length;
  result.set(o4Bytes, pos); pos += o4Bytes.length;
  result.set(o5Bytes, pos); pos += o5Bytes.length;
  result.set(o6HBytes, pos); pos += o6HBytes.length;
  result.set(streamBytes, pos); pos += streamBytes.length;
  result.set(o6FBytes, pos); pos += o6FBytes.length;
  result.set(xrefBytes, pos); pos += xrefBytes.length;
  result.set(trBytes, pos); pos += trBytes.length;

  return result;
}

/**
 * Client-side browser trigger:
 * Generates and downloads the official PDF file named `Invoice_{invoice_no}.pdf`
 */
export function downloadInvoicePdf(data: InvoicePdfData): void {
  if (typeof window === 'undefined') return;

  const pdfBytes = generateInvoicePdfBytes(data);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  // Sanitize invoice_no for filesystem compatibility (avoid slashes causing directory errors)
  const safeInvoiceNo = (data.invoice_no || 'OFFLINE').replace(/[\/\\]/g, '_');
  const filename = `Invoice_${safeInvoiceNo}.pdf`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);
}
