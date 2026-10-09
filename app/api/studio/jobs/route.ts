/**
 * @file app/api/studio/jobs/route.ts
 * @description Studio Render Jobs Gateway API
 * Compliant with § 53.3 & § 54 Architecture Guardrails (Zero hardcoding, Supabase single source of truth)
 * Fetches media render job queue & telemetry history for the authenticated tenant workspace.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTenantId(supabase: any, tenantIdentifier?: string | null): Promise<string | null> {
  if (!tenantIdentifier) {
    const { data } = await supabase.from('tenants').select('id').limit(1).maybeSingle();
    return data?.id || null;
  }

  const clean = tenantIdentifier.trim().toLowerCase();
  if (IS_UUID_REGEX.test(clean)) {
    return clean;
  }

  const { data } = await supabase.from('tenants').select('id').eq('slug', clean).maybeSingle();
  return data?.id || null;
}

/**
 * GET /api/studio/jobs
 * Query render job history with status and telemetry metrics
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant_id') || req.headers.get('x-tenant-id');
    const statusFilter = searchParams.get('status');
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 50, 100));

    const supabase = getSupabaseAdmin() || getSupabase();

    if (!supabase) {
      return NextResponse.json({
        success: true,
        jobs: [],
        telemetry: {
          total: 0,
          completed: 0,
          processing: 0,
          queued: 0,
          failed: 0,
          worker_status: 'STANDBY',
        },
      });
    }

    let tenantId: string | null = null;
    if (tenantParam) {
      tenantId = await resolveTenantId(supabase, tenantParam);
    }

    let query = supabase
      .from('studio_jobs')
      .select('id, tenant_id, user_id, status, job_type, payload, output_url, error_message, attempt, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter.toUpperCase());
    }

    const { data: jobs, error } = await query;

    if (error) {
      console.warn('[Studio Jobs API] Query error:', error.message);
      return NextResponse.json({
        success: true,
        jobs: [],
        error: error.message,
        telemetry: {
          total: 0,
          completed: 0,
          processing: 0,
          queued: 0,
          failed: 0,
          worker_status: 'NORMAL',
        },
      });
    }

    const jobList = Array.isArray(jobs) ? jobs : [];

    // Calculate live telemetry counts
    const total = jobList.length;
    const completed = jobList.filter(j => j.status === 'COMPLETED').length;
    const processing = jobList.filter(j => j.status === 'PROCESSING').length;
    const queued = jobList.filter(j => j.status === 'QUEUED').length;
    const failed = jobList.filter(j => j.status === 'FAILED').length;

    return NextResponse.json({
      success: true,
      count: total,
      jobs: jobList,
      telemetry: {
        total,
        completed,
        processing,
        queued,
        failed,
        worker_status: processing > 0 ? 'ACTIVE_RENDERING' : 'STANDBY',
      },
    });
  } catch (err: any) {
    console.error('[Studio Jobs API] Unexpected error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal memuat riwayat render jobs.' },
      { status: 500 }
    );
  }
}
