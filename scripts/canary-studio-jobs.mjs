/**
 * scripts/canary-studio-jobs.mjs
 * Executive Canary Probe for Studio Render Jobs API Gateway & Credit Reconciliation
 *
 * STRICT ISOLATION GUARDRAILS:
 * 1. Dedicated Canary Tenant ('canary-studio-probe'): Zero impact to real merchant stores.
 * 2. Production Reservation Pipeline: Uses StudioCreditService.reserveJobCredits() directly for credit deductions.
 * 3. Real HTTP & Webhook Flow: Triggers FAILED / auto-refund via HTTP PATCH to /api/studio/jobs.
 * 4. Safe Cleanup: Scoped strictly to WHERE tenant_id = canaryTenant.id.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import createJiti from 'jiti';

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

// Load production StudioCreditService via jiti
const jitiLoader = (typeof createJiti === 'function' ? createJiti : createJiti.default)(
  path.resolve('scripts/canary-studio-jobs.mjs'),
  { alias: { '@': process.cwd() } }
);
const { StudioCreditService } = jitiLoader(path.resolve('lib/services/studio-credit.service.ts'));

console.log('\n========================================================================');
console.log('   🕊️  BOONTRACK CANARY AUDIT: DEDICATED PROBE & PRODUCTION CREDIT PIPELINE');
console.log(`   Host Target   : ${TARGET_URL}`);
console.log(`   Supabase Host : ${new URL(SUPABASE_URL).hostname}`);
console.log(`   Probe Target  : Dedicated Tenant ('canary-studio-probe')`);
console.log(`   Worker Auth   : [CONFIGURED - FAIL-CLOSED ACTIVE]`);
console.log(`   Timestamp     : ${new Date().toISOString()}`);
console.log('========================================================================\n');

/**
 * Ensures dedicated canary tenant exists with initial 50 credits in tenant_entitlements.
 * Never touches real merchant tenants.
 */
async function ensureCanaryTenant() {
  const canarySlug = 'canary-studio-probe';

  let { data: canaryTenant } = await supabase
    .from('tenants')
    .select('id, slug, tier, is_active')
    .eq('slug', canarySlug)
    .maybeSingle();

  if (!canaryTenant) {
    let insertRes = await supabase.from('tenants').insert({
      slug: canarySlug,
      name: 'Canary Studio Test Tenant',
      tier: 'PRO',
      is_active: true,
    }).select('id, slug, tier, is_active').maybeSingle();

    if (insertRes.error && insertRes.error.message.includes('enum')) {
      insertRes = await supabase.from('tenants').insert({
        slug: canarySlug,
        name: 'Canary Studio Test Tenant',
        tier: 'PRO_SCALE',
        is_active: true,
      }).select('id, slug, tier, is_active').maybeSingle();
    }

    if (insertRes.error || !insertRes.data) {
      throw new Error(`Gagal membuat dedicated canary tenant: ${insertRes.error?.message}`);
    }
    canaryTenant = insertRes.data;
  }

  // Ensure 50 credits in tenant_entitlements
  const { error: entErr } = await supabase
    .from('tenant_entitlements')
    .upsert({
      tenant_id: canaryTenant.id,
      credits_remaining: 50,
      is_unlimited: false,
      tier: canaryTenant.tier || 'PRO_SCALE',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });

  if (entErr) {
    throw new Error(`Gagal menyiapkan tenant_entitlements canary: ${entErr.message}`);
  }

  return canaryTenant;
}

