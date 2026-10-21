/**
 * scripts/canary-studio-jobs.mjs
 * Executive Canary Probe for Studio Render Jobs API Gateway & Credit Reconciliation
 *
 * Verifies Production Real E2E Pipeline (No Mock / Fail-Closed):
 * 1. Happy Path: Real Supabase DB check, credit reservation, HTTP PATCH 200 OK via x-worker-secret, DB status COMPLETED & credits settled.
 * 2. Failure & Auto-Refund: Real HTTP PATCH status FAILED, DB auto-refund row check, idempotent retry verification (zero double-refund).
 * 3. Cross-Tenant Security: Real HTTP GET with foreign authenticated session token -> HTTP 403 Forbidden with zero data leak.
 * 4. Cleanup: Purges canary jobs, ledger entries, test auth users, and restores initial tenant balance.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// 1. Load environment variables from .env.local and .env
const envFiles = ['.env.local', '.env'];
for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (process.env[key] === undefined) process.env[key] = val;
      }
    }
  }
}

// 2. Strict Fail-Closed Environment Guards (Zero Hardcoded Fallbacks)
const TARGET_URL = (process.env.CANARY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
if (!TARGET_URL) {
  console.error('\n❌ Fatal Canary Error: Target URL tidak disetel');
  process.exit(1);
}

const WORKER_SECRET = (process.env.STUDIO_WORKER_SECRET || process.env.INTERNAL_WORKER_SECRET || '').trim();
if (!WORKER_SECRET) {
  console.error('\n❌ Fatal Canary Error: Worker secret wajib disediakan via env var');
  process.exit(1);
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Fatal Canary Error: Supabase Service Role Key wajib disediakan via env var');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('\n========================================================================');
console.log('   🕊️  BOONTRACK CANARY AUDIT: STUDIO JOBS API & CREDIT RECONCILIATION');
console.log(`   Host Target   : ${TARGET_URL}`);
console.log(`   Supabase Host : ${new URL(SUPABASE_URL).hostname}`);
console.log(`   Worker Auth   : [CONFIGURED - FAIL-CLOSED ACTIVE]`);
console.log(`   Timestamp     : ${new Date().toISOString()}`);
console.log('========================================================================\n');

async function runCanary() {
  const results = {
    test1_happy_path: false,
    test2_auto_refund: false,
    test2_idempotent: false,
    test3_cross_tenant_isolated: false,
  };

  const testJobIds = [];
  const testLedgerIds = [];
  let testAttackerUserId = null;
  let tenant = null;
  let initialEntitlement = null;
  let originalBalance = null;

  try {
    // 0. Resolve Live Test Tenant & User from Supabase
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, tier')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (tenantErr || !tenantRow) {
      throw new Error(`Gagal memuat tenant aktif dari Supabase: ${tenantErr?.message || 'Data kosong'}`);
    }
    tenant = tenantRow;

    const { data: usersData, error: userListErr } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (userListErr || !usersData?.users?.length) {
      throw new Error(`Gagal memuat user Supabase untuk canary job: ${userListErr?.message || 'User kosong'}`);
    }
    const testUserId = usersData.users[0].id;

    // Read real starting credit balance from tenant_entitlements
    const { data: entRow } = await supabase
      .from('tenant_entitlements')
      .select('id, credits_remaining, is_unlimited')
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    initialEntitlement = entRow;
    originalBalance = entRow?.credits_remaining ?? 50;

    if (!entRow) {
      await supabase.from('tenant_entitlements').insert({
        tenant_id: tenant.id,
        credits_remaining: originalBalance,
        tier: tenant.tier || 'PRO_SCALE',
        is_unlimited: false,
        updated_at: new Date().toISOString(),
      });
    } else if (entRow.is_unlimited) {
      await supabase.from('tenant_entitlements').update({
        is_unlimited: false,
      }).eq('tenant_id', tenant.id);
    }

    // --- TEST 1: Happy Path (Render Job COMPLETED & Credits Deducted) ---
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ [TEST 1/3] UJI JOB SUKSES (HAPPY PATH & CREDIT SETTLEMENT)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const happyJobId = crypto.randomUUID();
    testJobIds.push(happyJobId);
    const renderCost = 3;
    const reservedBalance = originalBalance - renderCost;

    console.log(`   • Tenant Uji       : ${tenant.slug} (${tenant.id})`);
    console.log(`   • Canary Job ID    : ${happyJobId}`);
    console.log(`   • Saldo DB Awal    : ${originalBalance} Credits`);
    console.log(`   • Biaya Render MP4 : ${renderCost} Credits`);
    console.log(`   • Saldo Reservasi  : ${reservedBalance} Credits`);

    // Reserve credits in DB
    await supabase.from('tenant_entitlements').update({
      credits_remaining: reservedBalance,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenant.id);

    const reserveKey = `CANARY_RESERVE_${tenant.id}_${happyJobId}`;
    const { data: reserveLedger } = await supabase.from('tenant_credit_ledger').insert({
      tenant_id: tenant.id,
      job_id: happyJobId,
      idempotency_key: reserveKey,
      amount: -renderCost,
      balance_after: reservedBalance,
      action: 'STUDIO_RENDER_JOB',
      type: 'RESERVE',
      actor_id: 'CANARY_PROBE',
      actor_role: 'SYSTEM',
      reason: 'STUDIO_RENDER_JOB',
      description: `[Canary Probe] Reserve credits for happy job ${happyJobId}`,
      metadata: { is_canary: true, job_id: happyJobId },
    }).select('id').single();
    if (reserveLedger?.id) testLedgerIds.push(reserveLedger.id);

    // Insert job into studio_jobs
    await supabase.from('studio_jobs').insert({
      id: happyJobId,
      tenant_id: tenant.id,
      user_id: testUserId,
      status: 'PROCESSING',
      job_type: 'VIDEO_RENDER',
      payload: { is_canary: true, prompt: 'Canary E2E Happy Path Render' },
    });

    console.log(`   • Mengirim HTTP PATCH ke ${TARGET_URL}/api/studio/jobs dengan x-worker-secret...`);
    const happyPatchRes = await fetch(`${TARGET_URL}/api/studio/jobs`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        job_id: happyJobId,
        jobId: happyJobId,
        status: 'COMPLETED',
        output_url: `https://cdn.boon.id/canary-renders/${happyJobId}.mp4`,
      }),
    });

    const happyJson = await happyPatchRes.json();
    if (happyPatchRes.status !== 200 || !happyJson.success) {
      throw new Error(`Happy Path HTTP PATCH gagal: HTTP ${happyPatchRes.status} - ${JSON.stringify(happyJson)}`);
    }

    // Verify DB State
    const { data: dbHappyJob } = await supabase.from('studio_jobs').select('status, output_url').eq('id', happyJobId).single();
    if (dbHappyJob?.status !== 'COMPLETED') {
      throw new Error(`Happy Path DB gagal: status adalah ${dbHappyJob?.status}, diharapkan COMPLETED`);
    }

    const { data: dbHappyEnt } = await supabase.from('tenant_entitlements').select('credits_remaining').eq('tenant_id', tenant.id).single();
    if (dbHappyEnt?.credits_remaining !== reservedBalance) {
      throw new Error(`Happy Path DB saldo mismatch: Saldo ${dbHappyEnt?.credits_remaining}, diharapkan ${reservedBalance}`);
    }

    results.test1_happy_path = true;
    console.log(`   ✅ [PASS] HTTP Response 200 OK.`);
    console.log(`   ✅ [PASS] Status DB terupdate menjadi 'COMPLETED'.`);
    console.log(`   ✅ [PASS] Output URL: ${dbHappyJob.output_url}`);
    console.log(`   ✅ [PASS] Saldo akhir tenant di DB terpotong presisi: ${dbHappyEnt.credits_remaining} Credits.`);

    // --- TEST 2: Failure & Auto-Refund (Idempotent Safeguard) ---
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ [TEST 2/3] UJI JOB GAGAL & SAFEGUARD AUTO-REFUND IDEMPOTEN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const failedJobId = crypto.randomUUID();
    testJobIds.push(failedJobId);
    const preFailBalance = reservedBalance;
    const failReservedBalance = preFailBalance - renderCost;

    console.log(`   • Failed Job ID    : ${failedJobId}`);
    console.log(`   • Saldo Sebelum Job: ${preFailBalance} Credits`);
    console.log(`   • Saldo Reservasi  : ${failReservedBalance} Credits (Terpotong -${renderCost})`);

    // Reserve credits in DB
    await supabase.from('tenant_entitlements').update({
      credits_remaining: failReservedBalance,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenant.id);

    const failReserveKey = `CANARY_RESERVE_${tenant.id}_${failedJobId}`;
    const { data: failReserveLedger } = await supabase.from('tenant_credit_ledger').insert({
      tenant_id: tenant.id,
      job_id: failedJobId,
      idempotency_key: failReserveKey,
      amount: -renderCost,
      balance_after: failReservedBalance,
      action: 'STUDIO_RENDER_JOB',
      type: 'RESERVE',
      actor_id: 'CANARY_PROBE',
      actor_role: 'SYSTEM',
      reason: 'STUDIO_RENDER_JOB',
      description: `[Canary Probe] Reserve credits for failed job ${failedJobId}`,
      metadata: { is_canary: true, job_id: failedJobId },
    }).select('id').single();
    if (failReserveLedger?.id) testLedgerIds.push(failReserveLedger.id);

    // Insert job into studio_jobs
    await supabase.from('studio_jobs').insert({
      id: failedJobId,
      tenant_id: tenant.id,
      user_id: testUserId,
      status: 'PROCESSING',
      job_type: 'VIDEO_RENDER',
      payload: { is_canary: true, prompt: 'Canary E2E Failure Path Render' },
    });

    console.log(`   • Mengirim HTTP PATCH status FAILED ke endpoint API...`);
    const failPatchRes = await fetch(`${TARGET_URL}/api/studio/jobs`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        job_id: failedJobId,
        jobId: failedJobId,
        status: 'FAILED',
        error_message: 'FFmpeg SIGKILL: GPU memory allocation timeout on node worker-canary',
      }),
    });

    const failJson = await failPatchRes.json();
    if (failPatchRes.status !== 200 || !failJson.success) {
      throw new Error(`Failure Path HTTP PATCH gagal: HTTP ${failPatchRes.status} - ${JSON.stringify(failJson)}`);
    }

    // Verify DB Refund Entry and Credit Restoration
    const { data: refundRows } = await supabase
      .from('tenant_credit_ledger')
      .select('id, amount, balance_after, type')
      .eq('job_id', failedJobId)
      .eq('type', 'REFUND');

    if (!refundRows || refundRows.length === 0) {
      throw new Error('Failure Path DB gagal: Tidak ditemukan row REFUND di tenant_credit_ledger');
    }
    refundRows.forEach(r => testLedgerIds.push(r.id));

    const { data: dbRestoredEnt } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining')
      .eq('tenant_id', tenant.id)
      .single();

    if (dbRestoredEnt?.credits_remaining !== preFailBalance) {
      throw new Error(`Auto-refund DB saldo mismatch: Saldo ${dbRestoredEnt?.credits_remaining}, diharapkan ${preFailBalance}`);
    }

    results.test2_auto_refund = true;
    console.log(`   ✅ [PASS] HTTP Response 200 OK | Status: FAILED.`);
    console.log(`   ✅ [PASS] Row REFUND tercatat di tenant_credit_ledger (${refundRows[0].id}).`);
    console.log(`   ✅ [PASS] Saldo pulih otomatis di Supabase: ${dbRestoredEnt.credits_remaining} Credits.`);

    // Test Idempotency: Re-send identical PATCH
    console.log(`   • Menguji Idempotensi: Mengirim ULANG HTTP PATCH FAILED yang identik...`);
    const retryPatchRes = await fetch(`${TARGET_URL}/api/studio/jobs`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        job_id: failedJobId,
        jobId: failedJobId,
        status: 'FAILED',
        error_message: 'FFmpeg SIGKILL: GPU memory allocation timeout on node worker-canary',
      }),
    });

    const retryJson = await retryPatchRes.json();
    if (retryPatchRes.status !== 200) {
      throw new Error(`Retry HTTP PATCH gagal: HTTP ${retryPatchRes.status} - ${JSON.stringify(retryJson)}`);
    }

    // Verify Zero Duplicate Refund in DB Ledger & Saldo
    const { data: postRetryLedgers } = await supabase
      .from('tenant_credit_ledger')
      .select('id')
      .eq('job_id', failedJobId)
      .eq('type', 'REFUND');

    if (postRetryLedgers?.length !== 1) {
      throw new Error(`Idempotency guard gagal: Ditemukan ${postRetryLedgers?.length} baris refund (seharusnya tepat 1)`);
    }

    const { data: postRetryEnt } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining')
      .eq('tenant_id', tenant.id)
      .single();

    if (postRetryEnt?.credits_remaining !== preFailBalance) {
      throw new Error(`Idempotency saldo terlanggar: Saldo ${postRetryEnt?.credits_remaining}, diharapkan tetap ${preFailBalance}`);
    }

    results.test2_idempotent = true;
    console.log(`   ✅ [PASS] Retry HTTP 200 OK.`);
    console.log(`   ✅ [PASS] Ledger tetap memiliki tepat 1 baris refund (Zero Double-Refund Guard Passed).`);
    console.log(`   ✅ [PASS] Saldo DB tetap ${postRetryEnt.credits_remaining} Credits (Tidak terduplikasi).`);

    // --- TEST 3: Cross-Tenant Security Isolation ---
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ [TEST 3/3] UJI KEAMANAN CROSS-TENANT DATA ISOLATION (REAL AUTH)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const attackerEmail = `canary-attacker-${Date.now()}@canary-audit.test`;
    const attackerPassword = `CanaryPass!${Date.now()}`;
    const { data: attackerUser, error: attackerCreateErr } = await supabase.auth.admin.createUser({
      email: attackerEmail,
      password: attackerPassword,
      email_confirm: true,
    });

    if (attackerCreateErr || !attackerUser?.user?.id) {
      throw new Error(`Gagal membuat akun uji isolasi: ${attackerCreateErr?.message}`);
    }
    testAttackerUserId = attackerUser.user.id;

    // Sign in to receive genuine Supabase session JWT
    const { data: sessionData, error: sessionErr } = await supabase.auth.signInWithPassword({
      email: attackerEmail,
      password: attackerPassword,
    });

    if (sessionErr || !sessionData?.session?.access_token) {
      throw new Error(`Gagal login user penyerang: ${sessionErr?.message}`);
    }
    const attackerToken = sessionData.session.access_token;

    console.log(`   • Target Tenant    : ${tenant.slug} (${tenant.id})`);
    console.log(`   • Penyerang Asing  : ${attackerEmail}`);
    console.log(`   • Mengirim HTTP GET /api/studio/jobs?tenant_id=${tenant.id} dengan Bearer Token asing...`);

    const isolationRes = await fetch(`${TARGET_URL}/api/studio/jobs?tenant_id=${tenant.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${attackerToken}`,
      },
    });

    const isolationJson = await isolationRes.json();
    if (isolationRes.status !== 403) {
      throw new Error(`Cross-Tenant Isolation GAGAL! Diharapkan HTTP 403 Forbidden, diterima HTTP ${isolationRes.status}`);
    }

    if (isolationJson.success !== false || isolationJson.jobs !== undefined) {
      throw new Error(`Cross-Tenant Isolation membocorkan payload: ${JSON.stringify(isolationJson)}`);
    }

    results.test3_cross_tenant_isolated = true;
    console.log(`   ✅ [PASS] Response HTTP 403 Forbidden.`);
    console.log(`   ✅ [PASS] Pesan: '${isolationJson.message}'.`);
    console.log(`   ✅ [PASS] Zero Data Leak: Tidak ada metadata atau data jobs milik tenant yang bocor.`);

  } finally {
    // --- CLEANUP TEST DATA ---
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ [CLEANUP] PEMBERSIHAN DATA UJI CANARY DARI SUPABASE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (testJobIds.length > 0) {
      await supabase.from('studio_jobs').delete().in('id', testJobIds);
      console.log(`   🧹 Bersihkan ${testJobIds.length} canary jobs dari studio_jobs.`);
    }

    if (testLedgerIds.length > 0) {
      await supabase.from('tenant_credit_ledger').delete().in('id', testLedgerIds);
      console.log(`   🧹 Bersihkan ${testLedgerIds.length} canary ledger entries dari tenant_credit_ledger.`);
    }

    if (tenant && originalBalance !== null) {
      await supabase.from('tenant_entitlements').update({
        credits_remaining: originalBalance,
        is_unlimited: initialEntitlement?.is_unlimited ?? false,
        updated_at: new Date().toISOString(),
      }).eq('tenant_id', tenant.id);
      console.log(`   🧹 Pulihkan saldo tenant ke nilai awal (${originalBalance} Credits).`);
    }

    if (testAttackerUserId) {
      await supabase.auth.admin.deleteUser(testAttackerUserId);
      console.log('   🧹 Hapus akun penyerang sementara dari auth.users.');
    }
  }

  // --- SUMMARY REPORT ---
  console.log('\n========================================================================');
  console.log('   📊 EXECUTIVE CANARY AUDIT REPORT FOR CTO');
  console.log('========================================================================');
  console.log(`   1. Uji Job Sukses (Happy Path)        : ${results.test1_happy_path ? '✅ PASSED (200 OK, Real DB Settled)' : '❌ FAILED'}`);
  console.log(`   2. Uji Job Gagal (Auto-Refund)        : ${results.test2_auto_refund ? '✅ PASSED (Real DB Refund Verified)' : '❌ FAILED'}`);
  console.log(`   3. Uji Idempotensi Refund             : ${results.test2_idempotent ? '✅ PASSED (Zero Double-Refund in DB)' : '❌ FAILED'}`);
  console.log(`   4. Uji Isolasi Cross-Tenant           : ${results.test3_cross_tenant_isolated ? '✅ PASSED (Real HTTP 403 Forbidden Gate)' : '❌ FAILED'}`);
  console.log('------------------------------------------------------------------------');
  console.log('   STATUS CANARY PIPELINE : 100% HEALTHY, LIVE E2E & AUDIT-COMPLIANT 🛡️');
  console.log('========================================================================\n');
}

runCanary().catch((err) => {
  console.error('\n❌ Fatal Canary Error:', err.message || err);
  process.exit(1);
});
