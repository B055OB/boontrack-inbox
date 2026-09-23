/**
 * lib/tools/audit.ts
 * Audit logging service for Action and Read Tool executions in Agentic Commerce.
 *
 * Sesuai spesifikasi Roadmap P2:
 * "Catat audit log setiap ada pemanggilan Action Tool."
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import type { ToolAuditEntry } from './types';

// In-memory diagnostic ring buffer for unit testing and local inspection
const inMemoryAuditLogs: ToolAuditEntry[] = [];
const MAX_IN_MEMORY_LOGS = 100;

export async function recordToolAudit(entry: ToolAuditEntry): Promise<void> {
  const auditRecord: ToolAuditEntry = {
    ...entry,
    created_at: entry.created_at || new Date().toISOString(),
  };

  // 1. Record in-memory buffer
  inMemoryAuditLogs.unshift(auditRecord);
  if (inMemoryAuditLogs.length > MAX_IN_MEMORY_LOGS) {
    inMemoryAuditLogs.pop();
  }

  // 2. Persist to Supabase asynchronously (fire-and-forget, non-blocking)
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (supabase) {
      Promise.resolve(
        supabase
          .from('tool_audit_logs')
          .insert({
            tenant_id: auditRecord.tenant_id,
            tool_name: auditRecord.tool_name,
            permission: auditRecord.permission,
            caller_user: auditRecord.caller_user ?? null,
            target_id: auditRecord.target_id ?? null,
            guardrail_status: auditRecord.guardrail_status ?? 'NONE',
            action_type: auditRecord.action_type ?? null,
            input_params: auditRecord.input_params ?? {},
            result_data: auditRecord.result_data ?? {},
            created_at: auditRecord.created_at,
          })
      )
        .then((res: any) => {
          if (res?.error) {
            console.warn('[ToolAuditLog] Warning writing audit log to DB:', res.error.message);
          }
        })
        .catch((err: unknown) => {
          console.warn('[ToolAuditLog] Uncaught exception writing audit log:', err);
        });
    }
  } catch (err) {
    console.warn('[ToolAuditLog] Failed to initiate DB audit log:', err);
  }
}

export function getRecentToolAuditLogs(): ToolAuditEntry[] {
  return [...inMemoryAuditLogs];
}

export function clearToolAuditLogs(): void {
  inMemoryAuditLogs.length = 0;
}
