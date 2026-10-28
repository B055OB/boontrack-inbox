/**
 * @file app/api/studio/jobs/route.ts
 * @description Studio Render Jobs Gateway API
 * Compliant with § 53.3 & § 54 Architecture Guardrails (Zero hardcoding, Supabase single source of truth)
 * Fetches media render job queue & telemetry history for the authenticated tenant workspace.
 * Secured with strict Supabase Auth Session validation (Tenant Isolation) & Worker Service Authentication.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { extractMerchantSessionToken, verifyMerchantSessionToken } from '@/lib/auth/merchant-session';

export const runtime = 'nodejs';

const IS_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts Bearer token or Supabase Auth cookie from incoming request.
 */
async function extractTokenFromRequest(req: Request): Promise<string> {
  // 1. Authorization header (Bearer)
  const authHeader = req.headers.get('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  } else if (authHeader && !authHeader.toLowerCase().startsWith('basic ')) {
    return authHeader;
  }

  // 2. Direct x-access-token / x-auth-token headers
  const customHeader = req.headers.get('x-access-token') || req.headers.get('x-auth-token');
  if (customHeader?.trim()) return customHeader.trim();

  // 3. Inspect raw cookie header on Request
  const cookieHeader = req.headers.get('cookie') || '';
  if (cookieHeader) {
    const cookiesMap: Record<string, string> = {};
    cookieHeader.split(';').forEach((part) => {
      const [key, ...vals] = part.trim().split('=');
      if (key) cookiesMap[key] = vals.join('=');
    });

    if (cookiesMap['sb-access-token']) return cookiesMap['sb-access-token'].trim();
    if (cookiesMap['access_token']) return cookiesMap['access_token'].trim();
    if (cookiesMap['supabase-auth-token']) return cookiesMap['supabase-auth-token'].trim();

    for (const [name, val] of Object.entries(cookiesMap)) {
      if (name.startsWith('sb-') && name.endsWith('-auth-token')) {
        try {
          const raw = decodeURIComponent(val);
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) {
            return parsed[0].trim();
          }
          if (parsed?.access_token && typeof parsed.access_token === 'string') {
            return parsed.access_token.trim();
          }
        } catch {
          if (val) return val.trim();
        }
      }
    }
  }

  // 4. NextRequest.cookies (if incoming request is NextRequest)
  if ('cookies' in req && typeof (req as any).cookies?.getAll === 'function') {
    try {
      const directCookie =
        (req as any).cookies.get('sb-access-token')?.value ||
        (req as any).cookies.get('access_token')?.value ||
        (req as any).cookies.get('supabase-auth-token')?.value;
      if (directCookie) return directCookie.trim();

      const allCookies = (req as any).cookies.getAll();
      for (const c of allCookies) {
        if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) {
          try {
            const raw = decodeURIComponent(c.value);
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) {
              return parsed[0].trim();
            }
            if (parsed?.access_token && typeof parsed.access_token === 'string') {
              return parsed.access_token.trim();
            }
          } catch {
            if (c.value) return c.value.trim();
          }
        }
      }
    } catch {}
  }

  // 5. next/headers cookies() fallback (safeguarded for SSR & unit tests)
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token =
      cookieStore.get('sb-access-token')?.value ||
      cookieStore.get('access_token')?.value ||
      cookieStore.get('supabase-auth-token')?.value;
    if (token) return token.trim();

    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) {
        try {
          const raw = decodeURIComponent(c.value);
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) {
            return parsed[0].trim();
          }
          if (parsed?.access_token && typeof parsed.access_token === 'string') {
            return parsed.access_token.trim();
          }
        } catch {
          if (c.value) return c.value.trim();
        }
      }
    }
  } catch {}

  return '';
}

/**
 * GET /api/studio/jobs
 * Query render job history with status and telemetry metrics.
 * Strictly enforces Supabase Auth session & tenant isolation:
 * - 401 Unauthorized if unauthenticated
 * - 403 Forbidden if tenant not found or user is not owner/member of tenant
 * - Query ALWAYS filtered with .eq('tenant_id', verifiedTenantId)
 */
