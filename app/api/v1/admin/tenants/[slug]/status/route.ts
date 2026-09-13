import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
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

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: nextStatus,
        is_active: nextActive,
        metadata: nextMetadata,
      })
      .eq('slug', slug);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

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
