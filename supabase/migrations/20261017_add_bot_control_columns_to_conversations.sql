-- Migration: 20261017_add_bot_control_columns_to_conversations.sql
-- Description: Adds bot control columns (paused_until, last_state_updated_by, is_bot_active, is_paused, is_bot_paused)
--              to conversations table for unified SSOT state machine, completes conversation_sessions schema,
--              and synchronizes fn_toggle_bot_session_state RPC with Anti-NULL predicates & explicit input validation.

ALTER TABLE IF EXISTS public.conversations
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_state_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS is_bot_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_bot_paused BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_state TEXT DEFAULT 'ACTIVE';

ALTER TABLE IF EXISTS public.conversation_sessions
  ADD COLUMN IF NOT EXISTS pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_state TEXT DEFAULT 'BOT_ACTIVE',
  ADD COLUMN IF NOT EXISTS bot_status TEXT DEFAULT 'BOT_ACTIVE',
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_by TEXT;

ALTER TABLE IF EXISTS public.conversation_sessions
  ALTER COLUMN current_state DROP NOT NULL;

-- Update fn_toggle_bot_session_state to persist paused_until, last_state_updated_by, and pause_reason
CREATE OR REPLACE FUNCTION public.fn_toggle_bot_session_state(
    p_tenant_id TEXT,
    p_scope TEXT,
    p_action TEXT,
    p_is_paused BOOLEAN,
    p_customer_phone TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'system',
    p_paused_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_tenant_uuid UUID;
    v_clean_phone TEXT;
    v_tenant_status TEXT;
    v_conv_status TEXT;
    v_pause_reason TEXT;
    v_norm_scope TEXT;
    v_norm_action TEXT;
BEGIN
    -- 0. Explicit Input Parameter Validation & Anti-NULL Guards (CTO War Room Clearance)
    IF p_tenant_id IS NULL OR TRIM(p_tenant_id) = '' THEN
        RAISE EXCEPTION 'INVALID_TENANT_ID: tenant_id cannot be NULL or empty';
    END IF;

    IF p_scope IS NULL OR LOWER(TRIM(p_scope)) NOT IN ('session', 'conversation', 'global', 'tenant') THEN
        RAISE EXCEPTION 'INVALID_SCOPE: %', p_scope;
    END IF;

    IF p_action IS NULL OR LOWER(TRIM(p_action)) NOT IN ('pause', 'resume') THEN
        RAISE EXCEPTION 'INVALID_ACTION: %', p_action;
    END IF;

    IF p_is_paused IS NULL THEN
        RAISE EXCEPTION 'INVALID_IS_PAUSED: p_is_paused cannot be NULL';
    END IF;

    v_norm_scope := CASE 
        WHEN LOWER(TRIM(p_scope)) IN ('global', 'tenant') THEN 'tenant'
        ELSE 'conversation'
    END;
    v_norm_action := UPPER(TRIM(p_action));

    IF (v_norm_action = 'PAUSE' AND p_is_paused IS FALSE) OR (v_norm_action = 'RESUME' AND p_is_paused IS TRUE) THEN
        RAISE EXCEPTION 'CONTRADICTION: action % conflicts with is_paused %', p_action, p_is_paused;
    END IF;

    -- 1. Resolve tenant UUID (support slug or UUID string)
    BEGIN
        v_tenant_uuid := p_tenant_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        SELECT id INTO v_tenant_uuid FROM public.tenants WHERE slug = p_tenant_id LIMIT 1;
    END;

    IF v_tenant_uuid IS NULL THEN
        SELECT id INTO v_tenant_uuid FROM public.tenants WHERE id::TEXT = p_tenant_id OR slug = p_tenant_id LIMIT 1;
    END IF;

    IF v_tenant_uuid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tenant not found: ' || p_tenant_id
        );
    END IF;

    v_tenant_status := CASE WHEN p_is_paused THEN 'BOT_DISABLED' ELSE 'BOT_ACTIVE' END;
    v_conv_status := CASE WHEN p_is_paused THEN 'HUMAN_HANDOVER' ELSE 'AI_ACTIVE' END;
    v_pause_reason := CASE 
        WHEN p_is_paused THEN
            CASE WHEN v_norm_scope = 'tenant' THEN 'TENANT_DISABLED' ELSE 'HUMAN_HANDOVER' END
        ELSE NULL
    END;

    -- =========================================================================
    -- SCOPE A: TENANT-LEVEL ATOMIC MUTATION (TENANT / GLOBAL)
    -- =========================================================================
    IF v_norm_scope = 'tenant' THEN
        -- 1. Mutate tenants table atomically, synchronizing all metadata flags
        UPDATE public.tenants
        SET bot_paused = p_is_paused,
            is_bot_active = NOT p_is_paused,
            metadata = COALESCE(metadata, '{}'::jsonb) || (
                CASE WHEN p_is_paused THEN
                    jsonb_build_object(
                        'bot_status', v_tenant_status,
                        'bot_paused', true,
                        'is_bot_paused', true,
                        'is_bot_active', false,
                        'paused_at', v_now,
                        'paused_by', p_source,
                        'paused_until', p_paused_until,
                        'pause_reason', 'TENANT_DISABLED',
                        'paused_reason', 'TENANT_DISABLED',
                        'last_state_updated_by', p_source
                    )
                ELSE
                    jsonb_build_object(
                        'bot_status', v_tenant_status,
                        'bot_paused', false,
                        'is_bot_paused', false,
                        'is_bot_active', true,
                        'resumed_at', v_now,
                        'resumed_by', p_source,
                        'pause_reason', NULL,
                        'paused_reason', NULL,
                        'last_state_updated_by', p_source,
                        'loop_quarantine', false,
                        'is_quarantined', false,
                        'quarantined', false
                    )
                END
            ),
            updated_at = v_now
        WHERE id = v_tenant_uuid;

        -- 2. Synchronize conversation_sessions & conversations ONLY WHEN PAUSING TENANT (#off)
        -- ARCHITECTURAL INVARIANT (2-Dimensional Hierarchy Decoupling):
        -- When resuming at tenant level (#on / RESUME), NEVER reset is_paused or paused_until
        -- at conversation level! Individual conversations that were paused by CS operators (#pause or handover)
        -- must retain their own pause state so CS handovers are never disrupted.
        -- ANTI-NULL PREDICATE ENFORCEMENT: Uses 'IS DISTINCT FROM' and COALESCE to prevent UNKNOWN evaluation.
        IF p_is_paused THEN
            UPDATE public.conversation_sessions
            SET is_paused = true,
                current_state = 'HUMAN_PAUSED',
                bot_status = v_tenant_status,
                paused_until = p_paused_until,
                paused_at = v_now,
                paused_by = p_source,
                pause_reason = 'TENANT_DISABLED',
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'bot_status', v_tenant_status,
                    'bot_paused', true,
                    'is_bot_paused', true,
                    'is_bot_active', false,
                    'paused_at', v_now,
                    'paused_by', p_source,
                    'paused_until', p_paused_until,
                    'pause_reason', 'TENANT_DISABLED',
                    'paused_reason', 'TENANT_DISABLED',
                    'last_state_updated_by', p_source
                ),
                updated_at = v_now
            WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id)
              AND (pause_reason IS DISTINCT FROM 'HUMAN_HANDOVER')
              AND (COALESCE(metadata->>'pause_reason', '') IS DISTINCT FROM 'HUMAN_HANDOVER')
              AND (COALESCE(metadata->>'is_handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(metadata->>'handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(current_state, '') NOT IN ('HANDOVER', 'HUMAN_HANDOVER'));

            -- 3. Synchronize conversations table ONLY WHEN PAUSING TENANT
            UPDATE public.conversations
            SET bot_paused = true,
                is_paused = true,
                is_bot_paused = true,
                is_bot_active = false,
                paused_until = p_paused_until,
                pause_reason = 'TENANT_DISABLED',
                last_state_updated_by = p_source,
                bot_mode = 'HUMAN_ACTIVE',
                status = 'HUMAN_PAUSED',
                updated_at = v_now
            WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id)
              AND (pause_reason IS DISTINCT FROM 'HUMAN_HANDOVER')
              AND (COALESCE(metadata->>'pause_reason', '') IS DISTINCT FROM 'HUMAN_HANDOVER')
              AND (COALESCE(metadata->>'is_handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(metadata->>'handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(current_state, '') NOT IN ('HANDOVER', 'HUMAN_HANDOVER'));
        ELSE
            -- Saat tenant di-RESUME (#on), otomatis aktifkan kembali
            -- HANYA untuk sesi/percakapan yang memiliki pause_reason = 'TENANT_DISABLED'.
            -- Percakapan dengan pause_reason = 'HUMAN_HANDOVER' WAJIB DIBIARKAN TETAP PAUSED!
            -- ANTI-NULL PREDICATE: Menggunakan IS DISTINCT FROM dan COALESCE
            UPDATE public.conversation_sessions
            SET is_paused = false,
                current_state = 'BOT_ACTIVE',
                bot_status = 'BOT_ACTIVE',
                paused_until = NULL,
                pause_reason = NULL,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'bot_status', 'BOT_ACTIVE',
                    'bot_paused', false,
                    'is_bot_paused', false,
                    'is_bot_active', true,
                    'resumed_at', v_now,
                    'resumed_by', p_source,
                    'pause_reason', NULL,
                    'paused_reason', NULL,
                    'last_state_updated_by', p_source
                ),
                updated_at = v_now
            WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id)
              AND (pause_reason = 'TENANT_DISABLED')
              AND (COALESCE(metadata->>'pause_reason', '') IS DISTINCT FROM 'HUMAN_HANDOVER')
              AND (COALESCE(metadata->>'is_handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(metadata->>'handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(current_state, '') NOT IN ('HANDOVER', 'HUMAN_HANDOVER'));

            UPDATE public.conversations
            SET bot_paused = false,
                is_paused = false,
                is_bot_paused = false,
                is_bot_active = true,
                paused_until = NULL,
                pause_reason = NULL,
                last_state_updated_by = p_source,
                bot_mode = 'AI_ACTIVE',
                status = 'active',
                updated_at = v_now
            WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id)
              AND (pause_reason = 'TENANT_DISABLED')
              AND (COALESCE(metadata->>'pause_reason', '') IS DISTINCT FROM 'HUMAN_HANDOVER')
              AND (COALESCE(metadata->>'is_handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(metadata->>'handover', 'false') IS DISTINCT FROM 'true')
              AND (COALESCE(current_state, '') NOT IN ('HANDOVER', 'HUMAN_HANDOVER'));
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'scope', 'tenant',
            'status', v_tenant_status,
            'bot_paused', p_is_paused,
            'is_bot_active', NOT p_is_paused,
            'paused_until', p_paused_until,
            'pause_reason', v_pause_reason,
            'last_state_updated_by', p_source,
            'tenant_id', v_tenant_uuid
        );

    -- =========================================================================
    -- SCOPE B: CONVERSATION-LEVEL ATOMIC MUTATION (CONVERSATION / SESSION)
    -- =========================================================================
    ELSE
        v_clean_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');

        IF v_clean_phone IS NOT NULL AND v_clean_phone <> '' THEN
            -- 1. Upsert conversation_sessions atomically with metadata sync
            INSERT INTO public.conversation_sessions (
                tenant_id,
                session_id,
                channel,
                user_identifier,
                current_state,
                bot_status,
                is_paused,
                paused_at,
                paused_by,
                paused_until,
                pause_reason,
                metadata,
                updated_at
            ) VALUES (
                v_tenant_uuid::TEXT,
                'wa_' || v_tenant_uuid::TEXT || '_' || v_clean_phone,
                'WHATSAPP',
                v_clean_phone,
                CASE WHEN p_is_paused THEN 'HUMAN_PAUSED' ELSE 'BOT_ACTIVE' END,
                v_conv_status,
                p_is_paused,
                CASE WHEN p_is_paused THEN v_now ELSE NULL END,
                p_source,
                p_paused_until,
                v_pause_reason,
                CASE WHEN p_is_paused THEN
                    jsonb_build_object(
                        'bot_status', v_conv_status,
                        'bot_paused', true,
                        'is_bot_paused', true,
                        'is_bot_active', false,
                        'paused_at', v_now,
                        'paused_by', p_source,
                        'paused_until', p_paused_until,
                        'pause_reason', 'HUMAN_HANDOVER',
                        'paused_reason', 'HUMAN_HANDOVER',
                        'last_state_updated_by', p_source
                    )
                ELSE
                    jsonb_build_object(
                        'bot_status', v_conv_status,
                        'bot_paused', false,
                        'is_bot_paused', false,
                        'is_bot_active', true,
                        'resumed_at', v_now,
                        'resumed_by', p_source,
                        'pause_reason', NULL,
                        'paused_reason', NULL,
                        'last_state_updated_by', p_source
                    )
                END,
                v_now
            )
            ON CONFLICT (tenant_id, user_identifier) DO UPDATE
            SET current_state = EXCLUDED.current_state,
                bot_status = EXCLUDED.bot_status,
                is_paused = EXCLUDED.is_paused,
                paused_at = EXCLUDED.paused_at,
                paused_by = EXCLUDED.paused_by,
                paused_until = EXCLUDED.paused_until,
                pause_reason = EXCLUDED.pause_reason,
                metadata = COALESCE(public.conversation_sessions.metadata, '{}'::jsonb) || (
                    CASE WHEN p_is_paused THEN
                        jsonb_build_object(
                            'bot_status', v_conv_status,
                            'bot_paused', true,
                            'is_bot_paused', true,
                            'is_bot_active', false,
                            'paused_at', v_now,
                            'paused_by', p_source,
                            'paused_until', p_paused_until,
                            'pause_reason', 'HUMAN_HANDOVER',
                            'paused_reason', 'HUMAN_HANDOVER',
                            'last_state_updated_by', p_source
                        )
                    ELSE
                        jsonb_build_object(
                            'bot_status', v_conv_status,
                            'bot_paused', false,
                            'is_bot_paused', false,
                            'is_bot_active', true,
                            'resumed_at', v_now,
                            'resumed_by', p_source,
                            'pause_reason', NULL,
                            'paused_reason', NULL,
                            'last_state_updated_by', p_source
                        )
                    END
                ),
                updated_at = v_now;

            -- 2. Synchronize conversations table directly
            UPDATE public.conversations
            SET bot_paused = p_is_paused,
                is_paused = p_is_paused,
                is_bot_paused = p_is_paused,
                is_bot_active = NOT p_is_paused,
                paused_until = p_paused_until,
                pause_reason = v_pause_reason,
                last_state_updated_by = p_source,
                bot_mode = CASE WHEN p_is_paused THEN 'HUMAN_ACTIVE' ELSE 'AI_ACTIVE' END,
                status = CASE WHEN p_is_paused THEN 'HUMAN_PAUSED' ELSE 'active' END,
                updated_at = v_now
            WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id)
              AND regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g') = v_clean_phone;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'scope', 'conversation',
            'status', v_conv_status,
            'bot_paused', p_is_paused,
            'is_bot_active', NOT p_is_paused,
            'paused_until', p_paused_until,
            'pause_reason', v_pause_reason,
            'last_state_updated_by', p_source,
            'customer_phone', v_clean_phone
        );
    END IF;
END;
$$;

-- Security hardening: enforce permissions
REVOKE EXECUTE ON FUNCTION public.fn_toggle_bot_session_state(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_toggle_bot_session_state(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
