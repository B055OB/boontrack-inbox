import os, psycopg2, json, uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
load_dotenv('.env.local')
load_dotenv('.env')

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print("[ERROR] DATABASE_URL not found!")
    exit(1)

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

print("=" * 70)
print("  RUNNING LIVE DATABASE INTEGRATION TEST: RPC ANTI-NULL & VALIDATION")
print("=" * 70)

test_tenant_slug = f"anti-null-tenant-{int(datetime.now().timestamp())}"
test_tenant_id = str(uuid.uuid4())

try:
    # -------------------------------------------------------------------------
    # TEST 1: EXPLICIT INPUT PARAMETER VALIDATION (NULL & INVALID VALUES)
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Testing Explicit Input Parameter Validation & Contradiction Guards...")

    validation_cases = [
        # (tenant_id, scope, action, is_paused, expected_err_keyword)
        (None, 'tenant', 'PAUSE', True, 'INVALID_TENANT_ID'),
        ('', 'tenant', 'PAUSE', True, 'INVALID_TENANT_ID'),
        (test_tenant_id, None, 'PAUSE', True, 'INVALID_SCOPE'),
        (test_tenant_id, 'invalid_scope', 'PAUSE', True, 'INVALID_SCOPE'),
        (test_tenant_id, 'tenant', None, True, 'INVALID_ACTION'),
        (test_tenant_id, 'tenant', 'invalid_action', True, 'INVALID_ACTION'),
        (test_tenant_id, 'tenant', 'PAUSE', None, 'INVALID_IS_PAUSED'),
        (test_tenant_id, 'tenant', 'PAUSE', False, 'CONTRADICTION'),
        (test_tenant_id, 'tenant', 'RESUME', True, 'CONTRADICTION'),
        (test_tenant_id, 'global', 'pause', False, 'CONTRADICTION'),
        (test_tenant_id, 'session', 'resume', True, 'CONTRADICTION'),
    ]

    for t_id, sc, act, is_p, expected_err in validation_cases:
        try:
            cur.execute("""
                SELECT public.fn_toggle_bot_session_state(%s, %s, %s, %s);
            """, (t_id, sc, act, is_p))
            # If no exception raised, fail
            print(f"  FAILED: Expected exception containing '{expected_err}' for params ({t_id}, {sc}, {act}, {is_p}), but call succeeded!")
            exit(1)
        except Exception as e:
            err_msg = str(e)
            if expected_err in err_msg:
                print(f"  OK: Correctly rejected ({t_id}, {sc}, {act}, {is_p}) -> {expected_err}")
            else:
                print(f"  FAILED: Unexpected error message: {err_msg} (expected {expected_err})")
                exit(1)

    print("=> TEST 1 PASSED: All NULL and invalid parameters were strictly rejected with exceptions!")

    # -------------------------------------------------------------------------
    # TEST 2: SETUP TENANT AND SESSIONS WITH NULL VALUES
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Setting up live tenant and sessions with NULL data values...")
    cur.execute("""
        INSERT INTO public.tenants (
            id, slug, name, tier, subscription_tier, status, is_active, bot_paused, is_bot_active, metadata
        ) VALUES (
            %s, %s, %s, 'ADS_PERFORMANCE', 'ADS_PERFORMANCE', 'active', true, false, true, '{}'::jsonb
        );
    """, (test_tenant_id, test_tenant_slug, "Test Anti-NULL Tenant"))

    phone_a = "628111111111"  # Fresh session with NULL pause_reason, NULL current_state, NULL metadata
    phone_b = "628222222222"  # Handover session with pause_reason = 'HUMAN_HANDOVER'
    phone_c = "628333333333"  # Active session with empty metadata
    phone_d = "628444444444"  # Handover session with metadata is_handover = 'true'

    # Insert into conversation_sessions with intentional NULLs
    cur.execute("""
        INSERT INTO public.conversation_sessions (
            tenant_id, session_id, channel, user_identifier, is_paused, pause_reason, current_state, metadata
        ) VALUES
        (%s, %s, 'WHATSAPP', %s, false, NULL, NULL, NULL),
        (%s, %s, 'WHATSAPP', %s, true, 'HUMAN_HANDOVER', 'HUMAN_HANDOVER', '{"pause_reason": "HUMAN_HANDOVER"}'::jsonb),
        (%s, %s, 'WHATSAPP', %s, false, NULL, 'BOT_ACTIVE', '{}'::jsonb),
        (%s, %s, 'WHATSAPP', %s, true, NULL, 'HANDOVER', '{"is_handover": "true"}'::jsonb);
    """, (
        test_tenant_id, f"wa_{test_tenant_id}_{phone_a}", phone_a,
        test_tenant_id, f"wa_{test_tenant_id}_{phone_b}", phone_b,
        test_tenant_id, f"wa_{test_tenant_id}_{phone_c}", phone_c,
        test_tenant_id, f"wa_{test_tenant_id}_{phone_d}", phone_d,
    ))

    # Insert into conversations with intentional NULLs
    cur.execute("""
        INSERT INTO public.conversations (
            tenant_id, customer_phone, is_paused, pause_reason, current_state, metadata
        ) VALUES
        (%s, %s, false, NULL, NULL, NULL),
        (%s, %s, true, 'HUMAN_HANDOVER', 'HUMAN_HANDOVER', '{"pause_reason": "HUMAN_HANDOVER"}'::jsonb),
        (%s, %s, false, NULL, 'BOT_ACTIVE', '{}'::jsonb),
        (%s, %s, true, NULL, 'HANDOVER', '{"is_handover": "true"}'::jsonb);
    """, (
        test_tenant_id, phone_a,
        test_tenant_id, phone_b,
        test_tenant_id, phone_c,
        test_tenant_id, phone_d,
    ))

    print("  Created Session A: Fresh active bot session (pause_reason=NULL, current_state=NULL, metadata=NULL)")
    print("  Created Session B: Human Handover session (pause_reason='HUMAN_HANDOVER')")
    print("  Created Session C: Active session (pause_reason=NULL, metadata={})")
    print("  Created Session D: Handover session (current_state='HANDOVER', metadata->>'is_handover'='true')")

    # -------------------------------------------------------------------------
    # TEST 3: EXECUTE TENANT PAUSE (#off) AND VERIFY ANTI-NULL PRESERVATION
    # -------------------------------------------------------------------------
    print("\n[TEST 3] Executing tenant-level PAUSE (#off) with scope='global'...")
    cur.execute("""
        SELECT public.fn_toggle_bot_session_state(%s, 'global', 'pause', true, NULL, 'cto_test');
    """, (test_tenant_slug,))
    res_pause = cur.fetchone()[0]
    print("  RPC Pause Result:", res_pause)
    assert res_pause.get("success") is True
    assert res_pause.get("bot_paused") is True

    # Check sessions in DB
    cur.execute("""
        SELECT user_identifier, is_paused, pause_reason, current_state 
        FROM public.conversation_sessions 
        WHERE tenant_id = %s ORDER BY user_identifier;
    """, (test_tenant_id,))
    sessions_after_pause = {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}
    print("  Sessions after PAUSE:", sessions_after_pause)

    # Session A (which had NULL values): Must be successfully updated to TENANT_DISABLED!
    # (In old vulnerable query, NOT (NULL) became NULL and Session A was NEVER updated!)
    assert sessions_after_pause[phone_a][0] is True, "Session A is_paused must be TRUE"
    assert sessions_after_pause[phone_a][1] == 'TENANT_DISABLED', "Session A pause_reason must be 'TENANT_DISABLED'"

    # Session C: Must be updated to TENANT_DISABLED
    assert sessions_after_pause[phone_c][0] is True, "Session C is_paused must be TRUE"
    assert sessions_after_pause[phone_c][1] == 'TENANT_DISABLED', "Session C pause_reason must be 'TENANT_DISABLED'"

    # Session B: MUST BE PRESERVED as HUMAN_HANDOVER!
    assert sessions_after_pause[phone_b][0] is True, "Session B is_paused must be TRUE"
    assert sessions_after_pause[phone_b][1] == 'HUMAN_HANDOVER', "Session B pause_reason must remain 'HUMAN_HANDOVER'"

    # Session D: MUST BE PRESERVED as HANDOVER!
    assert sessions_after_pause[phone_d][0] is True, "Session D is_paused must be TRUE"
    assert sessions_after_pause[phone_d][2] == 'HANDOVER', "Session D current_state must remain 'HANDOVER'"

    print("=> TEST 3 PASSED: Session A (with NULLs) was updated to TENANT_DISABLED, while Session B & D were preserved in HANDOVER!")

    # -------------------------------------------------------------------------
    # TEST 4: EXECUTE TENANT RESUME (#on) AND VERIFY DECOUPLED CYCLE
    # -------------------------------------------------------------------------
    print("\n[TEST 4] Executing tenant-level RESUME (#on) with scope='tenant'...")
    cur.execute("""
        SELECT public.fn_toggle_bot_session_state(%s, 'tenant', 'resume', false, NULL, 'cto_test');
    """, (test_tenant_slug,))
    res_resume = cur.fetchone()[0]
    print("  RPC Resume Result:", res_resume)
    assert res_resume.get("success") is True
    assert res_resume.get("bot_paused") is False

    # Check sessions in DB
    cur.execute("""
        SELECT user_identifier, is_paused, pause_reason, current_state 
        FROM public.conversation_sessions 
        WHERE tenant_id = %s ORDER BY user_identifier;
    """, (test_tenant_id,))
    sessions_after_resume = {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}
    print("  Sessions after RESUME:", sessions_after_resume)

    # Session A: Must be reactivated to BOT_ACTIVE
    assert sessions_after_resume[phone_a][0] is False, "Session A is_paused must be FALSE"
    assert sessions_after_resume[phone_a][1] is None, "Session A pause_reason must be NULL"
    assert sessions_after_resume[phone_a][2] == 'BOT_ACTIVE', "Session A current_state must be 'BOT_ACTIVE'"

    # Session C: Must be reactivated to BOT_ACTIVE
    assert sessions_after_resume[phone_c][0] is False, "Session C is_paused must be FALSE"
    assert sessions_after_resume[phone_c][1] is None, "Session C pause_reason must be NULL"

    # Session B: MUST REMAIN PAUSED IN HUMAN_HANDOVER! (Not overwritten by tenant #on)
    assert sessions_after_resume[phone_b][0] is True, "Session B MUST REMAIN PAUSED"
    assert sessions_after_resume[phone_b][1] == 'HUMAN_HANDOVER', "Session B MUST REMAIN 'HUMAN_HANDOVER'"

    # Session D: MUST REMAIN PAUSED IN HANDOVER! (Not overwritten by tenant #on)
    assert sessions_after_resume[phone_d][0] is True, "Session D MUST REMAIN PAUSED"

    print("=> TEST 4 PASSED: Resuming tenant reactivated Session A & C to BOT_ACTIVE, while Session B & D REMAINED HUMAN_HANDOVER!")

    # -------------------------------------------------------------------------
    # TEST 5: SCOPE 'conversation' / 'session' ATOMIC MUTATION
    # -------------------------------------------------------------------------
    print("\n[TEST 5] Testing conversation-level mutation using scope='session'...")
    cur.execute("""
        SELECT public.fn_toggle_bot_session_state(%s, 'session', 'pause', true, %s, 'cs_agent');
    """, (test_tenant_id, phone_a))
    res_conv_pause = cur.fetchone()[0]
    print("  RPC Conversation Pause Result:", res_conv_pause)
    assert res_conv_pause.get("success") is True
    assert res_conv_pause.get("status") == 'HUMAN_HANDOVER'

    cur.execute("""
        SELECT is_paused, pause_reason, current_state 
        FROM public.conversation_sessions 
        WHERE tenant_id = %s AND user_identifier = %s;
    """, (test_tenant_id, phone_a))
    row_a = cur.fetchone()
    assert row_a[0] is True
    assert row_a[1] == 'HUMAN_HANDOVER'
    assert row_a[2] == 'HUMAN_PAUSED'
    print("=> TEST 5 PASSED: scope='session' correctly mutated single conversation to HUMAN_HANDOVER!")

    # -------------------------------------------------------------------------
    # CLEANUP
    # -------------------------------------------------------------------------
    print("\n[CLEANUP] Cleaning up test records...")
    cur.execute("DELETE FROM public.conversation_sessions WHERE tenant_id = %s;", (test_tenant_id,))
    cur.execute("DELETE FROM public.conversations WHERE tenant_id = %s;", (test_tenant_id,))
    cur.execute("DELETE FROM public.tenants WHERE id = %s;", (test_tenant_id,))
    print("=> Cleanup completed successfully.")

    print("\n" + "=" * 70)
    print("  ALL LIVE DB INTEGRATION TESTS PASSED 100%!")
    print("=" * 70)

except Exception as err:
    print(f"\n[FATAL ERROR in Live Integration Test]: {err}")
    # Attempt cleanup on error
    try:
        cur.execute("DELETE FROM public.conversation_sessions WHERE tenant_id = %s;", (test_tenant_id,))
        cur.execute("DELETE FROM public.conversations WHERE tenant_id = %s;", (test_tenant_id,))
        cur.execute("DELETE FROM public.tenants WHERE id = %s;", (test_tenant_id,))
    except:
        pass
    exit(1)
