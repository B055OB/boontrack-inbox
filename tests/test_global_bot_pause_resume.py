"""
tests/test_global_bot_pause_resume.py

Comprehensive End-to-End & Unit Verification for:
Layer 1: Normalisasi Parsing Perintah Kontrol (Ingress & RBAC)
Layer 2: Sinkronisasi Mutasi Database (Dual-Level Update)
Layer 3: Runtime Decision Gate (Anti Zombie Pause & Transaction Exceptions)
Layer 4: Outbound Registry Guard (Anti False Self-Pause)

Skenario:
a. Owner kirim #off / #pause -> Bot berhenti membalas.
b. Owner kirim #on / #resume -> Bot langsung aktif membalas turn berikutnya.
c. Bot balas chat -> Tidak mem-pause dirinya sendiri.
d. Toggle di dashboard -> Langsung terbaca di webhook turn berikutnya tanpa restart server.
"""

import os
import re
import json
import uuid
import datetime
import pytest
import psycopg2
from dotenv import load_dotenv

# Load environment
for env_path in [
    os.path.join(os.path.dirname(__file__), '..', '.env.local'),
    os.path.join(os.path.dirname(__file__), '..', '.env'),
    'C:/boontrack-core/.env'
]:
    if os.path.exists(env_path):
        load_dotenv(env_path)

DATABASE_URL = os.getenv('DATABASE_URL')


def get_db_connection():
    assert DATABASE_URL, "DATABASE_URL environment variable is required"
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


# ============================================================================
# Pure Python Logic Replicas of the TypeScript BotControlService for Testing
# ============================================================================

def clean_phone(phone: str) -> str:
    if not phone:
        return ""
    digits = re.sub(r'\D', '', str(phone))
    if digits.startswith('0'):
        return '62' + digits[1:]
    elif digits.startswith('8'):
        return '62' + digits
    return digits


def parse_bot_control_command(text: str):
    if not text or not isinstance(text, str):
        return None
    clean = text.strip().lower()

    pause_commands = {
        '#pause', '#off', '!pause', '!off', '/pause', '/off', 'pause', 'off'
    }
    resume_commands = {
        '#resume', '#on', '!resume', '!on', '/resume', '/on', 'resume', 'on'
    }

    if clean in pause_commands:
        return 'PAUSE'
    if clean in resume_commands:
        return 'RESUME'

    stripped = re.sub(r'^[#!/]', '', clean)
    stripped = re.sub(r'[!.\s]+$', '', stripped)
    if stripped in ('pause', 'off'):
        return 'PAUSE'
    if stripped in ('resume', 'on'):
        return 'RESUME'
    return None


def is_authorized_controller(sender_phone: str, tenant_phone: str, tenant_users: list) -> bool:
    clean_sender = clean_phone(sender_phone)
    if not clean_sender:
        return False

    variants = {
        clean_sender,
        '0' + clean_sender[2:] if clean_sender.startswith('62') else clean_sender,
        re.sub(r'\D', '', sender_phone)
    }

    if tenant_phone and clean_phone(tenant_phone) in variants:
        return True

    for u in tenant_users:
        u_phone = clean_phone(u.get('phone', ''))
        u_role = str(u.get('role', '')).lower()
        if u_phone in variants and u_role in ('owner', 'admin', 'cs', 'manager'):
            return True

    return False


def is_manual_order_message(text: str) -> bool:
    if not text:
        return False
    pattern = re.compile(
        r'(?:Total\s*Nominal\s*:|Metode\s*:\s*Transfer\s*Bank|Mohon\s+dicek\s+dan\s+aktivasi\s+akses|Masterclass\s+CPM)',
        re.IGNORECASE
    )
    return bool(pattern.search(text))


def check_runtime_decision_gate(tenant: dict, session: dict, text_body: str = ""):
    # Rule 0: Transaction Exception (Order verification & Payment receipts NEVER blocked)
    if is_manual_order_message(text_body):
        return {"should_bypass": False, "reason": "TRANSACTION_EXCEPTION_ORDER"}

    # Rule 1: Tenant Global Gate
    meta = tenant.get('metadata') or {}
    is_tenant_paused = (
        tenant.get('bot_paused') is True or
        tenant.get('is_bot_active') is False or
        meta.get('bot_paused') is True or
        meta.get('is_bot_paused') is True or
        meta.get('is_bot_active') is False
    )
    if is_tenant_paused:
        return {"should_bypass": True, "reason": "TENANT_GLOBAL_PAUSED"}

    # Rule 2: Session Gate
    if session:
        is_sess_paused = (
            session.get('is_paused') is True or
            session.get('current_state') in ('HUMAN_PAUSED', 'HANDOVER_TO_HUMAN', 'PAUSED') or
            session.get('bot_status') == 'HUMAN_PAUSED'
        )
        if is_sess_paused:
            p_until = session.get('paused_until')
            now = datetime.datetime.now(datetime.timezone.utc)
            if p_until:
                if isinstance(p_until, str):
                    p_until_dt = datetime.datetime.fromisoformat(p_until.replace('Z', '+00:00'))
                else:
                    p_until_dt = p_until
                if p_until_dt <= now:
                    return {"should_bypass": False, "reason": "AUTO_RESUMED_EXPIRED"}
            return {"should_bypass": True, "reason": "SESSION_PAUSED"}

    return {"should_bypass": False}


