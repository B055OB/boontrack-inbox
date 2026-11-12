import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface TenantConfigAuditEntry {
  tenantId?: string | null;
  tenantSlug: string;
  actorId?: string | null;
  actorRole: string;
  authMethod: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changedKeys?: string[];
  diffSummary?: Record<string, unknown>;
  status?: 'SUCCESS' | 'BLOCKED' | 'FAILED';
  req?: NextRequest | Request;
}

const SENSITIVE_KEY_PATTERN =
  /(secret|token|password|pin|api[_-]?key|server[_-]?key|client[_-]?secret|access[_-]?key|permanent_access_token|webhook_secret|bank_account|account_number|private_key|signature|authorization|cookie)/i;

/**
 * Recursively redact any credential, token, PIN, or payment/secret field before storing
 * audit snapshots. Secret values are replaced with '[REDACTED]' + safe length metadata.
 */
export function redactSensitiveValues(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input.length > 512 ? `${input.slice(0, 128)}...[len:${input.length}]` : input;
  }
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => redactSensitiveValues(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      if (val === null || val === undefined || val === '') {
        out[key] = null;
      } else if (typeof val === 'string') {
        out[key] = `[REDACTED:len=${val.length}]`;
      } else {
        out[key] = '[REDACTED]';
      }
      continue;
    }
    out[key] = redactSensitiveValues(val, depth + 1);
  }
  return out;
}

export function computeChangedKeys(
  payload: Record<string, unknown> | null | undefined,
  extraKeys: string[] = []
): string[] {
  const keys = new Set<string>(extraKeys);
  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys).slice(0, 100);
}

function extractRequestMeta(req?: NextRequest | Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const rawIp = forwardedFor ? forwardedFor.split(',')[0]?.trim() : realIp?.trim();
  const userAgent = req.headers.get('user-agent')?.slice(0, 255) || null;
  return {
    ipAddress: rawIp ? rawIp.slice(0, 64) : null,
    userAgent,
  };
}

/**
 * Best-effort immutable audit log writer into `tenant_config_audit_logs`.
 * Never throws or blocks an operational mutation if the table isn't migrated yet,
 * and always emits a structured log line for telemetry sinks.
 */
export async function recordTenantConfigAudit(entry: TenantConfigAuditEntry): Promise<void> {
  const { ipAddress, userAgent } = extractRequestMeta(entry.req);
  const sanitizedSummary = redactSensitiveValues(entry.diffSummary || {}) as Record<string, unknown>;
  const safeChangedKeys = Array.from(new Set(entry.changedKeys || [])).slice(0, 100);
  const status = entry.status || 'SUCCESS';

  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
      const { error } = await supabaseAdmin.from('tenant_config_audit_logs').insert({
        tenant_id: entry.tenantId || null,
        tenant_slug: entry.tenantSlug,
        actor_id: entry.actorId || null,
        actor_role: entry.actorRole,
        auth_method: entry.authMethod,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId || null,
        changed_keys: safeChangedKeys,
        diff_summary: sanitizedSummary,
        ip_address: ipAddress,
        user_agent: userAgent,
        status,
      });

      if (error && !String(error.message || '').includes('does not exist')) {
        console.warn('[TenantConfigAudit] Insert error:', error.message);
      }
    }
  } catch (err: any) {
    console.warn('[TenantConfigAudit] Non-fatal audit write failure:', err?.message || err);
  }

  console.info(
    '[TENANT_CONFIG_AUDIT]',
    JSON.stringify({
      tenant_slug: entry.tenantSlug,
      actor_role: entry.actorRole,
      auth_method: entry.authMethod,
      action: entry.action,
      resource_type: entry.resourceType,
      status,
      changed_keys: safeChangedKeys,
    })
  );
}

