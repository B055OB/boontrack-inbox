/**
 * Order Fulfillment Helper: Thermal Resi 10x15cm, Invoice Printing, and Lincah.id CSV Export.
 * Standard: BoonTrack Multi-Tenant Fulfillment (§6 P1 Sprint)
 */

import { OrderItem } from '@/app/[tenant]/dashboard/components/tabs/OrdersTab';

/**
 * Generate a clean Code 128-style barcode SVG without external dependencies.
 */
export function generateBarcodeSvg(code: string): string {
  const cleanCode = (code || 'ORDER-000').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  // Deterministic bar widths based on char codes
  let bars = '101001101101'; // start sequence
  for (let i = 0; i < cleanCode.length; i++) {
    const charCode = cleanCode.charCodeAt(i);
    const pattern = ((charCode * 13) % 64).toString(2).padStart(6, '0');
    for (const bit of pattern) {
      bars += bit === '1' ? '110' : '10';
    }
  }
  bars += '1100010101011'; // stop sequence

  const barWidth = 2;
  const height = 48;
  const totalWidth = bars.length * barWidth;

  let rects = '';
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] === '1') {
      rects += `<rect x="${i * barWidth}" y="0" width="${barWidth}" height="${height}" fill="#000" />`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" preserveAspectRatio="none">${rects}</svg>`;
}

/**
 * Parses address parts into street address, subdistrict, city, and postal code.
 */
export function parseAddressComponents(rawAddress?: string): {
  street: string;
  subdistrict: string;
  city: string;
  postalCode: string;
} {
  if (!rawAddress) {
    return { street: '-', subdistrict: '-', city: '-', postalCode: '-' };
  }

  const parts = rawAddress.split(',').map((p) => p.trim());
  const postalMatch = rawAddress.match(/\b\d{5}\b/);
  const postalCode = postalMatch ? postalMatch[0] : (parts.length > 3 ? parts[parts.length - 1] : '-');

  let street = parts[0] || rawAddress;
  let subdistrict = parts.length > 2 ? parts[parts.length - 3] : (parts[1] || '-');
  let city = parts.length > 1 ? parts[parts.length - 2] : (parts[0] || '-');

  return { street, subdistrict, city, postalCode };
}

/**
 * Open Thermal Shipping Label (10x15 cm) print window.
 */
