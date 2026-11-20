import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { updateTenantWithOccCas } from '@/lib/tenants/atomic-tenant-metadata-writer';
import { verifySuperAdminAccess } from '@/lib/security/admin-auth';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await verifySuperAdminAccess(req, { allowMachine: false });
    if (!auth.authorized) {
      return auth.response;
    }

    const { slug } = await params;
    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant slug is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { action, is_active: requestedActive } = body;

    if (!action || !['TOGGLE_STATUS', 'ARCHIVE'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Supported: TOGGLE_STATUS, ARCHIVE' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable' },
        { status: 500 }
      );
    }

    // 1. Fetch current tenant state
    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, status, is_active, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { success: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: `Tenant with slug "${slug}" not found` },
        { status: 404 }
      );
    }

    // 2. Perform requested mutation
    let nextStatus: string;
    let nextActive: boolean;
    let nextMetadata = { ...(tenant.metadata || {}) };

    if (action === 'ARCHIVE') {
      nextStatus = 'ARCHIVED';
      nextActive = false;
      nextMetadata.is_archived = true;
      nextMetadata.archived_at = new Date().toISOString();
    } else {
      // action === 'TOGGLE_STATUS'
      if (typeof requestedActive === 'boolean') {
        nextActive = requestedActive;
        nextStatus = requestedActive ? 'ACTIVE' : 'SUSPENDED';
      } else {
        // Toggle based on current state
        const isCurrentlyActive = tenant.is_active !== false && tenant.status !== 'SUSPENDED';
        nextActive = !isCurrentlyActive;
        nextStatus = nextActive ? 'ACTIVE' : 'SUSPENDED';
      }
      // If un-archiving or toggling back to active
      if (nextActive) {
        nextMetadata.is_archived = false;
      }
    }

    const occResult = await updateTenantWithOccCas(
      supabaseAdmin,
      slug,
      (freshTenant) => {
        const currentMeta = freshTenant.metadata || {};
        return {
          status: nextStatus,
          is_active: nextActive,
          metadata: {
            ...currentMeta,
            ...nextMetadata,
          },
        };
      }
    );

    if (!occResult.success) {
      return NextResponse.json(
        { success: false, error: occResult.error, message: occResult.message },
        { status: occResult.error === 'OCC_CONFLICT' ? 409 : 500 }
      );
    }

    await recordTenantConfigAudit({
      tenantSlug: slug,
      actorId: auth.userId,
      actorRole: auth.role,
      authMethod: auth.authMethod,
      action: 'ADMIN_PATCH_TENANT_STATUS',
      resourceType: 'tenants',
      changedKeys: ['status', 'is_active'],
      diffSummary: { slug },
      req,
    });

    return NextResponse.json({
      success: true,
      tenant_slug: slug,
      status: nextStatus,
      is_active: nextActive,
      action_performed: action,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Admin Tenant Status] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
