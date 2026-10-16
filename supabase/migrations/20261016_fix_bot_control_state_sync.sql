-- Migration: 20261016_fix_bot_control_state_sync.sql
-- Description: Fixes P1 Bot Control State Sync & Security Hardening:
--              1. Synchronizes all metadata flags (is_bot_paused, bot_paused, is_bot_active, bot_status)
--                 in tenants and conversation_sessions on pause/resume to prevent dropping messages
--                 due to stale metadata.is_bot_paused.
--              2. Enforces SECURITY DEFINER search_path = public, pg_temp.
--              3. Restricts execute permissions to service_role (revokes from public/anon/authenticated).

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
BEGIN
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

    -- =========================================================================
    -- SCOPE A: TENANT-LEVEL ATOMIC MUTATION
    -- =========================================================================
    IF p_scope = 'tenant' THEN
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
                        'paused_until', p_paused_until
                    )
                ELSE
                    jsonb_build_object(
                        'bot_status', v_tenant_status,
                        'bot_paused', false,
                        'is_bot_paused', false,
                        'is_bot_active', true,
                        'resumed_at', v_now,
                        'resumed_by', p_source,
                        'loop_quarantine', false,
                        'is_quarantined', false,
                        'quarantined', false
                    )
                END
            ),
            updated_at = v_now
        WHERE id = v_tenant_uuid;

        -- 2. Synchronize conversation_sessions metadata and columns
        UPDATE public.conversation_sessions
        SET is_paused = p_is_paused,
            current_state = CASE WHEN p_is_paused THEN 'HUMAN_PAUSED' ELSE 'ACTIVE' END,
            bot_status = v_tenant_status,
            paused_until = p_paused_until,
            paused_at = CASE WHEN p_is_paused THEN v_now ELSE NULL END,
            paused_by = CASE WHEN p_is_paused THEN p_source ELSE NULL END,
            metadata = COALESCE(metadata, '{}'::jsonb) || (
                CASE WHEN p_is_paused THEN
                    jsonb_build_object(
                        'bot_status', v_tenant_status,
                        'bot_paused', true,
                        'is_bot_paused', true,
                        'is_bot_active', false,
                        'paused_at', v_now,
                        'paused_by', p_source,
                        'paused_until', p_paused_until
                    )
                ELSE
                    jsonb_build_object(
                        'bot_status', v_tenant_status,
                        'bot_paused', false,
                        'is_bot_paused', false,
                        'is_bot_active', true,
                        'resumed_at', v_now,
                        'resumed_by', p_source
                    )
                END
            ),
            updated_at = v_now
        WHERE tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id;

        -- 3. Synchronize conversations table (both bot_paused and is_paused)
        UPDATE public.conversations
        SET bot_paused = p_is_paused,
            is_paused = p_is_paused,
            is_bot_paused = p_is_paused,
            is_bot_active = NOT p_is_paused,
            bot_mode = CASE WHEN p_is_paused THEN 'HUMAN_ACTIVE' ELSE 'AI_ACTIVE' END,
            status = CASE WHEN p_is_paused THEN 'HUMAN_PAUSED' ELSE 'active' END,
            updated_at = v_now
        WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id);

        RETURN jsonb_build_object(
            'success', true,
            'scope', 'tenant',
            'status', v_tenant_status,
            'bot_paused', p_is_paused,
            'tenant_id', v_tenant_uuid
        );

    -- =========================================================================
    -- SCOPE B: CONVERSATION-LEVEL ATOMIC MUTATION (CS Takeover)
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
                metadata,
                updated_at
            ) VALUES (
                v_tenant_uuid::TEXT,
                'wa_' || v_tenant_uuid::TEXT || '_' || v_clean_phone,
                'WHATSAPP',
                v_clean_phone,
                CASE WHEN p_is_paused THEN 'HUMAN_PAUSED' ELSE 'ACTIVE' END,
                v_conv_status,
                p_is_paused,
                CASE WHEN p_is_paused THEN v_now ELSE NULL END,
                p_source,
                p_paused_until,
                CASE WHEN p_is_paused THEN
                    jsonb_build_object(
                        'bot_status', v_conv_status,
                        'bot_paused', true,
                        'is_bot_paused', true,
                        'is_bot_active', false,
                        'paused_at', v_now,
                        'paused_by', p_source,
                        'paused_until', p_paused_until
                    )
                ELSE
                    jsonb_build_object(
                        'bot_status', v_conv_status,
                        'bot_paused', false,
                        'is_bot_paused', false,
                        'is_bot_active', true,
                        'resumed_at', v_now,
                        'resumed_by', p_source
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
                metadata = COALESCE(public.conversation_sessions.metadata, '{}'::jsonb) || (
                    CASE WHEN p_is_paused THEN
                        jsonb_build_object(
                            'bot_status', v_conv_status,
                            'bot_paused', true,
                            'is_bot_paused', true,
                            'is_bot_active', false,
                            'paused_at', v_now,
                            'paused_by', p_source,
                            'paused_until', p_paused_until
                        )
                    ELSE
                        jsonb_build_object(
                            'bot_status', v_conv_status,
                            'bot_paused', false,
                            'is_bot_paused', false,
                            'is_bot_active', true,
                            'resumed_at', v_now,
                            'resumed_by', p_source
                        )
                    END
                ),
                updated_at = v_now;

            -- 2. Synchronize conversations table (both bot_paused and is_paused)
            UPDATE public.conversations
            SET bot_paused = p_is_paused,
                is_paused = p_is_paused,
                is_bot_paused = p_is_paused,
                is_bot_active = NOT p_is_paused,
                bot_mode = CASE WHEN p_is_paused THEN 'HUMAN_ACTIVE' ELSE 'AI_ACTIVE' END,
                status = CASE WHEN p_is_paused THEN 'HUMAN_PAUSED' ELSE 'active' END,
                updated_at = v_now
            WHERE (tenant_id = v_tenant_uuid::TEXT OR tenant_id = p_tenant_id)
              AND regexp_replace(customer_phone, '\D', '', 'g') = v_clean_phone;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'scope', 'conversation',
            'status', v_conv_status,
            'bot_paused', p_is_paused,
            'customer_phone', v_clean_phone
        );
    END IF;
END;
$$;

-- Security hardening
REVOKE EXECUTE ON FUNCTION public.fn_toggle_bot_session_state(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_toggle_bot_session_state(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
