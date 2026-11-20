import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';
import {
  upsertCanonicalProduct,
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';
import { safeJsonStringify } from '@/lib/product-catalog';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvToProductItems(csvText: string): any[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, '').trim());
  const items: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const item: Record<string, any> = {};
    headers.forEach((header, colIdx) => {
      const val = row[colIdx] !== undefined ? row[colIdx] : '';
      if (header === 'price' || header === 'harga') {
        const num = Number(val);
        item.price = !isNaN(num) ? num : val;
      } else if (header === 'promo_price' || header === 'harga_promo') {
        const num = Number(val);
        item.promo_price = !isNaN(num) ? num : val;
      } else if (header === 'stock' || header === 'stok') {
        const num = Number(val);
        item.stock = !isNaN(num) ? num : val;
      } else if (header === 'is_active' || header === 'aktif') {
        item.is_active = val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'ya';
      } else if (header === 'requires_shipping') {
        item.requires_shipping = val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'ya';
      } else if (header === 'name' || header === 'nama' || header === 'title' || header === 'judul') {
        item.name = val;
        item.title = val;
      } else {
        item[header] = val;
      }
    });

    if (item.name || item.title || item.price !== undefined) {
      items.push(item);
    }
  }

  return items;
}

/**
 * POST /api/v1/products/bulk-upload
 * Canonical Server-Authoritative Bulk Upload Route (Blocker 5 Remediation)
 *
 * Mandate:
 * 1. Sole Authoritative Writer: Routes every product item through upsertCanonicalProduct().
 * 2. Parses structured JSON arrays or CSV files on Shop server.
 * 3. Fails closed with HTTP 415/400 on raw unsupported binary formats like .xlsx.
 * 4. Enforces merchant RBAC + tenant ownership + Section 10 custom_html entitlement gates per row.
 * 5. Returns deterministic per-row success/failure summary with audit logging.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSlug = searchParams.get('tenant_slug') || searchParams.get('tenant') || '';
    if (!rawSlug) {
      return NextResponse.json(
        { status: 'error', detail: 'Parameter tenant_slug wajib disertakan.' },
        { status: 400 }
      );
    }
    const slug = normalizeTenantSlug(rawSlug);

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      actorId = authResult.payload.userId || authResult.payload.name || 'merchant';
      actorRole = authResult.payload.role || 'MERCHANT';
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { status: 'error', detail: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: canonicalTenant, error: canonicalErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata, category, tier')
      .eq('slug', slug)
      .maybeSingle();

    if (canonicalErr || !canonicalTenant) {
      return NextResponse.json(
        { status: 'error', detail: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: canonicalTenant.id, slug: canonicalTenant.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    // ── PARSE & VALIDATE BULK ITEMS (BLOCKER 5) ──
    const contentType = req.headers.get('content-type') || '';
    let itemsToProcess: any[] = [];

    if (contentType.includes('application/json')) {
      const jsonBody = await req.json().catch(() => null);
      if (!jsonBody) {
        return NextResponse.json(
          { status: 'error', code: 'INVALID_JSON_BODY', detail: 'Invalid JSON request body' },
          { status: 400 }
        );
      }
      itemsToProcess = Array.isArray(jsonBody)
        ? jsonBody
        : (Array.isArray(jsonBody.products)
            ? jsonBody.products
            : (Array.isArray(jsonBody.items) ? jsonBody.items : []));
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { status: 'error', detail: 'File upload (.csv) wajib disertakan.' },
          { status: 400 }
        );
      }

      const fileName = (file as any).name ? String((file as any).name).toLowerCase() : '';
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel')) {
        return NextResponse.json(
          {
            status: 'error',
            code: 'UNSUPPORTED_MEDIA_TYPE',
            detail: 'Format file .xlsx/.xls tidak didukung. Harap konversi ke format CSV (.csv) atau gunakan payload JSON array.',
          },
          { status: 415 }
        );
      }

      const csvText = await file.text();
      itemsToProcess = parseCsvToProductItems(csvText);
    } else {
      return NextResponse.json(
        {
          status: 'error',
          code: 'UNSUPPORTED_CONTENT_TYPE',
          detail: 'Content-Type tidak didukung. Gunakan multipart/form-data (.csv) atau application/json.',
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(itemsToProcess) || itemsToProcess.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'NO_PRODUCTS_TO_IMPORT',
          detail: 'Tidak ada item produk valid yang ditemukan untuk diimpor.',
        },
        { status: 400 }
      );
    }

    const actor: CanonicalWriterActor = {
      actorId,
      actorRole,
      isInternalMachine: isInternalAuth,
    };

    // ── PERSIST EACH ITEM AUTHORITATIVELY VIA CANONICAL WRITER (BLOCKER 5) ──
    const results: Array<{
      index: number;
      success: boolean;
      productId?: string;
      slug?: string;
      statusCode: number;
      error?: string;
    }> = [];

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < itemsToProcess.length; i++) {
      const rawItem = itemsToProcess[i];
      try {
        const writeRes = await upsertCanonicalProduct({
          tenant: canonicalTenant as CanonicalTenantContext,
          rawInput: rawItem,
          actor,
          req,
          customSupabaseAdmin: supabaseAdmin,
          mode: 'PUT',
        });

        if (writeRes.success) {
          successCount++;
          results.push({
            index: i,
            success: true,
            productId: writeRes.product?.id,
            slug: writeRes.product?.slug,
            statusCode: writeRes.statusCode,
          });

          // Mirror sync forward to Core backend
          try {
            await fetch(
              getBackendApiUrl(
                `/api/v1/tenants/${encodeURIComponent(slug)}/products/${encodeURIComponent(writeRes.product?.id)}`
              ),
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Tenant-ID': slug,
                },
                body: safeJsonStringify(writeRes.product),
                cache: 'no-store',
              }
            );
          } catch (mirrorErr) {
            console.warn('[Bulk Upload] Core mirror sync note for index', i, mirrorErr);
          }
        } else {
          failureCount++;
          results.push({
            index: i,
            success: false,
            statusCode: writeRes.statusCode,
            error: writeRes.error || writeRes.message || 'Gagal menyimpan produk',
          });
        }
      } catch (rowErr: any) {
        failureCount++;
        results.push({
          index: i,
          success: false,
          statusCode: 500,
          error: rowErr?.message || 'Internal error processing row',
        });
      }
    }

    // ── AUDIT LOGGING ──
    await recordTenantConfigAudit({
      tenantId: canonicalTenant.id,
      tenantSlug: canonicalTenant.slug,
      actorId,
      actorRole,
      authMethod: isInternalAuth ? 'internal_machine' : 'merchant_session',
      action: 'PRODUCT_BULK_UPLOAD',
      resourceType: 'products',
      resourceId: 'bulk',
      status: failureCount === 0 ? 'SUCCESS' : 'FAILED',
      changedKeys: ['products'],
      diffSummary: {
        total: itemsToProcess.length,
        success_count: successCount,
        failure_count: failureCount,
      },
      req,
    });

    return NextResponse.json({
      status: failureCount === 0 ? 'success' : (successCount > 0 ? 'partial_success' : 'error'),
      total: itemsToProcess.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Bulk Upload Canonical Route Error]:', err);
    return NextResponse.json(
      { status: 'error', detail: msg },
      { status: 500 }
    );
  }
}