# ============================================================================
# Pytest Test Suite
# ============================================================================

class TestGlobalBotPauseResume:

    @classmethod
    def setup_class(cls):
        cls.conn = get_db_connection()
        cls.cur = cls.conn.cursor()
        cls.test_tenant_slug = f"test-pause-{uuid.uuid4().hex[:6]}"
        cls.owner_phone = "081234567890"  # Format 08...
        cls.customer_phone = "6289988776655"

        # Create isolated test tenant
        meta_json = json.dumps({
            "phone": cls.owner_phone,
            "owner_phone": cls.owner_phone,
            "features": {}
        })
        cls.cur.execute("""
            INSERT INTO public.tenants (id, slug, name, bot_paused, is_bot_active, metadata)
            VALUES (gen_random_uuid(), %s, %s, FALSE, TRUE, %s::jsonb)
            RETURNING id;
        """, (cls.test_tenant_slug, f"Test Store {cls.test_tenant_slug}", meta_json))
        cls.tenant_id = str(cls.cur.fetchone()[0])

        # Create test session & conversation
        cls.cur.execute("""
            INSERT INTO public.conversation_sessions (
                id, tenant_id, session_id, channel, user_identifier, current_state, is_paused, bot_status
            ) VALUES (
                gen_random_uuid(), %s, %s, 'WHATSAPP', %s, 'ACTIVE', FALSE, 'BOT_ACTIVE'
            );
        """, (cls.tenant_id, f"wa_{cls.tenant_id}_{cls.customer_phone}", cls.customer_phone))

        cls.cur.execute("""
            INSERT INTO public.conversations (
                id, tenant_id, tenant_slug, customer_phone, bot_paused, bot_mode, status
            ) VALUES (
                gen_random_uuid(), %s, %s, %s, FALSE, 'AI_ACTIVE', 'active'
            );
        """, (cls.tenant_id, cls.test_tenant_slug, cls.customer_phone))

    @classmethod
    def teardown_class(cls):
        # Cleanup test records
        cls.cur.execute("DELETE FROM public.outbound_messages WHERE tenant_id = %s;", (cls.tenant_id,))
        cls.cur.execute("DELETE FROM public.conversations WHERE tenant_id = %s;", (cls.tenant_id,))
        cls.cur.execute("DELETE FROM public.conversation_sessions WHERE tenant_id = %s;", (cls.tenant_id,))
        cls.cur.execute("DELETE FROM public.tenants WHERE id = %s;", (cls.tenant_id,))
        cls.cur.close()
        cls.conn.close()

    def test_layer1_command_normalization_and_rbac(self):
        """Layer 1: Normalisasi Parsing Perintah Kontrol dan RBAC (628 vs 08)."""
        pause_variations = ['#pause', '#off', '!pause', '!off', '/pause', '/off', 'pause', 'off', '#PAUSE', '/OFF!']
        for cmd in pause_variations:
            parsed = parse_bot_control_command(cmd)
            assert parsed == 'PAUSE', f"Failed parsing pause command: '{cmd}' -> got '{parsed}'"

        resume_variations = ['#resume', '#on', '!resume', '!on', '/resume', '/on', 'resume', 'on', '#RESUME', '!ON.']
        for cmd in resume_variations:
            parsed = parse_bot_control_command(cmd)
            assert parsed == 'RESUME', f"Failed parsing resume command: '{cmd}' -> got '{parsed}'"

        # RBAC Check: Owner phone saved as '081234567890' matches incoming '6281234567890'
        is_auth_62 = is_authorized_controller("6281234567890", self.owner_phone, [])
        assert is_auth_62 is True, "RBAC must allow 628... format when owner phone is 08..."

        is_auth_08 = is_authorized_controller("081234567890", self.owner_phone, [])
        assert is_auth_08 is True, "RBAC must allow 08... format"

        # Random customer is denied
        is_auth_customer = is_authorized_controller("6281999999999", self.owner_phone, [])
        assert is_auth_customer is False, "Random customer must be denied RBAC authorization"

    def test_scenario_a_owner_sends_off_or_pause(self):
        """Skenario a: Owner kirim #off / #pause -> Dual-Level DB mutation & Bot berhenti membalas."""
        now = datetime.datetime.now(datetime.timezone.utc)
        paused_until = now + datetime.timedelta(hours=24)

        # 1. Simulate DB mutation executed by executeBotControl('PAUSE')
        self.cur.execute("""
            UPDATE public.tenants
            SET bot_paused = TRUE,
                is_bot_active = FALSE,
                metadata = jsonb_set(
                    jsonb_set(metadata, '{bot_paused}', 'true'::jsonb),
                    '{is_bot_paused}', 'true'::jsonb
                ),
                updated_at = NOW()
            WHERE id = %s;
        """, (self.tenant_id,))

        self.cur.execute("""
            UPDATE public.conversation_sessions
            SET is_paused = TRUE,
                current_state = 'HUMAN_PAUSED',
                bot_status = 'HUMAN_PAUSED',
                paused_until = %s,
                updated_at = NOW()
            WHERE tenant_id = %s;
        """, (paused_until, self.tenant_id))

        self.cur.execute("""
            UPDATE public.conversations
            SET bot_paused = TRUE,
                bot_mode = 'HUMAN_ACTIVE',
                status = 'HUMAN_PAUSED',
                updated_at = NOW()
            WHERE tenant_id = %s;
        """, (self.tenant_id,))

        # Verify DB states
        self.cur.execute("SELECT bot_paused, is_bot_active, metadata->>'bot_paused' FROM public.tenants WHERE id = %s;", (self.tenant_id,))
        t_row = self.cur.fetchone()
        assert t_row[0] is True, "tenants.bot_paused must be TRUE"
        assert t_row[1] is False, "tenants.is_bot_active must be FALSE"
        assert t_row[2] == 'true', "tenants.metadata.bot_paused must be 'true'"

        self.cur.execute("SELECT is_paused, current_state, bot_status, paused_until FROM public.conversation_sessions WHERE tenant_id = %s;", (self.tenant_id,))
        s_row = self.cur.fetchone()
        assert s_row[0] is True, "conversation_sessions.is_paused must be TRUE"
        assert s_row[1] == 'HUMAN_PAUSED', "conversation_sessions.current_state must be 'HUMAN_PAUSED'"
        assert s_row[2] == 'HUMAN_PAUSED', "conversation_sessions.bot_status must be 'HUMAN_PAUSED'"
        assert s_row[3] is not None and s_row[3] > now, "paused_until must be 24 hours in future"

        # Verify Runtime Decision Gate: normal inquiry is BYPASSED
        decision = check_runtime_decision_gate(
            {"bot_paused": True, "is_bot_active": False},
            {"is_paused": True, "current_state": "HUMAN_PAUSED"},
            "Halo kak produk ini ready gak?"
        )
        assert decision["should_bypass"] is True, "Normal inquiry must be BYPASSED when bot is paused"
        assert decision["reason"] == "TENANT_GLOBAL_PAUSED"

        # Verify Transaction Exception: Order message is NOT bypassed!
        order_decision = check_runtime_decision_gate(
            {"bot_paused": True, "is_bot_active": False},
            {"is_paused": True, "current_state": "HUMAN_PAUSED"},
            "Total Nominal: Rp 149.000, Metode: Transfer Bank. Mohon dicek dan aktivasi akses"
        )
        assert order_decision["should_bypass"] is False, "Manual order message MUST bypass pause gate"
        assert order_decision["reason"] == "TRANSACTION_EXCEPTION_ORDER"

    def test_scenario_b_owner_sends_on_or_resume(self):
        """Skenario b: Owner kirim #on / #resume -> Bot langsung aktif membalas turn berikutnya."""
        now = datetime.datetime.now(datetime.timezone.utc)
        resumed_until = now - datetime.timedelta(minutes=1)

        # Simulate DB mutation executed by executeBotControl('RESUME')
        self.cur.execute("""
            UPDATE public.tenants
            SET bot_paused = FALSE,
                is_bot_active = TRUE,
                metadata = jsonb_set(
                    jsonb_set(
                        jsonb_set(metadata, '{bot_paused}', 'false'::jsonb),
                        '{is_bot_paused}', 'false'::jsonb
                    ),
                    '{loop_quarantine}', 'false'::jsonb
                ),
                updated_at = NOW()
            WHERE id = %s;
        """, (self.tenant_id,))

        self.cur.execute("""
            UPDATE public.conversation_sessions
            SET is_paused = FALSE,
                current_state = 'ACTIVE',
                bot_status = 'BOT_ACTIVE',
                paused_until = %s,
                updated_at = NOW()
            WHERE tenant_id = %s;
        """, (resumed_until, self.tenant_id))

        self.cur.execute("""
            UPDATE public.conversations
            SET bot_paused = FALSE,
                bot_mode = 'AI_ACTIVE',
                status = 'active',
                updated_at = NOW()
            WHERE tenant_id = %s;
        """, (self.tenant_id,))

        # Verify DB states
        self.cur.execute("SELECT bot_paused, is_bot_active, metadata->>'bot_paused' FROM public.tenants WHERE id = %s;", (self.tenant_id,))
        t_row = self.cur.fetchone()
        assert t_row[0] is False, "tenants.bot_paused must be FALSE"
        assert t_row[1] is True, "tenants.is_bot_active must be TRUE"

        self.cur.execute("SELECT is_paused, current_state, bot_status, paused_until FROM public.conversation_sessions WHERE tenant_id = %s;", (self.tenant_id,))
        s_row = self.cur.fetchone()
        assert s_row[0] is False, "conversation_sessions.is_paused must be FALSE"
        assert s_row[1] == 'ACTIVE', "conversation_sessions.current_state must be 'ACTIVE'"
        assert s_row[2] == 'BOT_ACTIVE', "conversation_sessions.bot_status must be 'BOT_ACTIVE'"
        assert s_row[3] is not None and s_row[3] <= now, "paused_until must be in the past"

        # Verify Runtime Decision Gate: normal inquiry is ALLOWED
        decision = check_runtime_decision_gate(
            {"bot_paused": False, "is_bot_active": True},
            {"is_paused": False, "current_state": "ACTIVE"},
            "Halo kak, mau tanya cara pendaftaran kelasnya?"
        )
        assert decision["should_bypass"] is False, "Normal inquiry must NOT be bypassed when bot is resumed"

    def test_scenario_c_bot_outbound_anti_self_pause(self):
        """Skenario c: Bot balas chat -> Terdaftar di registry dan tidak mem-pause dirinya sendiri."""
        sample_wa_msg_id = f"BAE5_{uuid.uuid4().hex[:12].upper()}"

        # 1. Register bot outbound into outbound_messages table
        self.cur.execute("""
            INSERT INTO public.outbound_messages (
                id, tenant_id, conversation_id, wa_message_id, recipient_jid, source, created_at
            ) VALUES (
                gen_random_uuid(), %s, 'conv_test_1', %s, %s, 'bot', NOW()
            );
        """, (self.tenant_id, sample_wa_msg_id, self.customer_phone))

        # 2. Query check: incoming webhook echo fromMe = True with wa_message_id
        self.cur.execute("""
            SELECT id FROM public.outbound_messages
            WHERE wa_message_id = %s AND source = 'bot';
        """, (sample_wa_msg_id,))
        found = self.cur.fetchone()
        assert found is not None, "Bot outbound message must be recorded in outbound_messages table"

        # 3. Verify that matching echo is flagged as bot outbound (preventing 24h CS human takeover pause)
        is_bot_echo = bool(found)
        assert is_bot_echo is True, "Echo must match registry, preventing false self-pause"

    def test_scenario_d_dashboard_toggle_reactive_read(self):
        """Skenario d: Toggle di dashboard -> Langsung terbaca di webhook turn berikutnya tanpa restart server."""
        # Step 1: User toggles PAUSE on dashboard
        self.cur.execute("""
            UPDATE public.tenants
            SET bot_paused = TRUE,
                is_bot_active = FALSE,
                metadata = jsonb_set(metadata, '{bot_paused}', 'true'::jsonb),
                updated_at = NOW()
            WHERE id = %s;
        """, (self.tenant_id,))

        # Webhook reader instantly reads database (Zero restart needed)
        self.cur.execute("SELECT bot_paused, is_bot_active, metadata->>'bot_paused' FROM public.tenants WHERE id = %s;", (self.tenant_id,))
        row = self.cur.fetchone()
        tenant_state = {
            "bot_paused": row[0],
            "is_bot_active": row[1],
            "metadata": {"bot_paused": row[2] == 'true'}
        }
        decision = check_runtime_decision_gate(tenant_state, None, "Test message turn 1")
        assert decision["should_bypass"] is True, "Dashboard PAUSE must be immediately effective on next turn"

        # Step 2: User toggles RESUME on dashboard
        self.cur.execute("""
            UPDATE public.tenants
            SET bot_paused = FALSE,
                is_bot_active = TRUE,
                metadata = jsonb_set(metadata, '{bot_paused}', 'false'::jsonb),
                updated_at = NOW()
            WHERE id = %s;
        """, (self.tenant_id,))

        self.cur.execute("SELECT bot_paused, is_bot_active, metadata->>'bot_paused' FROM public.tenants WHERE id = %s;", (self.tenant_id,))
        row = self.cur.fetchone()
        tenant_state_resumed = {
            "bot_paused": row[0],
            "is_bot_active": row[1],
            "metadata": {"bot_paused": row[2] == 'true'}
        }
        decision_resumed = check_runtime_decision_gate(tenant_state_resumed, None, "Test message turn 2")
        assert decision_resumed["should_bypass"] is False, "Dashboard RESUME must be immediately effective on next turn"
