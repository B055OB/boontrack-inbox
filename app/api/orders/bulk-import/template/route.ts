import { NextRequest, NextResponse } from 'next/server';
import { OrderBulkImportService } from '@/lib/services/order-bulk-import.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/bulk-import/template
 * Men-download berkas template standar Excel (.xlsx) atau CSV untuk import pesanan massal.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'xlsx').toLowerCase();

    if (format === 'csv') {
      const csvContent = OrderBulkImportService.generateTemplateCsv();
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="template-import-pesanan-boontrack.csv"',
        },
      });
    }

    const excelBuffer = OrderBulkImportService.generateTemplateExcel();
    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template-import-pesanan-boontrack.xlsx"',
      },
    });
  } catch (err: any) {
    console.error('[BulkImport Template API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat template pesanan.' },
      { status: 500 }
    );
  }
}
