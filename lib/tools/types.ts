/**
 * lib/tools/types.ts
 * Type contracts for the Business Action Layer & Tool Gateway.
 *
 * Sesuai arsitektur Agentic Commerce (Roadmap P2):
 * - Pemisahan permission level yang tegas ('READ' vs 'ACTION')
 * - Isolasi tenant context wajib pada setiap eksekusi
 * - Validasi parameter menggunakan Zod schema
 */

import { z, ZodType } from 'zod';

export type ToolPermission = 'READ' | 'ACTION';

export type GuardrailDecision = 'APPROVED' | 'REJECTED' | 'NONE' | 'FAILED';

export interface ToolContext {
  /**
   * The tenant identifier (slug or UUID) executing the tool.
   * STRICT GUARDRAIL: Tools must never cross this boundary.
   */
  tenant_id: string;
  /**
   * Optional caller identifier (e.g. buyer phone number, admin email, session ID).
   */
  caller_user?: string;
  /**
   * Channel originating the request (WHATSAPP, WEBCHAT, etc.)
   */
  channel?: string;
  /**
   * Additional context properties.
   */
  [key: string]: unknown;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  actionTaken?: boolean;
  guardrailStatus?: GuardrailDecision;
}

export interface AgentTool<TParams = any, TResult = any> {
  name: string;
  description: string;
  permission: ToolPermission;
  schema: ZodType<TParams>;
  handler: (context: ToolContext, params: TParams) => Promise<ToolResult<TResult>>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermission;
  parameters: Record<string, unknown>;
}

export interface ToolAuditEntry {
  id?: string;
  tenant_id: string;
  tool_name: string;
  permission: ToolPermission;
  caller_user?: string;
  target_id?: string;
  guardrail_status?: GuardrailDecision;
  action_type?: string;
  input_params: Record<string, unknown>;
  result_data: Record<string, unknown>;
  created_at?: string;
}
