/**
 * @file lib/email/broadcast-service.ts
 * @description Enterprise Resend Batch Broadcast Service for BoonTrack.
 * Supports chunked batching (max 100 emails/request per Resend API constraints),
 * intelligent rate limiting, database audit logging, and automated template generation.
 */

import { getResendApiKey } from '../boonpilot-email';
import { getSupabaseAdmin, getSupabase } from '../supabaseClient';
import {
  BroadcastBatchItem,
  BroadcastBatchOptions,
  BroadcastBatchResult,
  BroadcastBatchChunkResult,
  BroadcastEmailPayload,
} from './types';
import {
  buildBroadcastEmailHtml,
  buildBroadcastEmailText,
} from './templates/broadcast-release';

/**
 * Utility promise-based sleep for rate-limiting between chunk dispatches
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Maximum items allowed by Resend Batch API in a single HTTP request
 */
export const RESEND_BATCH_MAX_SIZE = 100;

/**
 * Default delay between batch chunks in milliseconds (300ms = ~3.3 req/sec, safely below Resend limit)
 */
export const DEFAULT_BATCH_DELAY_MS = 300;

/**
 * Logs batch broadcast status to the database audit logs table without disrupting dispatch flow.
 */
async function recordBroadcastAudit(
  result: BroadcastBatchResult,
  metadata: {
    source?: string;
    from?: string;
    sampleSubject?: string;
  }
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) return;

    const auditPayload = {
      tenant_id: 'system',
      tool_name: 'resend_broadcast_batch',
      permission: 'ACTION' as const,
      caller_user: metadata.source || 'ADMIN_BROADCAST',
      guardrail_status: result.success ? ('APPROVED' as const) : ('FAILED' as const),
      action_type: 'EMAIL_BATCH_BROADCAST',
      input_params: {
        totalEmails: result.totalEmails,
        batchCount: result.batchCount,
        senderFrom: metadata.from || 'default',
        sampleSubject: metadata.sampleSubject || '',
      },
      result_data: {
        success: result.success,
        totalSent: result.totalSent,
        totalFailed: result.totalFailed,
        errors: result.errors,
        executionTimeMs: result.executionTimeMs,
      },
      created_at: new Date().toISOString(),
    };

    // Attempt insert into tool_audit_logs
    await supabase.from('tool_audit_logs').insert(auditPayload);
  } catch (err) {
    console.warn('[BroadcastService] Audit logging warning (non-fatal):', err);
  }
}

/**
 * Dispatches an array of broadcast emails via Resend Batch API in chunked groups of max 100.
 */
