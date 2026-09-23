-- ==============================================================================
-- Migration: 20260924_create_tool_audit_logs.sql
-- Purpose:   Audit log for Agentic Commerce Business Action Layer & Tool Gateway
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tool_audit_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    tool_name         TEXT NOT NULL,
    permission        TEXT NOT NULL CHECK (permission IN ('READ', 'ACTION')),
    caller_user       TEXT,
    target_id         TEXT,
    guardrail_status  TEXT CHECK (guardrail_status IN ('APPROVED', 'REJECTED', 'NONE', 'FAILED')),
    action_type       TEXT,
    input_params      JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tenant-scoped audit timeline
CREATE INDEX IF NOT EXISTS idx_tool_audit_tenant_time
    ON public.tool_audit_logs (tenant_id, created_at DESC);

-- Index for target entity lookups (e.g. order history)
CREATE INDEX IF NOT EXISTS idx_tool_audit_target_id
    ON public.tool_audit_logs (target_id)
    WHERE target_id IS NOT NULL;

-- Row Level Security
ALTER TABLE public.tool_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on tool_audit_logs" ON public.tool_audit_logs;
CREATE POLICY "Service role full access on tool_audit_logs"
    ON public.tool_audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
