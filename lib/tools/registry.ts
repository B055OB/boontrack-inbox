/**
 * lib/tools/registry.ts
 * Unified Registry and Gateway Dispatcher for Agent Tools.
 *
 * Implements strict tenant context validation, Zod parameter validation,
 * permission categorization ('READ' vs 'ACTION'), and automatic audit logging.
 */

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolDefinition, ToolPermission, ToolResult } from './types';
import { recordToolAudit } from './audit';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  /**
   * Register a new tool into the gateway.
   */
  register(tool: AgentTool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('[ToolRegistry] Tool must have a valid string name');
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieve a tool by its unique name.
   */
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools, optionally filtered by permission ('READ' | 'ACTION').
   */
  getAll(permissionFilter?: ToolPermission): AgentTool[] {
    const list = Array.from(this.tools.values());
    if (permissionFilter) {
      return list.filter((t) => t.permission === permissionFilter);
    }
    return list;
  }

  /**
   * Generate tool definitions for LLM function calling (Gemini / WABA AI / OpenAI).
   */
  getDefinitions(permissionFilter?: ToolPermission): ToolDefinition[] {
    return this.getAll(permissionFilter).map((tool) => {
      let paramSchema: Record<string, unknown> = {};
      try {
        // Attempt to extract Zod shape if available
        const anySchema = tool.schema as any;
        if (anySchema?.shape) {
          const properties: Record<string, unknown> = {};
          const required: string[] = [];

          for (const [key, fieldDef] of Object.entries(anySchema.shape)) {
            const f = fieldDef as any;
            const typeName = f?._def?.typeName || 'ZodString';
            properties[key] = {
              type: typeName.toLowerCase().replace('zod', ''),
              description: f?.description || key,
            };
            if (!f.isOptional?.()) {
              required.push(key);
            }
          }
          paramSchema = { type: 'object', properties, required };
        }
      } catch {
        paramSchema = { type: 'object' };
      }

      return {
        name: tool.name,
        description: tool.description,
        permission: tool.permission,
        parameters: paramSchema,
      };
    });
  }

  /**
   * Execute a tool through the Gateway with Guardrails:
   * 1. Validates strict tenant_id isolation in ToolContext
   * 2. Validates raw input against tool's Zod schema
   * 3. Executes handler safely
   * 4. Records action audit log
   */
  async execute<T = any>(
    name: string,
    context: ToolContext,
    rawParams: unknown
  ): Promise<ToolResult<T>> {
    const startTime = Date.now();

    // 1. Strict Tenant Context Guardrail
    if (!context || !context.tenant_id || typeof context.tenant_id !== 'string' || !context.tenant_id.trim()) {
      return {
        success: false,
        error: '[ToolGateway] Access Denied: Missing or invalid tenant_id in ToolContext',
      };
    }

    // 2. Tool Lookup
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `[ToolGateway] Unknown tool: '${name}'`,
      };
    }

    // 3. Schema Validation via Zod
    const parseResult = tool.schema.safeParse(rawParams);
    if (!parseResult.success) {
      const errorDetails = parseResult.error.issues
        .map((issue) => `${issue.path.join('.') || 'param'}: ${issue.message}`)
        .join('; ');

      return {
        success: false,
        error: `[ToolGateway] Parameter validation failed for '${name}': ${errorDetails}`,
      };
    }

    // 4. Safe Handler Execution
    let result: ToolResult<any>;
    try {
      result = await tool.handler(context, parseResult.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        success: false,
        error: `[ToolGateway] Uncaught error executing '${name}': ${msg}`,
      };
    }

    // 5. Audit Logging (Mandatory for ACTION tools, diagnostic for READ tools)
    try {
      const targetId =
        (rawParams as any)?.order_id ||
        (rawParams as any)?.order_id_or_phone ||
        (rawParams as any)?.tracking_number ||
        undefined;

      await recordToolAudit({
        tenant_id: context.tenant_id,
        tool_name: tool.name,
        permission: tool.permission,
        caller_user: context.caller_user,
        target_id: typeof targetId === 'string' ? targetId : undefined,
        guardrail_status: result.guardrailStatus || (result.success ? 'APPROVED' : 'FAILED'),
        action_type: (result as any)?.action || (result.actionTaken ? 'MUTATION' : 'READ'),
        input_params: (rawParams && typeof rawParams === 'object') ? (rawParams as Record<string, unknown>) : { value: rawParams },
        result_data: {
          success: result.success,
          message: result.message,
          error: result.error,
          actionTaken: result.actionTaken,
          elapsedMs: Date.now() - startTime,
        },
      });
    } catch (auditErr) {
      console.warn('[ToolRegistry] Non-fatal: error recording audit log:', auditErr);
    }

    return result as ToolResult<T>;
  }
}

export const toolRegistry = new ToolRegistry();