export async function sendBroadcastBatch(
  items: BroadcastBatchItem[],
  options?: BroadcastBatchOptions
): Promise<BroadcastBatchResult> {
  const startTime = Date.now();
  const chunkSize = Math.min(
    Math.max(1, options?.chunkSize || RESEND_BATCH_MAX_SIZE),
    RESEND_BATCH_MAX_SIZE
  );
  const delayMs = options?.delayBetweenChunksMs ?? DEFAULT_BATCH_DELAY_MS;

  // Filter valid email addresses
  const validItems = items.filter(
    (item) => item && typeof item.to === 'string' && item.to.includes('@')
  );

  const result: BroadcastBatchResult = {
    success: true,
    totalEmails: validItems.length,
    totalSent: 0,
    totalFailed: 0,
    batchCount: 0,
    chunks: [],
    errors: [],
    executionTimeMs: 0,
  };

  if (validItems.length === 0) {
    result.executionTimeMs = Date.now() - startTime;
    return result;
  }

  // Split into chunks of chunkSize
  const chunks: BroadcastBatchItem[][] = [];
  for (let i = 0; i < validItems.length; i += chunkSize) {
    chunks.push(validItems.slice(i, i + chunkSize));
  }
  result.batchCount = chunks.length;

  const apiKey = getResendApiKey();
  const isMockEnvironment =
    options?.dryRun ||
    (!apiKey && process.env.NODE_ENV === 'test') ||
    process.env.MOCK_EMAIL === 'true';

  const defaultSender =
    options?.from ||
    process.env.RESEND_FROM ||
    'BoonTrack Official <updates@boontrack.com>';

  // Process chunks sequentially to respect provider rate limits
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];
    const chunkResult: BroadcastBatchChunkResult = {
      chunkIndex: cIdx,
      totalInChunk: chunk.length,
      successCount: 0,
      failedCount: 0,
      messageIds: [],
    };

    // Format chunk payload for Resend Batch API
    const resendBatchPayload = chunk.map((item) => {
      let html = item.html;
      let text = item.text;

      // Auto-compile from payload if raw HTML is not provided
      if (!html && item.payload) {
        html = buildBroadcastEmailHtml(item.payload);
        text = buildBroadcastEmailText(item.payload);
      }

      return {
        from: item.from || defaultSender,
        to: [item.to.trim()],
        subject: item.subject,
        html: html || '<p>Pemberitahuan resmi dari BoonTrack.</p>',
        ...(text ? { text } : {}),
        ...(item.replyTo || options?.replyTo ? { reply_to: item.replyTo || options?.replyTo } : {}),
        ...(item.headers ? { headers: item.headers } : {}),
        ...(item.tags ? { tags: item.tags } : {}),
      };
    });

    if (isMockEnvironment) {
      // Simulated delivery for local dev or automated test runner
      const mockIds = chunk.map((_, idx) => `mock_batch_${Date.now()}_${cIdx}_${idx}`);
      chunkResult.successCount = chunk.length;
      chunkResult.messageIds = mockIds;
      result.totalSent += chunk.length;
      result.chunks.push(chunkResult);
    } else {
      try {
        if (!apiKey) {
          throw new Error('RESEND_API_KEY is not configured in environment.');
        }

        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'BoonTrack-Broadcast-Batch/1.0',
          },
          body: JSON.stringify(resendBatchPayload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && Array.isArray(data?.data)) {
          const ids = data.data.map((d: any) => d.id).filter(Boolean);
          chunkResult.successCount = ids.length;
          chunkResult.messageIds = ids;
          result.totalSent += ids.length;

          if (ids.length < chunk.length) {
            const diff = chunk.length - ids.length;
            chunkResult.failedCount = diff;
            result.totalFailed += diff;
          }
        } else {
          const errDetail =
            data?.message ||
            data?.error ||
            `HTTP ${res.status}: ${res.statusText || 'Resend Batch Error'}`;
          chunkResult.failedCount = chunk.length;
          chunkResult.error = errDetail;
          result.totalFailed += chunk.length;
          result.errors.push(`Chunk #${cIdx + 1}: ${errDetail}`);
        }
      } catch (chunkErr: any) {
        const errMsg = chunkErr?.message || 'Network exception during Resend Batch request';
        chunkResult.failedCount = chunk.length;
        chunkResult.error = errMsg;
        result.totalFailed += chunk.length;
        result.errors.push(`Chunk #${cIdx + 1}: ${errMsg}`);
      }

      result.chunks.push(chunkResult);
    }

    // Apply rate-limiting delay between chunks (only if more chunks remain)
    if (cIdx < chunks.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  result.success = result.totalFailed === 0;
  result.executionTimeMs = Date.now() - startTime;

  // Record audit trail if enabled
  if (options?.recordAuditLog !== false) {
    await recordBroadcastAudit(result, {
      source: options?.auditSource,
      from: defaultSender,
      sampleSubject: validItems[0]?.subject,
    });
  }

  return result;
}

/**
 * High-level helper: Broadcast platform release notes to a list of merchant recipients.
 */
export async function sendReleaseBroadcast(
  recipients: Array<{
    email: string;
    name?: string;
    tenantSlug?: string;
    storeName?: string;
  }>,
  releaseContent: Omit<BroadcastEmailPayload, 'recipientEmail'>,
  options?: BroadcastBatchOptions
): Promise<BroadcastBatchResult> {
  const items: BroadcastBatchItem[] = recipients.map((r) => {
    const payload: BroadcastEmailPayload = {
      ...releaseContent,
      recipientName: r.name,
      recipientEmail: r.email,
      tenantSlug: r.tenantSlug,
      storeName: r.storeName,
    };

    return {
      to: r.email,
      name: r.name,
      subject: releaseContent.headline,
      payload,
    };
  });

  return sendBroadcastBatch(items, {
    ...options,
    auditSource: options?.auditSource || 'RELEASE_ANNOUNCEMENT_SUITE',
  });
}
