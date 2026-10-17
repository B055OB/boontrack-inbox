import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf-8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = (match[2] || '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[match[1]] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[ERROR] Supabase credentials missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

console.log('='.repeat(70));
console.log('  RUNNING NODE.JS LIVE SUPABASE INTEGRATION TEST: RPC ANTI-NULL & VALIDATION');
console.log('='.repeat(70));

const testTenantSlug = `anti-null-tenant-node-${Date.now()}`;
const testTenantId = randomUUID();

async function runLiveTest() {
  try {
    // -------------------------------------------------------------------------
    // TEST 1: EXPLICIT INPUT PARAMETER VALIDATION (NULL & INVALID VALUES)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Testing Explicit Input Parameter Validation & Contradiction Guards...');

    const validationCases = [
      { p_tenant_id: null, p_scope: 'tenant', p_action: 'pause', p_is_paused: true, expected: 'INVALID_TENANT_ID' },
      { p_tenant_id: '', p_scope: 'tenant', p_action: 'pause', p_is_paused: true, expected: 'INVALID_TENANT_ID' },
      { p_tenant_id: testTenantId, p_scope: null, p_action: 'pause', p_is_paused: true, expected: 'INVALID_SCOPE' },
      { p_tenant_id: testTenantId, p_scope: 'invalid_scope', p_action: 'pause', p_is_paused: true, expected: 'INVALID_SCOPE' },
      { p_tenant_id: testTenantId, p_scope: 'tenant', p_action: null, p_is_paused: true, expected: 'INVALID_ACTION' },
      { p_tenant_id: testTenantId, p_scope: 'tenant', p_action: 'invalid_action', p_is_paused: true, expected: 'INVALID_ACTION' },
      { p_tenant_id: testTenantId, p_scope: 'tenant', p_action: 'pause', p_is_paused: null, expected: 'INVALID_IS_PAUSED' },
      { p_tenant_id: testTenantId, p_scope: 'tenant', p_action: 'pause', p_is_paused: false, expected: 'CONTRADICTION' },
      { p_tenant_id: testTenantId, p_scope: 'tenant', p_action: 'resume', p_is_paused: true, expected: 'CONTRADICTION' },
      { p_tenant_id: testTenantId, p_scope: 'global', p_action: 'pause', p_is_paused: false, expected: 'CONTRADICTION' },
      { p_tenant_id: testTenantId, p_scope: 'session', p_action: 'resume', p_is_paused: true, expected: 'CONTRADICTION' },
    ];

    for (const c of validationCases) {
      const { data, error } = await supabase.rpc('fn_toggle_bot_session_state', {
        p_tenant_id: c.p_tenant_id,
        p_scope: c.p_scope,
        p_action: c.p_action,
        p_is_paused: c.p_is_paused
      });

      if (!error) {
        console.error(`  FAILED: Expected exception containing '${c.expected}' for params:`, c);
        process.exit(1);
      }

      if (error.message.includes(c.expected)) {
        console.log(`  OK: Correctly rejected (${c.p_tenant_id}, ${c.p_scope}, ${c.p_action}, ${c.p_is_paused}) -> ${c.expected}`);
      } else {
        console.error(`  FAILED: Unexpected error message: ${error.message} (expected ${c.expected})`);
        process.exit(1);
      }
    }

    console.log('=> TEST 1 PASSED: All NULL and invalid parameters were strictly rejected with exceptions!');

    // -------------------------------------------------------------------------
    // TEST 2: SETUP TENANT AND SESSIONS WITH NULL VALUES
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Setting up live tenant and sessions with NULL data values...');
    const { error: tErr } = await supabase.from('tenants').insert({
      id: testTenantId,
      slug: testTenantSlug,
      name: 'Test Anti-NULL Tenant Node',
      tier: 'ADS_PERFORMANCE',
      subscription_tier: 'ADS_PERFORMANCE',
      status: 'active',
      is_active: true,
      bot_paused: false,
      is_bot_active: true,
      metadata: {}
    });
    if (tErr) throw tErr;

    const phoneA = '628111111111'; // Fresh session with NULL pause_reason, NULL current_state, NULL metadata
    const phoneB = '628222222222'; // Handover session with pause_reason = 'HUMAN_HANDOVER'
    const phoneC = '628333333333'; // Active session with empty metadata
    const phoneD = '628444444444'; // Handover session with metadata is_handover = 'true'

    // Insert conversation_sessions
    const { error: csErr } = await supabase.from('conversation_sessions').insert([
      { tenant_id: testTenantId, session_id: `wa_${testTenantId}_${phoneA}`, channel: 'WHATSAPP', user_identifier: phoneA, is_paused: false, pause_reason: null, current_state: null, metadata: null },
      { tenant_id: testTenantId, session_id: `wa_${testTenantId}_${phoneB}`, channel: 'WHATSAPP', user_identifier: phoneB, is_paused: true, pause_reason: 'HUMAN_HANDOVER', current_state: 'HUMAN_HANDOVER', metadata: { pause_reason: 'HUMAN_HANDOVER' } },
      { tenant_id: testTenantId, session_id: `wa_${testTenantId}_${phoneC}`, channel: 'WHATSAPP', user_identifier: phoneC, is_paused: false, pause_reason: null, current_state: 'BOT_ACTIVE', metadata: {} },
      { tenant_id: testTenantId, session_id: `wa_${testTenantId}_${phoneD}`, channel: 'WHATSAPP', user_identifier: phoneD, is_paused: true, pause_reason: null, current_state: 'HANDOVER', metadata: { is_handover: 'true' } },
    ]);
    if (csErr) throw csErr;

    // Insert conversations
    const { error: convErr } = await supabase.from('conversations').insert([
      { tenant_id: testTenantId, customer_phone: phoneA, is_paused: false, pause_reason: null, current_state: null, metadata: null },
      { tenant_id: testTenantId, customer_phone: phoneB, is_paused: true, pause_reason: 'HUMAN_HANDOVER', current_state: 'HUMAN_HANDOVER', metadata: { pause_reason: 'HUMAN_HANDOVER' } },
      { tenant_id: testTenantId, customer_phone: phoneC, is_paused: false, pause_reason: null, current_state: 'BOT_ACTIVE', metadata: {} },
      { tenant_id: testTenantId, customer_phone: phoneD, is_paused: true, pause_reason: null, current_state: 'HANDOVER', metadata: { is_handover: 'true' } },
    ]);
    if (convErr) throw convErr;

    console.log('  Created Session A: Fresh active bot session (pause_reason=null, current_state=null, metadata=null)');
    console.log('  Created Session B: Human Handover session (pause_reason="HUMAN_HANDOVER")');
    console.log('  Created Session C: Active session (pause_reason=null, metadata={})');
    console.log('  Created Session D: Handover session (current_state="HANDOVER", metadata->>is_handover="true")');

    // -------------------------------------------------------------------------
    // TEST 3: EXECUTE TENANT PAUSE (#off) AND VERIFY ANTI-NULL PRESERVATION
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Executing tenant-level PAUSE (#off) with scope="global"...');
    const { data: resPause, error: pErr } = await supabase.rpc('fn_toggle_bot_session_state', {
      p_tenant_id: testTenantSlug,
      p_scope: 'global',
      p_action: 'pause',
      p_is_paused: true,
      p_customer_phone: null,
      p_source: 'cto_node_test'
    });
    if (pErr) throw pErr;
    console.log('  RPC Pause Result:', resPause);
    if (!resPause.success || !resPause.bot_paused) throw new Error('Pause RPC did not return success!');

    const { data: sessionsAfterPause, error: qpErr } = await supabase
      .from('conversation_sessions')
      .select('user_identifier, is_paused, pause_reason, current_state')
      .eq('tenant_id', testTenantId);
    if (qpErr) throw qpErr;

    const pauseMap = Object.fromEntries(sessionsAfterPause.map(s => [s.user_identifier, s]));
    console.log('  Sessions after PAUSE:', pauseMap);

    // Session A (which had NULL values): Must be updated to TENANT_DISABLED!
    if (!pauseMap[phoneA].is_paused || pauseMap[phoneA].pause_reason !== 'TENANT_DISABLED') {
      throw new Error(`Session A was not updated properly to TENANT_DISABLED! Found: ${JSON.stringify(pauseMap[phoneA])}`);
    }
    // Session C: Must be updated to TENANT_DISABLED
    if (!pauseMap[phoneC].is_paused || pauseMap[phoneC].pause_reason !== 'TENANT_DISABLED') {
      throw new Error(`Session C was not updated properly to TENANT_DISABLED! Found: ${JSON.stringify(pauseMap[phoneC])}`);
    }
    // Session B: MUST REMAIN HUMAN_HANDOVER
    if (!pauseMap[phoneB].is_paused || pauseMap[phoneB].pause_reason !== 'HUMAN_HANDOVER') {
      throw new Error(`Session B HUMAN_HANDOVER was corrupted! Found: ${JSON.stringify(pauseMap[phoneB])}`);
    }
    // Session D: MUST REMAIN HANDOVER
    if (!pauseMap[phoneD].is_paused || pauseMap[phoneD].current_state !== 'HANDOVER') {
      throw new Error(`Session D HANDOVER was corrupted! Found: ${JSON.stringify(pauseMap[phoneD])}`);
    }
    console.log('=> TEST 3 PASSED: Session A (with NULLs) was updated to TENANT_DISABLED, while Session B & D were preserved in HANDOVER!');

    // -------------------------------------------------------------------------
    // TEST 4: EXECUTE TENANT RESUME (#on) AND VERIFY DECOUPLED CYCLE
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Executing tenant-level RESUME (#on) with scope="tenant"...');
    const { data: resResume, error: rErr } = await supabase.rpc('fn_toggle_bot_session_state', {
      p_tenant_id: testTenantSlug,
      p_scope: 'tenant',
      p_action: 'resume',
      p_is_paused: false,
      p_customer_phone: null,
      p_source: 'cto_node_test'
    });
    if (rErr) throw rErr;
    console.log('  RPC Resume Result:', resResume);
    if (!resResume.success || resResume.bot_paused) throw new Error('Resume RPC did not return success!');

    const { data: sessionsAfterResume, error: qrErr } = await supabase
      .from('conversation_sessions')
      .select('user_identifier, is_paused, pause_reason, current_state')
      .eq('tenant_id', testTenantId);
    if (qrErr) throw qrErr;

    const resumeMap = Object.fromEntries(sessionsAfterResume.map(s => [s.user_identifier, s]));
    console.log('  Sessions after RESUME:', resumeMap);

    // Session A: Reactivated to BOT_ACTIVE
    if (resumeMap[phoneA].is_paused || resumeMap[phoneA].pause_reason !== null || resumeMap[phoneA].current_state !== 'BOT_ACTIVE') {
      throw new Error(`Session A was not reactivated to BOT_ACTIVE! Found: ${JSON.stringify(resumeMap[phoneA])}`);
    }
    // Session C: Reactivated to BOT_ACTIVE
    if (resumeMap[phoneC].is_paused || resumeMap[phoneC].pause_reason !== null || resumeMap[phoneC].current_state !== 'BOT_ACTIVE') {
      throw new Error(`Session C was not reactivated to BOT_ACTIVE! Found: ${JSON.stringify(resumeMap[phoneC])}`);
    }
    // Session B: MUST REMAIN PAUSED IN HUMAN_HANDOVER!
    if (!resumeMap[phoneB].is_paused || resumeMap[phoneB].pause_reason !== 'HUMAN_HANDOVER') {
      throw new Error(`Session B was incorrectly reactivated! Found: ${JSON.stringify(resumeMap[phoneB])}`);
    }
    // Session D: MUST REMAIN PAUSED IN HANDOVER!
    if (!resumeMap[phoneD].is_paused || resumeMap[phoneD].current_state !== 'HANDOVER') {
      throw new Error(`Session D was incorrectly reactivated! Found: ${JSON.stringify(resumeMap[phoneD])}`);
    }
    console.log('=> TEST 4 PASSED: Resuming tenant reactivated Session A & C to BOT_ACTIVE, while Session B & D REMAINED HUMAN_HANDOVER!');

    // -------------------------------------------------------------------------
    // TEST 5: SCOPE 'session' / 'conversation' ATOMIC MUTATION
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing conversation-level mutation using scope="session"...');
    const { data: resConvPause, error: scErr } = await supabase.rpc('fn_toggle_bot_session_state', {
      p_tenant_id: testTenantId,
      p_scope: 'session',
      p_action: 'pause',
      p_is_paused: true,
      p_customer_phone: phoneA,
      p_source: 'cs_agent_node'
    });
    if (scErr) throw scErr;
    console.log('  RPC Conversation Pause Result:', resConvPause);
    if (!resConvPause.success || resConvPause.status !== 'HUMAN_HANDOVER') {
      throw new Error('Conversation pause did not return HUMAN_HANDOVER');
    }

    const { data: convA, error: qcA } = await supabase
      .from('conversation_sessions')
      .select('is_paused, pause_reason, current_state')
      .eq('tenant_id', testTenantId)
      .eq('user_identifier', phoneA)
      .single();
    if (qcA) throw qcA;

    if (!convA.is_paused || convA.pause_reason !== 'HUMAN_HANDOVER' || convA.current_state !== 'HUMAN_PAUSED') {
      throw new Error(`Single session mutation failed! Found: ${JSON.stringify(convA)}`);
    }
    console.log('=> TEST 5 PASSED: scope="session" correctly mutated single conversation to HUMAN_HANDOVER!');

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP] Cleaning up test records...');
    await supabase.from('conversation_sessions').delete().eq('tenant_id', testTenantId);
    await supabase.from('conversations').delete().eq('tenant_id', testTenantId);
    await supabase.from('tenants').delete().eq('id', testTenantId);
    console.log('=> Cleanup completed successfully.');

    console.log('\n' + '='.repeat(70));
    console.log('  ALL NODE.JS LIVE SUPABASE INTEGRATION TESTS PASSED 100%!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n[FATAL ERROR in Node.js Live Integration Test]:', err);
    try {
      await supabase.from('conversation_sessions').delete().eq('tenant_id', testTenantId);
      await supabase.from('conversations').delete().eq('tenant_id', testTenantId);
      await supabase.from('tenants').delete().eq('id', testTenantId);
    } catch (_) {}
    process.exit(1);
  }
}

runLiveTest();
