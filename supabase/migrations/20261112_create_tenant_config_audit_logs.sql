-- BT-SEC-2026-001 Gate 1: Immutable audit trail for tenant configuration & admin control plane mutations.
-- Local migration artifact ONLY (DO NOT execute against remote DB until Gate 1 sign-off).

CREATE TABLE IF NOT EXISTS public.tenant_config_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  tenant_slug TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  changed_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  diff_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_config_audit_logs_tenant_created
  ON public.tenant_config_audit_logs (tenant_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_config_audit_logs_action_created
  ON public.tenant_config_audit_logs (action, created_at DESC);

ALTER TABLE public.tenant_config_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_config_audit_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.tenant_config_audit_logs TO service_role;

DROP POLICY IF EXISTS "service_role_full_access_tenant_config_audit_logs" ON public.tenant_config_audit_logs;
CREATE POLICY "service_role_full_access_tenant_config_audit_logs"
  ON public.tenant_config_audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.tenant_config_audit_logs IS
  'BT-SEC-2026-001 Gate 1: Redacted server-side audit log for admin, settings, theme, shipping, and security blocks.';

