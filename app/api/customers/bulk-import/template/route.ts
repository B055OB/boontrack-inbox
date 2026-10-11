import { NextRequest, NextResponse } from 'next/server';
import { CustomerBulkImportService } from '@/lib/services/customer-bulk-import.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customers/bulk-import/template
 * Men-download berkas template standar Excel (.xlsx) atau CSV untuk import customer list / Meta Custom Audience.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'xlsx').toLowerCase();

    if (format === 'csv') {
      const csvContent = CustomerBulkImportService.generateTemplateCsv();
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="template-customer-audience-meta.csv"',
        },
      });
    }

    const excelBuffer = CustomerBulkImportService.generateTemplateExcel();
    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template-customer-audience-meta.xlsx"',
      },
    });
  } catch (err: any) {
    console.error('[Customer BulkImport Template API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat template customer audience.' },
      { status: 500 }
    );
  }
}
