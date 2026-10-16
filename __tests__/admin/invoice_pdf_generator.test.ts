import {
  generateDefaultInvoiceNumber,
  generateInvoicePdfBytes,
  InvoicePdfData,
} from '@/lib/utils/invoicePdfGenerator';

describe('BoonTrack Official Invoice PDF Generator', () => {
  it('generates a reference number matching INV/BT/YYYY/MM/XXXX format', () => {
    const invNo = generateDefaultInvoiceNumber();
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

    expect(invNo).toMatch(new RegExp(`^INV/BT/${currentYear}/${currentMonth}/\\d{4}$`));
  });

  it('generates standard PDF-1.4 binary bytes with valid markers', () => {
    const payload: InvoicePdfData = {
      client_name: 'Klinik Tumbuh Kembang Anak',
      client_slug: 'tumbuh-kembang-anak',
      amount: 15000000,
      payment_method: 'MANUAL_TRANSFER',
      invoice_no: 'INV/BT/2026/10/7788',
      notes: 'Kontrak custom telemedicine B2B',
      category: 'B2B_CUSTOM_APP',
      status: 'PAID',
    };

    const pdfBytes = generateInvoicePdfBytes(payload);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    const decoder = new TextDecoder();
    const content = decoder.decode(pdfBytes);

    // Verify PDF format invariants
    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content.includes('%%EOF')).toBe(true);
    expect(content.includes('PT BOONTRACK INOVASI DIGITAL')).toBe(true);
    expect(content.includes('Klinik Tumbuh Kembang Anak')).toBe(true);
    expect(content.includes('INV/BT/2026/10/7788')).toBe(true);
    expect(content.includes('L U N A S / PAID')).toBe(true);
    expect(content.includes('8470192344')).toBe(true); // BCA Account
    expect(content.includes('Bank Central Asia \\(BCA\\)')).toBe(true);
    expect(content.includes('15.000.000')).toBe(true);
  });

  it('handles CASH payment method and fallback notes properly', () => {
    const payload: InvoicePdfData = {
      client_name: 'Warung Bu Joko',
      client_slug: 'warung-bujoko',
      amount: 500000,
      payment_method: 'CASH',
      invoice_no: 'INV/BT/2026/10/1234',
      category: 'SAAS_SUBSCRIPTION',
    };

    const pdfBytes = generateInvoicePdfBytes(payload);
    const decoder = new TextDecoder();
    const content = decoder.decode(pdfBytes);

    expect(content.includes('Tunai / Direct Cash')).toBe(true);
    expect(content.includes('Langganan Toko \\(SaaS\\)')).toBe(true);
    expect(content.includes('500.000')).toBe(true);
  });
});
