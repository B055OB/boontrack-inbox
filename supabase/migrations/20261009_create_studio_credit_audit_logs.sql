-- ==============================================================================
-- Migration: Create studio_credit_audit_logs & grant_studio_credits RPC
-- File: supabase/migrations/20261009_create_studio_credit_audit_logs.sql
-- Status: Official Migration / Architecture Contract ADR § 53
-- Dependencies: public.tenants, public.studio_workspaces
-- ==============================================================================

-- Tabel Audit Transaksi Kredit Studio
CREATE TABLE IF NOT EXISTS public.studio_credit_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    credits_added INT NOT NULL,
    new_balance INT NOT NULL,
    reason TEXT NOT NULL,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.studio_credit_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Role Full Access Studio Credit Audit" ON public.studio_credit_audit_logs;
CREATE POLICY "Service Role Full Access Studio Credit Audit"
ON public.studio_credit_audit_logs FOR ALL USING (true);

-- RPC grant_studio_credits
CREATE OR REPLACE FUNCTION public.grant_studio_credits(
    p_tenant_id UUID,
    p_credits INT,
    p_reason TEXT,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_credits INT;
BEGIN
    UPDATE public.studio_workspaces
    SET render_credits = render_credits + p_credits,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
    RETURNING render_credits INTO v_new_credits;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Workspace Studio tidak ditemukan');
    END IF;

    INSERT INTO public.studio_credit_audit_logs (
        tenant_id,
        credits_added,
        new_balance,
        reason,
        granted_by
    ) VALUES (
        p_tenant_id,
        p_credits,
        v_new_credits,
        p_reason,
        p_admin_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_credits,
        'message', 'Kredit render berhasil ditambahkan'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