export function printThermalShippingLabel(
  order: OrderItem,
  storeInfo: { name: string; phone?: string; city?: string }
): void {
  const printWindow = window.open('', '_blank', 'width=450,height=650');
  if (!printWindow) {
    alert('Pop-up terblokir oleh browser. Izinkan pop-up untuk mencetak label pengiriman.');
    return;
  }

  const barcodeSvg = generateBarcodeSvg(order.invoice_no || order.id);
  const addr = parseAddressComponents(order.shipping_address);
  const courier = (order.shipping_courier || 'JNE REG').toUpperCase();
  const isCod = (order.payment_method || '').toUpperCase().includes('COD') || (order.payment_status || '').toUpperCase() === 'COD';
  const totalAmount = order.total_amount ? `Rp ${order.total_amount.toLocaleString('id-ID')}` : 'Rp 0';
  const itemsSummary = order.items_summary || 'Produk Pesanan';
  const sku = order.fulfillment_metadata?.sku || order.product_type || 'SKU-STD';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Label Pengiriman - #${order.invoice_no}</title>
  <style>
    @page {
      size: 100mm 150mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 100mm;
      height: 148mm;
      padding: 6mm 7mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    .label-container {
      border: 2px solid #000;
      border-radius: 4px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 4mm;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .courier-badge {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.5px;
      text-transform: uppercase;
      background: #000;
      color: #fff;
      padding: 3px 8px;
      border-radius: 3px;
    }
    .order-date {
      font-size: 9px;
      text-align: right;
      color: #444;
    }
    .barcode-box {
      text-align: center;
      padding: 4px 0;
      border-bottom: 1px dashed #000;
      margin-bottom: 6px;
    }
    .barcode-text {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      margin-top: 2px;
      font-family: monospace;
    }
    .address-section {
      border-bottom: 1px solid #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .address-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #333;
      margin-bottom: 2px;
    }
    .person-name {
      font-size: 13px;
      font-weight: 900;
      margin-bottom: 1px;
    }
    .person-phone {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 3px;
    }
    .person-address {
      font-size: 11px;
      line-height: 1.3;
    }
    .sender-box {
      background: #f4f4f4;
      border: 1px solid #ccc;
      padding: 4px 6px;
      border-radius: 3px;
      margin-bottom: 6px;
      font-size: 10px;
    }
    .items-box {
      border: 1px solid #000;
      border-radius: 3px;
      padding: 4px 6px;
      margin-bottom: 6px;
      flex-grow: 1;
    }
    .items-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      border-bottom: 1px solid #ddd;
      padding-bottom: 2px;
      margin-bottom: 3px;
    }
    .item-desc {
      font-size: 11px;
      font-weight: 700;
    }
    .item-meta {
      font-size: 10px;
      color: #444;
    }
    .payment-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 2px solid #000;
      padding-top: 6px;
    }
    .payment-badge {
      font-size: 14px;
      font-weight: 900;
      padding: 3px 6px;
      border: 2px solid #000;
      border-radius: 4px;
    }
    .badge-cod {
      background: #000;
      color: #fff;
    }
    .badge-paid {
      background: #fff;
      color: #000;
    }
    .total-text {
      text-align: right;
    }
    .total-val {
      font-size: 14px;
      font-weight: 900;
    }
  </style>
</head>
<body>
  <div class="label-container">
    <div>
      <div class="header-row">
        <div class="courier-badge">${courier}</div>
        <div class="order-date">
          <div>Tanggal: ${new Date(order.created_at).toLocaleDateString('id-ID')}</div>
          <div>BoonTrack Thermal Fulfillment</div>
        </div>
      </div>

      <div class="barcode-box">
        <div style="max-height: 48px; overflow: hidden;">
          ${barcodeSvg}
        </div>
        <div class="barcode-text">#${order.invoice_no || order.id}</div>
      </div>

      <div class="address-section">
        <div class="address-title">Penerima (Receiver):</div>
        <div class="person-name">${order.customer_name || 'Pelanggan Toko'}</div>
        <div class="person-phone">Telp: ${order.customer_phone || '-'}</div>
        <div class="person-address">${order.shipping_address || 'Alamat tidak tertera'}</div>
      </div>

      <div class="sender-box">
        <div style="font-weight: 800;">Pengirim (Sender): ${storeInfo.name}</div>
        <div>No. HP: ${storeInfo.phone || '-'} | Asal: ${storeInfo.city || 'Indonesia'}</div>
      </div>

      <div class="items-box">
        <div class="items-title">Rincian Paket &amp; SKU:</div>
        <div class="item-desc">${itemsSummary}</div>
        <div class="item-meta">SKU: ${sku} | Berat: 1.00 kg</div>
      </div>
    </div>

    <div class="payment-footer">
      <div class="payment-badge ${isCod ? 'badge-cod' : 'badge-paid'}">
        ${isCod ? 'COD (BAYAR DI TEMPAT)' : 'NON-COD / LUNAS'}
      </div>
      <div class="total-text">
        <div style="font-size: 9px; color: #555;">Total Tagihan:</div>
        <div class="total-val">${totalAmount}</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Open Standard Order Invoice print window.
 */
export function printOrderInvoice(
  order: OrderItem,
  storeInfo: { name: string; phone?: string; address?: string }
): void {
  const printWindow = window.open('', '_blank', 'width=750,height=900');
  if (!printWindow) {
    alert('Pop-up terblokir oleh browser. Izinkan pop-up untuk mencetak invoice.');
    return;
  }

  const isPaid = (order.payment_status || '').toUpperCase() === 'PAID';
  const isPickup =
    (order as any).fulfillment_type === 'PICKUP' ||
    (order as any).metadata?.fulfillment_type === 'PICKUP' ||
    String(order.shipping_courier || '').toLowerCase().includes('pickup') ||
    String(order.shipping_courier || '').toLowerCase().includes('ambil sendiri');
  const pickupData = (order as any).pickup_info || (order as any).metadata?.pickup_info || null;
  const totalAmount = order.total_amount ? `Rp ${order.total_amount.toLocaleString('id-ID')}` : 'Rp 0';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice - #${order.invoice_no}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      padding: 30px;
      color: #1e293b;
      line-height: 1.5;
    }
    .invoice-card {
      max-width: 680px;
      margin: 0 auto;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .store-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
    }
    .invoice-title {
      font-size: 24px;
      font-weight: 900;
      color: #2563eb;
      text-align: right;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      margin-top: 6px;
      background: ${isPaid ? '#ecfdf5' : '#fef3c7'};
      color: ${isPaid ? '#047857' : '#b45309'};
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
      font-size: 13px;
    }
    .info-col h4 {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      padding: 10px 14px;
      text-align: left;
      font-weight: 800;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .text-right {
      text-align: right;
    }
    .total-box {
      margin-left: auto;
      width: 260px;
      font-size: 13px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
    }
    .grand-total {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
      border-top: 2px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 4px;
    }
    .footer {
      margin-top: 36px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="store-name">${storeInfo.name}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${storeInfo.phone || ''}</div>
      </div>
      <div style="text-align: right;">
        <div class="invoice-title">INVOICE</div>
        <div style="font-size: 12px; font-weight: 700; color: #64748b;">#${order.invoice_no || order.id}</div>
        <div class="status-badge">${isPaid ? 'LUNAS / PAID' : 'MENUNGGU PEMBAYARAN'}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-col">
        <h4>Ditagihkan Kepada (Pelanggan):</h4>
        <div style="font-weight: 700; font-size: 14px;">${order.customer_name || 'Pelanggan Toko'}</div>
        <div>No. WhatsApp: ${order.customer_phone || '-'}</div>
        <div>Email: ${order.customer_email || '-'}</div>
        <div>${isPickup ? 'Metode Serah Terima: Ambil Langsung di Toko' : `Alamat: ${order.shipping_address || '-'}`}</div>
      </div>
      <div class="info-col">
        <h4>Detail Transaksi:</h4>
        <div>Tanggal Pesanan: ${new Date(order.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        <div>Metode Pembayaran: ${order.payment_method || 'QRIS Dinamis'}</div>
        ${isPickup ? `
          <div>Fulfillment: <strong>Ambil Sendiri di Toko (Self-Pickup)</strong></div>
          ${pickupData?.address || storeInfo.address ? `<div>Lokasi Toko: ${pickupData?.address || storeInfo.address}</div>` : ''}
          ${pickupData?.mapsUrl ? `<div>Petunjuk Arah: <a href="${pickupData.mapsUrl}" target="_blank" style="color: #2563eb;">Buka Google Maps</a></div>` : ''}
          ${pickupData?.instructions ? `<div>Instruksi: ${pickupData.instructions}</div>` : ''}
        ` : `
          <div>Ekspedisi: ${order.shipping_courier || 'Kurir Reguler'}</div>
          ${order.waybill ? `<div>No. Resi: <strong>${order.waybill}</strong></div>` : ''}
        `}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Deskripsi Barang</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div style="font-weight: 700;">${order.items_summary || 'Pesanan Produk'}</div>
            <div style="font-size: 11px; color: #64748b;">SKU: ${order.fulfillment_metadata?.sku || '-'}</div>
          </td>
          <td class="text-right">${(order as any).quantity || (order as any).metadata?.quantity || 1}</td>
          <td class="text-right">${totalAmount}</td>
        </tr>
      </tbody>
    </table>

    <div class="total-box">
      <div class="total-row">
        <span>Subtotal</span>
        <span>${totalAmount}</span>
      </div>
      <div class="total-row">
        <span>Biaya Pengiriman</span>
        <span>Gratis / Termasuk</span>
      </div>
      <div class="total-row grand-total">
        <span>Total Bayar</span>
        <span>${totalAmount}</span>
      </div>
    </div>

    <div class="footer">
      Terima kasih telah berbelanja di <strong>${storeInfo.name}</strong>.<br>
      Faktur ini sah dan diproses otomatis oleh sistem BoonTrack Multi-Tenant Gateway.
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Export orders to Lincah.id Mass Upload CSV format.
 * Exact columns: Receiver Name,Phone,Address,Sub-district,City,Postal Code,Weight,Item Description,COD Amount
 */
export function exportOrdersToLincahCsv(orders: OrderItem[], tenantSlug: string): void {
  if (!orders || orders.length === 0) {
    alert('Tidak ada pesanan untuk diekspor.');
    return;
  }

  const headers = [
    'Receiver Name',
    'Phone',
    'Address',
    'Sub-district',
    'City',
    'Postal Code',
    'Weight',
    'Item Description',
    'COD Amount',
  ];

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""').trim();
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

  const rows = orders.map((ord) => {
    const addr = parseAddressComponents(ord.shipping_address);
    const isCod = (ord.payment_method || '').toUpperCase().includes('COD') || (ord.payment_status || '').toUpperCase() === 'COD';
    const codAmount = isCod ? ord.total_amount : 0;
    const phone = (ord.customer_phone || '').replace(/[^0-9+]/g, '');

    return [
      escapeCsv(ord.customer_name || 'Pelanggan'),
      escapeCsv(phone),
      escapeCsv(addr.street),
      escapeCsv(addr.subdistrict),
      escapeCsv(addr.city),
      escapeCsv(addr.postalCode),
      escapeCsv(1000), // Default 1 kg in grams for Lincah portal
      escapeCsv(ord.items_summary || 'Produk Pesanan'),
      escapeCsv(codAmount),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('download', `Lincah_MassUpload_${tenantSlug}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format a Date object to ISO 8601 with a specific UTC offset (e.g., +07:00 for WIB).
 * Example: 2026-10-09T10:00:00+07:00
 */
export function formatIsoWithOffset(date: Date, offsetHours: number = 7): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('[formatIsoWithOffset] Date invalid atau bukan objek Date yang valid.');
  }

  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const sign = offsetHours >= 0 ? '+' : '-';
  const totalOffsetMinutes = Math.abs(offsetHours) * 60;
  const offsetFormatted = `${sign}${pad(Math.floor(totalOffsetMinutes / 60))}:${pad(totalOffsetMinutes % 60)}`;

  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const targetDate = new Date(utcMs + offsetHours * 3600000);

  const YYYY = targetDate.getFullYear();
  const MM = pad(targetDate.getMonth() + 1);
  const DD = pad(targetDate.getDate());
  const hh = pad(targetDate.getHours());
  const mm = pad(targetDate.getMinutes());
  const ss = pad(targetDate.getSeconds());

  return `${YYYY}-${MM}-${DD}T${hh}:${mm}:${ss}${offsetFormatted}`;
}

export interface DateParseResult {
  valid: boolean;
  date?: Date;
  isoWithOffset: string; // ISO 8601 with +07:00 (WIB)
  isoUtc: string;        // ISO 8601 UTC (.toISOString())
  unixSeconds: number;   // Epoch seconds integer for Meta CAPI
  reason?: string;
}

/**
 * Deterministically parses date strings, numbers, or Date objects into WIB (UTC+07:00) by contract.
 * Dates without offset (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss) are anchored to WIB deterministically,
 * NEVER floating with machine/server runtime timezone.
 */
export function parseDeterministicDate(
  val: any,
  offsetHours: number = 7
): DateParseResult {
  if (val === undefined || val === null || val === '') {
    return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: 'Tanggal transaksi wajib diisi.' };
  }

  // 1. Date instance
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: 'Objek Date tidak valid.' };
    }
    const isoUtc = val.toISOString();
    const isoWithOffset = formatIsoWithOffset(val, offsetHours);
    const unixSeconds = Math.floor(val.getTime() / 1000);
    return { valid: true, date: val, isoWithOffset, isoUtc, unixSeconds };
  }

  // 2. Numeric input (Unix timestamp or Excel serial)
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val) || val <= 0) {
      return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: 'Angka tanggal/serial tidak valid.' };
    }
    // Unix timestamp in seconds (10 digits: ~1970 to 2286)
    if (val >= 1000000000 && val < 10000000000) {
      const d = new Date(val * 1000);
      return {
        valid: true,
        date: d,
        isoWithOffset: formatIsoWithOffset(d, offsetHours),
        isoUtc: d.toISOString(),
        unixSeconds: Math.floor(val),
      };
    }
    // Unix timestamp in ms (13 digits)
    if (val >= 1000000000000 && val < 10000000000000) {
      const d = new Date(val);
      return {
        valid: true,
        date: d,
        isoWithOffset: formatIsoWithOffset(d, offsetHours),
        isoUtc: d.toISOString(),
        unixSeconds: Math.floor(val / 1000),
      };
    }
    // Excel serial date number
    // Excel epoch base: Dec 30 1899 (25569 days to Jan 1 1970)
    const msSinceEpoch = Math.round((val - 25569) * 86400 * 1000);
    const utcDate = new Date(msSinceEpoch);
    if (!isNaN(utcDate.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const y = utcDate.getUTCFullYear();
      const m = pad(utcDate.getUTCMonth() + 1);
      const d = pad(utcDate.getUTCDate());
      const hh = pad(utcDate.getUTCHours());
      const mm = pad(utcDate.getUTCMinutes());
      const ss = pad(utcDate.getUTCSeconds());
      const offsetSign = offsetHours >= 0 ? '+' : '-';
      const offsetStr = `${offsetSign}${pad(Math.abs(offsetHours))}:00`;
      const anchoredStr = `${y}-${m}-${d}T${hh}:${mm}:${ss}${offsetStr}`;
      const anchoredDate = new Date(anchoredStr);
      if (!isNaN(anchoredDate.getTime())) {
        return {
          valid: true,
          date: anchoredDate,
          isoWithOffset: formatIsoWithOffset(anchoredDate, offsetHours),
          isoUtc: anchoredDate.toISOString(),
          unixSeconds: Math.floor(anchoredDate.getTime() / 1000),
        };
      }
    }
    return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: `Serial tanggal Excel '${val}' tidak valid.` };
  }

  // 3. String input
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) {
      return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: 'Tanggal transaksi wajib diisi.' };
    }

    // Unix timestamp numeric strings
    if (/^\d{10}$/.test(s)) {
      const sec = parseInt(s, 10);
      const d = new Date(sec * 1000);
      return {
        valid: true,
        date: d,
        isoWithOffset: formatIsoWithOffset(d, offsetHours),
        isoUtc: d.toISOString(),
        unixSeconds: sec,
      };
    }
    if (/^\d{13}$/.test(s)) {
      const ms = parseInt(s, 10);
      const d = new Date(ms);
      return {
        valid: true,
        date: d,
        isoWithOffset: formatIsoWithOffset(d, offsetHours),
        isoUtc: d.toISOString(),
        unixSeconds: Math.floor(ms / 1000),
      };
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const offsetSign = offsetHours >= 0 ? '+' : '-';
    const offsetStr = `${offsetSign}${pad(Math.abs(offsetHours))}:00`;

    // Case 3a: Date-only format: YYYY-MM-DD (e.g. 2026-10-10) -> Anchored to WIB midnight deterministically
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const targetStr = `${s}T00:00:00${offsetStr}`;
      const d = new Date(targetStr);
      if (!isNaN(d.getTime())) {
        return {
          valid: true,
          date: d,
          isoWithOffset: formatIsoWithOffset(d, offsetHours),
          isoUtc: d.toISOString(),
          unixSeconds: Math.floor(d.getTime() / 1000),
        };
      }
    }

    // Case 3b: Date-only Indonesian format: DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      const targetStr = `${year}-${month}-${day}T00:00:00${offsetStr}`;
      const d = new Date(targetStr);
      if (!isNaN(d.getTime())) {
        return {
          valid: true,
          date: d,
          isoWithOffset: formatIsoWithOffset(d, offsetHours),
          isoUtc: d.toISOString(),
          unixSeconds: Math.floor(d.getTime() / 1000),
        };
      }
    }

    // Case 3c: Date-time WITHOUT timezone offset: YYYY-MM-DD[ T]HH:mm(:ss)?
    // e.g. "2026-10-10 14:30:00" or "2026-10-10T14:30:00" -> Anchored to WIB deterministically
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(s)) {
      const normalizedIso = s.replace(' ', 'T');
      const withSeconds = normalizedIso.length === 16 ? `${normalizedIso}:00` : normalizedIso;
      const targetStr = `${withSeconds}${offsetStr}`;
      const d = new Date(targetStr);
      if (!isNaN(d.getTime())) {
        return {
          valid: true,
          date: d,
          isoWithOffset: formatIsoWithOffset(d, offsetHours),
          isoUtc: d.toISOString(),
          unixSeconds: Math.floor(d.getTime() / 1000),
        };
      }
    }

    // Case 3d: Date-time WITH explicit timezone offset (Z, +HH:mm, -HH:mm)
    if (/[zZ]|[+-]\d{2}(?::?\d{2})?$/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return {
          valid: true,
          date: d,
          isoWithOffset: formatIsoWithOffset(d, offsetHours),
          isoUtc: d.toISOString(),
          unixSeconds: Math.floor(d.getTime() / 1000),
        };
      }
    }

    return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: `Tanggal transaksi '${s}' tidak valid atau format tidak dikenali.` };
  }

  return { valid: false, isoWithOffset: '', isoUtc: '', unixSeconds: 0, reason: 'Format tanggal transaksi tidak didukung.' };
}

export interface NominalParseResult {
  valid: boolean;
  value: number;
  reason?: string;
}

/**
 * Parses amount string/number to clean positive number strictly.
 * Rejects empty values, non-numeric strings, letters, illegal symbols,
 * ambiguous decimals, and consecutive/misplaced separators.
 */
export function parseStrictNominal(val: any): NominalParseResult {
  if (val === undefined || val === null || val === '') {
    return { valid: false, value: 0, reason: 'Nominal transaksi (kolom value/Nominal) wajib diisi.' };
  }

  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) {
      return { valid: false, value: 0, reason: 'Nominal transaksi bukan angka valid.' };
    }
    if (val <= 0) {
      return { valid: false, value: 0, reason: `Nominal transaksi '${val}' tidak valid atau harus lebih dari 0.` };
    }
    return { valid: true, value: val };
  }

  const str = String(val).trim();
  if (!str) {
    return { valid: false, value: 0, reason: 'Nominal transaksi (kolom value/Nominal) wajib diisi.' };
  }

  // 1. Strip valid currency prefixes/suffixes
  const withoutCurrency = str.replace(/^(?:rp\.?|idr)\s*/i, '').replace(/\s*(?:idr|rp\.?)$/i, '').trim();

  // 2. Reject if any characters other than digits, whitespace, dot, comma, and optional leading minus remain
  if (!/^-?[0-9.,\s]+$/.test(withoutCurrency)) {
    return {
      valid: false,
      value: 0,
      reason: `Nominal transaksi '${str}' tidak valid atau mengandung karakter tidak dikenal.`,
    };
  }

  const cleaned = withoutCurrency.replace(/\s+/g, '');

  // 3. Reject consecutive dots or commas
  if (/\.{2,}|,{2,}|\.,|,\./.test(cleaned)) {
    return {
      valid: false,
      value: 0,
      reason: `Nominal transaksi '${str}' memiliki format pemisah tidak valid.`,
    };
  }

  // 4. Reject starting or ending with dot or comma (ignoring optional leading minus)
  if (/^[.,]|[.,]$/.test(cleaned.replace(/^-/, ''))) {
    return {
      valid: false,
      value: 0,
      reason: `Nominal transaksi '${str}' tidak boleh diawali atau diakhiri tanda baca.`,
    };
  }

  // 5. Separator analysis
  let num: number;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');

    if (lastComma > lastDot) {
      // Indonesian/European: 150.000,00
      const partsBeforeComma = cleaned.slice(0, lastComma).split('.');
      if (!/^\d{1,3}$/.test(partsBeforeComma[0])) {
        return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
      }
      for (let i = 1; i < partsBeforeComma.length; i++) {
        if (!/^\d{3}$/.test(partsBeforeComma[i])) {
          return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
        }
      }
      const decimalPart = cleaned.slice(lastComma + 1);
      if (!/^\d{1,2}$/.test(decimalPart)) {
        return { valid: false, value: 0, reason: `Format desimal '${str}' ambigu atau tidak valid.` };
      }
      num = Number(cleaned.slice(0, lastComma).replace(/\./g, '') + '.' + decimalPart);
    } else {
      // US format: 150,000.00
      const partsBeforeDot = cleaned.slice(0, lastDot).split(',');
      if (!/^\d{1,3}$/.test(partsBeforeDot[0])) {
        return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
      }
      for (let i = 1; i < partsBeforeDot.length; i++) {
        if (!/^\d{3}$/.test(partsBeforeDot[i])) {
          return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
        }
      }
      const decimalPart = cleaned.slice(lastDot + 1);
      if (!/^\d{1,2}$/.test(decimalPart)) {
        return { valid: false, value: 0, reason: `Format desimal '${str}' ambigu atau tidak valid.` };
      }
      num = Number(cleaned.slice(0, lastDot).replace(/,/g, '') + '.' + decimalPart);
    }
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      // Multiple dots: e.g. 1.500.000
      if (!/^\d{1,3}$/.test(parts[0])) {
        return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
      }
      for (let i = 1; i < parts.length; i++) {
        if (!/^\d{3}$/.test(parts[i])) {
          return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
        }
      }
      num = Number(cleaned.replace(/\./g, ''));
    } else {
      // Single dot: e.g. "150.000" vs "150.50"
      if (parts[1].length === 3) {
        num = Number(cleaned.replace(/\./g, ''));
      } else if (parts[1].length === 1 || parts[1].length === 2) {
        num = Number(cleaned);
      } else {
        return { valid: false, value: 0, reason: `Format desimal/ribuan '${str}' ambigu.` };
      }
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      // Multiple commas: e.g. 1,500,000
      if (!/^\d{1,3}$/.test(parts[0])) {
        return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
      }
      for (let i = 1; i < parts.length; i++) {
        if (!/^\d{3}$/.test(parts[i])) {
          return { valid: false, value: 0, reason: `Format ribuan '${str}' ambigu atau tidak valid.` };
        }
      }
      num = Number(cleaned.replace(/,/g, ''));
    } else {
      // Single comma: e.g. "150,000" vs "150,50"
      if (parts[1].length === 3) {
        num = Number(cleaned.replace(/,/g, ''));
      } else if (parts[1].length === 1 || parts[1].length === 2) {
        num = Number(cleaned.replace(',', '.'));
      } else {
        return { valid: false, value: 0, reason: `Format desimal/ribuan '${str}' ambigu.` };
      }
    }
  } else {
    // Pure integer string
    num = Number(cleaned);
  }

  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, value: 0, reason: `Nominal transaksi '${str}' bukan angka valid.` };
  }

  if (num <= 0) {
    return { valid: false, value: 0, reason: `Nominal transaksi '${str}' tidak valid atau harus lebih dari 0.` };
  }

  return { valid: true, value: num };
}

export interface MetaCsvExportSkipDetail {
  orderId: string;
  reason: 'invalid_date' | 'invalid_amount' | 'missing_date' | 'missing_amount' | string;
  message: string;
  rawDate?: any;
  rawValue?: any;
}

export interface MetaCsvExportSummary {
  totalRows: number;
  exportedRows: number;
  skippedRows: number;
  skippedDetails: MetaCsvExportSkipDetail[];
}

export interface GenerateOrdersMetaCsvResult {
  csv: string;
  summary: MetaCsvExportSummary;
}

/**
 * Generates CSV string and audit summary for orders aligned with Meta Offline Event Manager & CAPI standard.
 * Features:
 * - Transparent skip summary: returns totalRows, exportedRows, skippedRows, and detailed skip reasons.
 * - Strict integrity: Invalid date or invalid nominal is rejected (NEVER silently coerced to now or 0).
 * - Deterministic timezone: Anchored to WIB (+07:00).
 */
export function generateOrdersMetaCsv(
  orders: any[],
  tenantSlug?: string,
  currency: string = 'IDR'
): GenerateOrdersMetaCsvResult {
  const headers = [
    'event_name',
    'event_time',
    'value',
    'currency',
    'phone',
    'order_id',
    'customer_name',
    'customer_email',
    'city',
    'product_name',
    'quantity',
    'payment_method',
    'payment_status',
    'order_status',
    'notes',
  ];

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""').trim();
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

  const rows: string[] = [];
  const skippedDetails: MetaCsvExportSkipDetail[] = [];
  const totalRows = (orders || []).length;

  for (let idx = 0; idx < totalRows; idx++) {
    const ord = orders[idx];
    const orderId = String(ord.order_id || ord.invoice_number || ord.invoice_no || ord.order_number || ord.id || `row_${idx + 1}`).replace(/^#/, '');
    const eventName = 'Purchase';

    // 1. Strict & Deterministic Date Validation
    const rawDate = ord.paid_at || ord.created_at || ord.createdDate || ord.date;
    const parsedDate = parseDeterministicDate(rawDate, 7);
    if (!parsedDate.valid) {
      const skipReason = !rawDate ? 'missing_date' : 'invalid_date';
      skippedDetails.push({
        orderId,
        reason: skipReason,
        message: parsedDate.reason || `Tanggal transaksi '${rawDate}' tidak valid.`,
        rawDate,
      });
      console.warn(`[Meta CSV Export] Order ${orderId} ditolak (${skipReason}): ${parsedDate.reason || 'tanggal tidak valid'}`);
      continue;
    }
    const eventTime = parsedDate.isoWithOffset;

    // 2. Strict Nominal Validation
    const rawValue = ord.total_amount ?? ord.gross_amount ?? ord.amount;
    const parsedNominal = parseStrictNominal(rawValue);
    if (!parsedNominal.valid) {
      const skipReason = (rawValue === undefined || rawValue === null || rawValue === '') ? 'missing_amount' : 'invalid_amount';
      skippedDetails.push({
        orderId,
        reason: skipReason,
        message: parsedNominal.reason || `Nominal transaksi '${rawValue}' tidak valid.`,
        rawValue,
      });
      console.warn(`[Meta CSV Export] Order ${orderId} ditolak (${skipReason}): ${parsedNominal.reason || 'nominal tidak valid'}`);
      continue;
    }
    const numValue = parsedNominal.value;

    // currency: ISO currency code
    const curr = String(ord.currency || currency || 'IDR').toUpperCase();

    // phone: E.164 normalized digits
    const rawPhone = ord.customer_phone || ord.phone || ord.whatsapp || '';
    let phoneDigits = String(rawPhone).replace(/\D/g, '');
    if (phoneDigits.startsWith('08')) {
      phoneDigits = '628' + phoneDigits.slice(2);
    } else if (phoneDigits.startsWith('0')) {
      phoneDigits = '62' + phoneDigits.slice(1);
    } else if (phoneDigits.startsWith('8')) {
      phoneDigits = '62' + phoneDigits;
    }

    // Operational fields
    const custName = ord.customer_name || ord.name || 'Pelanggan';
    const custEmail = ord.customer_email || ord.email || '';
    const city = ord.shipping_address?.city || ord.city || '';
    const productName = ord.items_summary || ord.product_title || ord.product_name || 'Produk Toko';
    const qty = ord.quantity || 1;
    const paymentMethod = ord.payment_method || 'Online';
    const paymentStatus = ord.payment_status || ord.status || 'PAID';
    const orderStatus = ord.order_status || 'COMPLETED';
    const notes = ord.notes || ord.catatan || '';

    rows.push([
      escapeCsv(eventName),
      escapeCsv(eventTime),
      escapeCsv(numValue),
      escapeCsv(curr),
      escapeCsv(phoneDigits),
      escapeCsv(orderId),
      escapeCsv(custName),
      escapeCsv(custEmail),
      escapeCsv(city),
      escapeCsv(productName),
      escapeCsv(qty),
      escapeCsv(paymentMethod),
      escapeCsv(paymentStatus),
      escapeCsv(orderStatus),
      escapeCsv(notes),
    ].join(','));
  }

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const summary: MetaCsvExportSummary = {
    totalRows,
    exportedRows: rows.length,
    skippedRows: skippedDetails.length,
    skippedDetails,
  };

  return { csv, summary };
}

/**
 * Backward-compatible helper that generates Meta CSV as raw string.
 */
export function generateOrdersMetaCsvString(
  orders: any[],
  tenantSlug?: string,
  currency: string = 'IDR'
): string {
  return generateOrdersMetaCsv(orders, tenantSlug, currency).csv;
}

/**
 * Export orders to Meta Offline Conversions & CAPI compliant CSV format.
 * Triggers client-side CSV download in browser if valid rows exist.
 * Returns MetaCsvExportSummary detailing total, exported, and skipped rows for UI/logs.
 */
export function exportOrdersToMetaCsv(
  orders: any[],
  tenantSlug?: string,
  currency: string = 'IDR'
): MetaCsvExportSummary {
  if (!orders || orders.length === 0) {
    if (typeof alert !== 'undefined') {
      alert('Tidak ada pesanan untuk diekspor.');
    }
    return {
      totalRows: 0,
      exportedRows: 0,
      skippedRows: 0,
      skippedDetails: [],
    };
  }

  const { csv, summary } = generateOrdersMetaCsv(orders, tenantSlug, currency);

  if (summary.skippedRows > 0) {
    console.warn(
      `[Meta CSV Export] ${summary.skippedRows} dari ${summary.totalRows} pesanan dilewati karena data tidak valid:`,
      summary.skippedDetails
    );
  }

  if (summary.exportedRows > 0 && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `Meta_Offline_Events_${tenantSlug || 'store'}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return summary;
}
