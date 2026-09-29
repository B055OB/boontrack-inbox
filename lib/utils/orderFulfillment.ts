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
        <div>Alamat: ${order.shipping_address || '-'}</div>
      </div>
      <div class="info-col">
        <h4>Detail Transaksi:</h4>
        <div>Tanggal Pesanan: ${new Date(order.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        <div>Metode Pembayaran: ${order.payment_method || 'QRIS Dinamis'}</div>
        <div>Ekspedisi: ${order.shipping_courier || 'Kurir Reguler'}</div>
        ${order.waybill ? `<div>No. Resi: <strong>${order.waybill}</strong></div>` : ''}
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
          <td class="text-right">1</td>
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
