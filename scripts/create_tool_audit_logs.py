import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('C:/boontrack-core/.env')
db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('No DATABASE_URL')
    exit(1)

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
CREATE TABLE IF NOT EXISTS public.tool_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL DEFAULT 'system',
    tool_name TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'READ',
    caller_user TEXT,
    target_id TEXT,
    guardrail_status TEXT NOT NULL DEFAULT 'NONE',
    action_type TEXT,
    input_params JSONB DEFAULT '{}'::jsonb,
    result_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_audit_logs_tenant_id ON public.tool_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tool_audit_logs_tool_name ON public.tool_audit_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_audit_logs_created_at ON public.tool_audit_logs(created_at);

-- Grant select and insert to service_role and authenticated
GRANT ALL ON TABLE public.tool_audit_logs TO service_role;
GRANT ALL ON TABLE public.tool_audit_logs TO postgres;
GRANT ALL ON TABLE public.tool_audit_logs TO anon;
GRANT ALL ON TABLE public.tool_audit_logs TO authenticated;
"""

cur.execute(sql)
print("Successfully created public.tool_audit_logs table and permissions.")

# Reload PostgREST schema cache
cur.execute("NOTIFY pgrst, 'reload schema';")
print("Notified PostgREST to reload schema.")

cur.close()
conn.close()
