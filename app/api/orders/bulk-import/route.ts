import { NextRequest, NextResponse } from 'next/server';
import { OrderBulkImportService } from '@/lib/services/order-bulk-import.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/bulk-import
 * Memproses import pesanan massal (CSV / XLSX) untuk tenant toko.
 * 
 * STRICT ARCHITECTURE GUARDRAILS:
 * 1. Zero Hardcoding: Mengambil tenant secara dinamis dari request/cookies.
 * 2. Database SSOT: Batch insert langsung ke tabel `orders` dan `order_items`.
 * 3. Meta Conversions API: Batch dispatch 'Purchase' dengan action_source 'physical_store'.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let tenantSlug = '';
    let syncMetaCapi = true;
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

      const rawSyncCapi = formData.get('syncMetaCapi') ?? formData.get('sync_meta_capi');
      if (rawSyncCapi !== null) {
        syncMetaCapi = String(rawSyncCapi).toLowerCase() !== 'false';
      }

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

      if (body.syncMetaCapi !== undefined) syncMetaCapi = Boolean(body.syncMetaCapi);
      if (body.sync_meta_capi !== undefined) syncMetaCapi = Boolean(body.sync_meta_capi);

      payloadData = body.orders || body.rows || body.data || [];
    }

    // Resolusi fallback tenantSlug dari cookies jika tidak disertakan di body
    if (!tenantSlug) {
      tenantSlug = String(
        req.cookies.get('bt_tenant')?.value ||
        req.cookies.get('merchant_store')?.value ||
        req.cookies.get('merchant_session')?.value ||
        ''
      ).replace(/^["']|["']$/g, '').trim().toLowerCase();
    }

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenantSlug wajib disertakan.' },
        { status: 400 }
      );
    }

    const result = await OrderBulkImportService.processBulkImport(payloadData, {
      tenantSlug,
      syncMetaCapi,
    });

    if (!result.success) {
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
      message: `Berhasil mengimpor ${result.summary.total_success} pesanan senilai ${result.summary.formatted_revenue}.`,
      summary: result.summary,
      errors: result.errors,
      imported_order_ids: result.imported_order_ids,
    });
  } catch (err: any) {
    console.error('[BulkImport API] Error processing bulk import:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Terjadi kesalahan internal saat memproses import.' },
      { status: 500 }
    );
  }
}