export async function GET(req: Request) {
  try {
    let supabase: any;
    try {
      supabase = getSupabaseAdmin() || getSupabase();
    } catch {
      supabase = getSupabase();
    }

    if (!supabase) {
      return NextResponse.json(
        { success: false, message: 'Database client tidak tersedia.' },
        { status: 500 }
      );
    }

    // 1. Authenticate session: check cryptographically signed bt_merchant_token FIRST, then Supabase Auth
    let merchantAuthPayload: any = null;
    let candidateMerchantToken = '';
    try {
      candidateMerchantToken = extractMerchantSessionToken(req as any);
    } catch {
      const rawCookie = req.headers.get('cookie') || '';
      const match = rawCookie.match(/(?:^|;\s*)bt_merchant_token=([^;]+)/);
      if (match && match[1]) {
        candidateMerchantToken = decodeURIComponent(match[1].trim());
      }
    }
    if (candidateMerchantToken) {
      const verified = verifyMerchantSessionToken(candidateMerchantToken);
      if (verified.valid && verified.payload) {
        merchantAuthPayload = verified.payload;
      }
    }

    let user: any = null;
    let userId = '';
    let userEmail = '';

    if (!merchantAuthPayload) {
      const token = await extractTokenFromRequest(req);
      if (!token) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Sesi autentikasi diperlukan.' },
          { status: 401 }
        );
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData?.user) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Sesi autentikasi tidak valid atau telah kedaluwarsa.' },
          { status: 401 }
        );
      }

      user = authData.user;
      userId = user.id;
      userEmail = (user.email || '').trim().toLowerCase();
    }

    // 2. Resolve target tenant
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant_id') || searchParams.get('tenant') || req.headers.get('x-tenant-id');
    const statusFilter = searchParams.get('status');
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 50, 100));

    let resolvedTenant: any = null;

    if (merchantAuthPayload) {
      // 2a. Resolve & enforce strict tenant binding for verified merchant token
      const targetParam = (tenantParam || merchantAuthPayload.tenantSlug).trim().toLowerCase();
      const isUuid = IS_UUID_REGEX.test(targetParam);
      let tQuery = supabase.from('tenants').select('id, slug, metadata');
      if (isUuid) {
        tQuery = tQuery.eq('id', targetParam);
      } else {
        tQuery = tQuery.eq('slug', targetParam);
      }
      const { data: tData, error: tErr } = await tQuery.maybeSingle();
      if (tErr || !tData) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Tenant tidak valid atau tidak ditemukan.' },
          { status: 403 }
        );
      }

      const tokenSlug = (merchantAuthPayload.tenantSlug || '').toLowerCase();
      const tokenId = (merchantAuthPayload.tenantId || '').toLowerCase();
      if (tokenSlug !== tData.slug.toLowerCase() && (!tokenId || tokenId !== tData.id.toLowerCase())) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Token sesi tidak cocok dengan tenant yang diminta.' },
          { status: 403 }
        );
      }

      resolvedTenant = tData;
    } else {
      // 2b. Resolve target tenant for Supabase Auth user
      if (tenantParam) {
        const cleanParam = tenantParam.trim().toLowerCase();
        const isUuid = IS_UUID_REGEX.test(cleanParam);
        let tQuery = supabase.from('tenants').select('id, slug, metadata');
        if (isUuid) {
          tQuery = tQuery.eq('id', cleanParam);
        } else {
          tQuery = tQuery.eq('slug', cleanParam);
        }
        const { data: tData, error: tErr } = await tQuery.maybeSingle();
        if (tErr || !tData) {
          return NextResponse.json(
            { success: false, message: 'Forbidden: Tenant tidak valid atau tidak ditemukan.' },
            { status: 403 }
          );
        }
        resolvedTenant = tData;
      } else {
        // Auto-resolve active workspace tenant for this user
        let tuQuery = supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('is_active', true);
        if (userEmail) {
          tuQuery = tuQuery.or(`user_id.eq.${userId},email.eq.${userEmail}`);
        } else {
          tuQuery = tuQuery.eq('user_id', userId);
        }
        const { data: memberRow } = await tuQuery.limit(1).maybeSingle();
        if (memberRow?.tenant_id) {
          const { data: memberTenant } = await supabase
            .from('tenants')
            .select('id, slug, metadata')
            .eq('id', memberRow.tenant_id)
            .maybeSingle();
          resolvedTenant = memberTenant;
        }

        if (!resolvedTenant) {
          return NextResponse.json(
            { success: false, message: 'Forbidden: Parameter tenant_id diperlukan atau context workspace tidak ditemukan.' },
            { status: 403 }
          );
        }
      }

      // 3. Verify Supabase Auth user is owner or active member of the resolved tenant
      const appRole = String(user.app_metadata?.role || user.app_metadata?.user_role || '').trim().toUpperCase();
      const isSuperAdmin = appRole === 'SUPERADMIN';

      const isOwner =
        (resolvedTenant.user_id && resolvedTenant.user_id === userId) ||
        (resolvedTenant.owner_id && resolvedTenant.owner_id === userId) ||
        (resolvedTenant.metadata?.user_id && resolvedTenant.metadata.user_id === userId) ||
        (resolvedTenant.metadata?.owner_id && resolvedTenant.metadata.owner_id === userId) ||
        (userEmail && (
          (resolvedTenant.email && resolvedTenant.email.toLowerCase().trim() === userEmail) ||
          (resolvedTenant.owner_email && resolvedTenant.owner_email.toLowerCase().trim() === userEmail) ||
          (resolvedTenant.metadata?.email && resolvedTenant.metadata.email.toLowerCase().trim() === userEmail) ||
          (resolvedTenant.metadata?.owner_email && resolvedTenant.metadata.owner_email.toLowerCase().trim() === userEmail)
        ));

      let isMember = false;
      if (!isSuperAdmin && !isOwner) {
        try {
          let memberQuery = supabase
            .from('tenant_users')
            .select('id, role, is_active')
            .or(`tenant_id.eq.${resolvedTenant.id},tenant_slug.eq.${resolvedTenant.slug}`)
            .eq('is_active', true);

          if (userEmail) {
            memberQuery = memberQuery.eq('email', userEmail);
            const { data: memberRecords } = await memberQuery;
            if (Array.isArray(memberRecords) && memberRecords.length > 0) {
              isMember = true;
            }
          }
        } catch (tuErr) {
          console.warn('[Studio Jobs API] Error checking tenant_users membership:', tuErr);
        }
      }

      if (!isSuperAdmin && !isOwner && !isMember) {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Anda tidak memiliki hak akses ke data tenant ini.' },
          { status: 403 }
        );
      }
    }

    // 4. Query studio_jobs with mandatory tenant isolation filter
    const verifiedTenantId = resolvedTenant.id;

    let query = supabase
      .from('studio_jobs')
      .select('id, tenant_id, user_id, status, job_type, payload, output_url, error_message, attempt, created_at, updated_at')
      .eq('tenant_id', verifiedTenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

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

    // Auto-Refund Safeguard: verify all FAILED or TIMEOUT jobs have been refunded
    for (const j of jobList) {
      if (j.status === 'FAILED' || j.status === 'TIMEOUT') {
        try {
          await StudioCreditService.refundJobCredits({
            tenantIdOrSlug: j.tenant_id,
            jobId: j.id,
            reason: j.error_message || `Job ended in status ${j.status}`,
          });
        } catch (rfErr) {
          console.warn('[Studio Jobs API] Warning running auto-refund for job:', j.id, rfErr);
        }
      }
    }

    // Calculate live telemetry counts
    const total = jobList.length;
    const completed = jobList.filter((j: any) => j.status === 'COMPLETED').length;
    const processing = jobList.filter((j: any) => j.status === 'PROCESSING').length;
    const queued = jobList.filter((j: any) => j.status === 'QUEUED').length;
    const failed = jobList.filter((j: any) => j.status === 'FAILED' || j.status === 'TIMEOUT').length;

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

/**
 * PATCH /api/studio/jobs
 * Worker status update handler: QUEUED -> PROCESSING -> COMPLETED / FAILED.
 * Strictly requires worker service authentication (STUDIO_WORKER_SECRET or INTERNAL_WORKER_SECRET).
 * Rejects with 401 Unauthorized before touching Supabase Admin if secret is missing or mismatched.
 * Auto-refunds credits if status is changed to FAILED or TIMEOUT.
 */
export async function PATCH(req: Request) {
  try {
    // 1. Worker Service Authentication (Strict CTO Gate)
    const studioSecret = process.env.STUDIO_WORKER_SECRET?.trim();
    const internalSecret = process.env.INTERNAL_WORKER_SECRET?.trim();

    const authHeader = req.headers.get('authorization')?.trim() || '';
    let bearerToken = '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      bearerToken = authHeader.slice(7).trim();
    } else if (authHeader && !authHeader.toLowerCase().startsWith('basic ')) {
      bearerToken = authHeader.trim();
    }

    const workerSecretHeader =
      req.headers.get('x-worker-secret')?.trim() ||
      req.headers.get('x-internal-worker-secret')?.trim() ||
      '';

    const providedToken = workerSecretHeader || bearerToken;

    const isSecretValid =
      Boolean(providedToken) &&
      ((studioSecret && providedToken === studioSecret) ||
       (internalSecret && providedToken === internalSecret));

    if (!isSecretValid) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Kredensial worker tidak valid atau tidak disertakan.' },
        { status: 401 }
      );
    }

    // 2. Only proceed to body parsing and Supabase Admin mutation AFTER worker auth passes
    const body = await req.json();
    const rawJobId = body.job_id || body.jobId;
    const { status, output_url, error_message } = body;
    const job_id = rawJobId;

    if (!job_id || !status) {
      return NextResponse.json(
        { success: false, message: 'job_id dan status wajib disertakan.' },
        { status: 400 }
      );
    }

    const normalizedStatus = status.toUpperCase();
    const validStatuses = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'TIMEOUT'];
    if (!validStatuses.includes(normalizedStatus)) {
      return NextResponse.json(
        { success: false, message: `Status tidak valid. Pilihan: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    let supabase: any;
    try {
      supabase = getSupabaseAdmin();
    } catch (dbErr: any) {
      return NextResponse.json({ success: false, message: 'Database client tidak tersedia: ' + (dbErr?.message || '') }, { status: 500 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, message: 'Database client tidak tersedia.' }, { status: 500 });
    }

    const { data: job, error: jobErr } = await supabase
      .from('studio_jobs')
      .select('id, tenant_id, status')
      .eq('id', job_id)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json({ success: false, message: 'Job tidak ditemukan.' }, { status: 404 });
    }

    const updatePayload: any = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    };
    if (output_url !== undefined) updatePayload.output_url = output_url;
    if (error_message !== undefined) updatePayload.error_message = error_message;

    const { error: updateErr } = await supabase
      .from('studio_jobs')
      .update(updatePayload)
      .eq('id', job_id);

    if (updateErr) {
      return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    // Auto-refund trigger on FAILED or TIMEOUT
    let refundResult = null;
    if (normalizedStatus === 'FAILED' || normalizedStatus === 'TIMEOUT') {
      refundResult = await StudioCreditService.refundJobCredits({
        tenantIdOrSlug: job.tenant_id,
        jobId: job.id,
        reason: error_message || `Job status transitioned to ${normalizedStatus}`,
      });
    }

    return NextResponse.json({
      success: true,
      job_id,
      status: normalizedStatus,
      output_url: output_url || null,
      refunded: Boolean(refundResult?.success),
      refund_details: refundResult,
      message: `Status job berhasil diubah ke ${normalizedStatus}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