async function runCanary() {
  const results = {
    test1_happy_path: false,
    test2_auto_refund: false,
    test2_idempotent: false,
    test3_cross_tenant_isolated: false,
  };

  let canaryTenant = null;
  let testAttackerUserId = null;

  try {
    // 1. Resolve Dedicated Canary Tenant
    canaryTenant = await ensureCanaryTenant();
    console.log(`   • Dedicated Canary Tenant: ${canaryTenant.slug} (${canaryTenant.id})`);

    const { data: usersData, error: userListErr } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (userListErr || !usersData?.users?.length) {
      throw new Error(`Gagal memuat user Supabase untuk canary job: ${userListErr?.message || 'User kosong'}`);
    }
    const testUserId = usersData.users[0].id;

    // --- TEST 1: Happy Path (Render Job COMPLETED & Credits Deducted) ---
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ [TEST 1/3] UJI JOB SUKSES (HAPPY PATH & PRODUCTION RESERVATION)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const happyJobId = crypto.randomUUID();
    const renderCost = 3;
    const initialCredits = 50;

    console.log(`   • Tenant Uji       : ${canaryTenant.slug} (${canaryTenant.id})`);
    console.log(`   • Canary Job ID    : ${happyJobId}`);
    console.log(`   • Saldo DB Awal    : ${initialCredits} Credits`);
    console.log(`   • Biaya Render MP4 : ${renderCost} Credits`);

    // Use official production reservation method (StudioCreditService.reserveJobCredits)
    console.log(`   • Memanggil StudioCreditService.reserveJobCredits() (Jalur Produksi)...`);
    const reserveRes = await StudioCreditService.reserveJobCredits(
      canaryTenant.id,
      renderCost,
      `[Canary Probe] Video render MP4: ${happyJobId}`,
      happyJobId
    );

    if (!reserveRes.success) {
      throw new Error(`Reservasi saldo gagal lewat StudioCreditService: ${reserveRes.message}`);
    }

    const expectedBalanceAfterReserve = initialCredits - renderCost; // 47
    console.log(`   • Saldo Pasca-Reservasi: ${reserveRes.credits_remaining} Credits (Tepat terpotong -${renderCost})`);

    // Insert job into studio_jobs
    await supabase.from('studio_jobs').insert({
      id: happyJobId,
      tenant_id: canaryTenant.id,
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
    const { data: dbHappyJob } = await supabase
      .from('studio_jobs')
      .select('status, output_url')
      .eq('id', happyJobId)
      .eq('tenant_id', canaryTenant.id)
      .single();

    if (dbHappyJob?.status !== 'COMPLETED') {
      throw new Error(`Happy Path DB gagal: status adalah ${dbHappyJob?.status}, diharapkan COMPLETED`);
    }

    const { data: dbHappyEnt } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining')
      .eq('tenant_id', canaryTenant.id)
      .single();

    if (dbHappyEnt?.credits_remaining !== expectedBalanceAfterReserve) {
      throw new Error(`Happy Path DB saldo mismatch: Saldo ${dbHappyEnt?.credits_remaining}, diharapkan ${expectedBalanceAfterReserve}`);
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
    const balanceBeforeFail = expectedBalanceAfterReserve; // 47
    const expectedAfterFailReserve = balanceBeforeFail - renderCost; // 44

    console.log(`   • Failed Job ID    : ${failedJobId}`);
    console.log(`   • Saldo Sebelum Job: ${balanceBeforeFail} Credits`);
    console.log(`   • Memanggil StudioCreditService.reserveJobCredits() untuk job gagal...`);

    const failReserveRes = await StudioCreditService.reserveJobCredits(
      canaryTenant.id,
      renderCost,
      `[Canary Probe] Failed video render probe: ${failedJobId}`,
      failedJobId
    );

    if (!failReserveRes.success) {
      throw new Error(`Reservasi job gagal lewat StudioCreditService gagal: ${failReserveRes.message}`);
    }
    console.log(`   • Saldo Pasca-Reservasi: ${failReserveRes.credits_remaining} Credits (${balanceBeforeFail} - ${renderCost})`);

    // Insert job into studio_jobs
    await supabase.from('studio_jobs').insert({
      id: failedJobId,
      tenant_id: canaryTenant.id,
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
      .eq('tenant_id', canaryTenant.id)
      .eq('type', 'REFUND');

    if (!refundRows || refundRows.length === 0) {
      throw new Error('Failure Path DB gagal: Tidak ditemukan row REFUND di tenant_credit_ledger');
    }

    const { data: dbRestoredEnt } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining')
      .eq('tenant_id', canaryTenant.id)
      .single();

    if (dbRestoredEnt?.credits_remaining !== balanceBeforeFail) {
      throw new Error(`Auto-refund DB saldo mismatch: Saldo ${dbRestoredEnt?.credits_remaining}, diharapkan ${balanceBeforeFail}`);
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
      .eq('tenant_id', canaryTenant.id)
      .eq('type', 'REFUND');

    if (postRetryLedgers?.length !== 1) {
      throw new Error(`Idempotency guard gagal: Ditemukan ${postRetryLedgers?.length} baris refund (seharusnya tepat 1)`);
    }

    const { data: postRetryEnt } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining')
      .eq('tenant_id', canaryTenant.id)
      .single();

    if (postRetryEnt?.credits_remaining !== balanceBeforeFail) {
      throw new Error(`Idempotency saldo terlanggar: Saldo ${postRetryEnt?.credits_remaining}, diharapkan tetap ${balanceBeforeFail}`);
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

    // Sign in to receive genuine Supabase session JWT via separate client (prevent mutating admin service-role)
    const attackerClient = createClient(
      SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: sessionData, error: sessionErr } = await attackerClient.auth.signInWithPassword({
      email: attackerEmail,
      password: attackerPassword,
    });

    if (sessionErr || !sessionData?.session?.access_token) {
      throw new Error(`Gagal login user penyerang: ${sessionErr?.message}`);
    }
    const attackerToken = sessionData.session.access_token;

    console.log(`   • Target Tenant    : ${canaryTenant.slug} (${canaryTenant.id})`);
    console.log(`   • Penyerang Asing  : ${attackerEmail}`);
    console.log(`   • Mengirim HTTP GET /api/studio/jobs?tenant_id=${canaryTenant.id} dengan Bearer Token asing...`);

    const isolationRes = await fetch(`${TARGET_URL}/api/studio/jobs?tenant_id=${canaryTenant.id}`, {
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
    // --- SAFE CLEANUP (STRICTLY SCOPED TO CANARY TENANT) ---
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('▶ [CLEANUP] SAFE ISOLATED CLEANUP (CANARY TENANT ONLY)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (canaryTenant?.id) {
      // 1. Delete studio_jobs strictly for canary tenant
      const delJobsRes = await supabase
        .from('studio_jobs')
        .delete({ count: 'exact' })
        .eq('tenant_id', canaryTenant.id);
      const jobsDeleted = delJobsRes.count ?? delJobsRes.data?.length ?? 0;
      console.log(`   🧹 Bersihkan ${jobsDeleted} jobs dari studio_jobs milik canary tenant.`);

      // 2. Delete tenant_credit_ledger strictly for canary tenant
      const delLedgerRes = await supabase
        .from('tenant_credit_ledger')
        .delete({ count: 'exact' })
        .eq('tenant_id', canaryTenant.id);
      const ledgerDeleted = delLedgerRes.count ?? delLedgerRes.data?.length ?? 0;
      console.log(`   🧹 Bersihkan ${ledgerDeleted} ledger entries dari tenant_credit_ledger milik canary tenant.`);

      // 3. Reset canary tenant credit balance to 50
      await supabase
        .from('tenant_entitlements')
        .update({
          credits_remaining: 50,
          is_unlimited: false,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', canaryTenant.id);
      console.log('   🧹 Reset saldo tenant canary kembali ke 50 Credits (Tenant lain tidak disentuh).');
    }

    // 4. Delete temporary test attacker user
    if (testAttackerUserId) {
      await supabase.auth.admin.deleteUser(testAttackerUserId);
      console.log('   🧹 Hapus akun penyerang sementara dari auth.users.');
    }
  }

  // --- SUMMARY REPORT ---
  console.log('\n========================================================================');
  console.log('   📊 EXECUTIVE CANARY AUDIT REPORT FOR CTO');
  console.log('========================================================================');
  console.log(`   1. Uji Job Sukses (Happy Path)        : ${results.test1_happy_path ? '✅ PASSED (200 OK, Real DB Settled via StudioCreditService)' : '❌ FAILED'}`);
  console.log(`   2. Uji Job Gagal (Auto-Refund)        : ${results.test2_auto_refund ? '✅ PASSED (Real DB Refund Verified)' : '❌ FAILED'}`);
  console.log(`   3. Uji Idempotensi Refund             : ${results.test2_idempotent ? '✅ PASSED (Zero Double-Refund in DB)' : '❌ FAILED'}`);
  console.log(`   4. Uji Isolasi Cross-Tenant           : ${results.test3_cross_tenant_isolated ? '✅ PASSED (Real HTTP 403 Forbidden Gate)' : '❌ FAILED'}`);
  console.log('------------------------------------------------------------------------');
  console.log('   STATUS CANARY PIPELINE : 100% HEALTHY, DEDICATED PROBE & AUDIT-COMPLIANT 🛡️');
  console.log('========================================================================\n');
}

runCanary().catch((err) => {
  console.error('\n❌ Fatal Canary Error:', err.message || err);
  process.exit(1);
});
