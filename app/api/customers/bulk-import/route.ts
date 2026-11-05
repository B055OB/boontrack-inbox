import { NextRequest, NextResponse } from 'next/server';
import { CustomerBulkImportService } from '@/lib/services/customer-bulk-import.service';
import { resolveVerifiedTenantContext } from '@/lib/auth/tenant-context';

export const dynamic = 'force-dynamic';

/**
 * POST /api/customers/bulk-import
 * Memproses import daftar customer / audience list massal (CSV / XLSX) untuk database CRM tenant.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let tenantSlug = '';
    let payloadData: any = null;

    // Skenario A: Multipart Form-Data (Upload Berkas langsung via FormData)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      tenantSlug = String(
        formData.get('tenantSlug') ||
        formData.get('tenant_slug') ||
        formData.get('slug') ||
        ''
      ).trim();

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'Berkas file (.xlsx / .csv) wajib diunggah.' },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      payloadData = Buffer.from(arrayBuffer);
    } else {
      // Skenario B: JSON Request (misal hasil parsing pratinjau di frontend)
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid JSON request body.' },
          { status: 400 }
        );
      }

      tenantSlug = String(
        body.tenantSlug ||
        body.tenant_slug ||
        body.slug ||
        ''
      ).trim();

      payloadData = body.customers || body.rows || body.data || [];
    }

    // Authoritative Server-Side Tenant Context Resolution (P0 Security)
    const authResult = await resolveVerifiedTenantContext(req, tenantSlug || undefined);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, code: authResult.code },
        { status: authResult.status }
      );
    }
    tenantSlug = authResult.context.tenantSlug;

    const result = await CustomerBulkImportService.processBulkImport(payloadData, {
      tenantSlug,
    });

    if (!result.success && result.summary.total_success === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Import gagal. Tidak ada baris yang valid untuk diproses.',
          summary: result.summary,
          errors: result.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil mengimpor ${result.summary.total_success} kontak pelanggan ke CRM.`,
      summary: result.summary,
      errors: result.errors,
      imported_contact_ids: result.imported_contact_ids,
    });
  } catch (err: any) {
    console.error('[Customer BulkImport API] Error processing bulk import:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Terjadi kesalahan internal saat memproses import customer.' },
      { status: 500 }
    );
  }
}
