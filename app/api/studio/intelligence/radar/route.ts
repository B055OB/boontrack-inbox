/**
 * @file app/api/studio/intelligence/radar/route.ts
 * @description Studio Intelligence Radar Gateway API
 * Compliant with § 54 Studio Intelligence Foundation.
 * Provides endpoints for querying normalized fresh insights and queuing intelligence jobs.
 */

import { NextResponse } from 'next/server';
import {
  assertStudioIntelligenceEntitled,
  checkStudioIntelligenceEntitled,
} from '@/lib/entitlements/studio-guard';
import {
  getFreshHookPatternInsights,
  createIntelligenceJob,
} from '@/lib/studio/intelligence/repository';
import { StudioCapability } from '@/lib/types/tenant-runtime';

export const runtime = 'nodejs';

/**
 * GET /api/studio/intelligence/radar
 * Query verified fresh hook patterns by category
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'general';
    const cluster = searchParams.get('cluster') || undefined;
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 10, 50));
    const tenantId = searchParams.get('tenant_id') || req.headers.get('x-tenant-id');

    if (tenantId) {
      const check = await checkStudioIntelligenceEntitled(tenantId, StudioCapability.VIRAL_TRENDS_RADAR);
      if (!check.entitled) {
        return NextResponse.json(
          {
            success: false,
            error: 'FEATURE_NOT_ENTITLED',
            message: check.reason || 'Tenant tidak memiliki akses Viral Trends Radar.',
          },
          { status: 403 }
        );
      }
    }

    const insights = await getFreshHookPatternInsights(category, limit, cluster);

    return NextResponse.json({
      success: true,
      category,
      cluster: cluster || null,
      count: insights.length,
      insights,
    });
  } catch (err: any) {
    console.error('[Studio Intelligence Radar GET] Error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Gagal mengambil data intelligence radar.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/studio/intelligence/radar
 * Dispatch intelligence background job
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenant_id, workspace_id, capability = StudioCapability.VIRAL_TRENDS_RADAR, triggered_by } = body;

    if (!tenant_id || !workspace_id) {
      return NextResponse.json(
        { success: false, message: 'tenant_id dan workspace_id wajib diisi.' },
        { status: 400 }
      );
    }

    // Server-side entitlement assertion
    await assertStudioIntelligenceEntitled(tenant_id, capability);

    const job = await createIntelligenceJob({
      tenant_id,
      workspace_id,
      capability,
      triggered_by,
    });

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (err: any) {
    console.error('[Studio Intelligence Radar POST] Error:', err);

    if (err.code === 'FEATURE_NOT_ENTITLED' || err.statusCode === 403) {
      return NextResponse.json(
        { success: false, error: 'FEATURE_NOT_ENTITLED', message: err.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: false, message: err.message || 'Gagal memproses intelligence job.' },
      { status: err.statusCode || 500 }
    );
  }
}
