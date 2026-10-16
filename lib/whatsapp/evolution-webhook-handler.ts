import { isBoonPilotWakeWordTriggered } from '@/lib/boonpilot/wake-word';
import { formatToWhatsAppMarkdown } from '@/lib/formatting/universal-chat-formatter';
/**
 * lib/whatsapp/evolution-webhook-handler.ts
 * Ingress Webhook Processor for WhatsApp Evolution API v2.
 *
 * Implements:
 * 1. Image Message Detection (imageMessage, viewOnce, ephemeral)
 * 2. Downloading Base64 Media via `POST /chat/getBase64FromMediaMessage/{instance}`
 * 3. Forwarding { text, image_base64, mime_type } to Gemini Multimodal Pipeline (`gemini-3.8-flash`)
 * 4. Reply dispatch via Evolution API `POST /message/sendText/{instance}`
 * 5. Ingestion into BoonTrack Inbox conversations & messages ledger
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeWhatsAppNumber, extractActivationCode, processStoreActivation } from '@/lib/whatsapp/activation';
import { processMultimodalChat } from '@/lib/ai/multimodal-chat';
import {
  isManualOrderMessage,
  getOrderConfirmationReply,
  markSessionAsPendingVerification,
} from '@/lib/whatsapp/order-interceptor';
import {
  resolveTenantFromConnection,
  persistInboundMessage,
  persistOutboundMessage,
  cleanCustomerPhone,
} from '@/lib/whatsapp/inbox-persistence';
import { resolveBoonPilotSender } from '@/lib/boonpilot/sender-resolver';
import {
  processBoonPilotPlatformChat,
  resolveCommunityContext,
} from '@/lib/boonpilot/platform-engine';
import {
  registerBotOutbound,
  isBotOutbound,
  isBotOutboundAsync,
  toCanonicalPhone,
} from '@/lib/whatsapp/outbound-registry';
import { parsePaymentNotification } from '@/lib/payment-webhook-service';
import { resolveHardeningPolicy } from '@/lib/resolvers/tenant-runtime-resolver';
import { isDuplicateWebhookEvent } from '@/lib/hardening/deduplication';
import { evaluateClinicalSafetyGate } from '@/lib/hardening/clinical-safety-gate';
import { enqueueOutboxMessage } from '@/lib/outbox/enqueue';
import {
  parseBotControlCommand,
  isAuthorizedBotController,
  resolveBotControllerRole,
  executeBotControl,
  checkRuntimeBotDecisionGate,
  setRuntimeSessionCache,
} from '@/lib/whatsapp/bot-control-service';
import {
  AUTO_REJECT_CALL_MESSAGE,
  rejectEvolutionCall,
  handleBaileysIncomingCalls,
  attachBaileysCallRejectListener,
  BaileysCall,
  BaileysSocketLike,
} from '@/lib/whatsapp/baileys-call-handler';

export {
  AUTO_REJECT_CALL_MESSAGE,
  rejectEvolutionCall,
  handleBaileysIncomingCalls,
  attachBaileysCallRejectListener,
  type BaileysCall,
  type BaileysSocketLike,
};

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  'https://evolution-api-production-abb7.up.railway.app';

/**
 * Resolves EVOLUTION_API_KEY with strict fail-closed enforcement.
 * ZERO hardcoded fallbacks allowed.
 * Throws an Error immediately if process.env.EVOLUTION_API_KEY is not set or empty.
 */
export function getRequiredEvolutionApiKey(customApiKey?: string): string {
  const custom = customApiKey?.trim();
  if (custom) return custom;

  const envKey = process.env.EVOLUTION_API_KEY?.trim();
  if (!envKey) {
    throw new Error(
      '[SECURITY FATAL] EVOLUTION_API_KEY is not configured or empty in process.env. Fail-closed enforced.'
    );
  }
  return envKey;
}

export const getEvolutionApiKey = getRequiredEvolutionApiKey;

/**
 * Downloads Base64 media from Evolution API v2.
 * Calls `POST /chat/getBase64FromMediaMessage/{instance}`.
 */
export async function getEvolutionMediaBase64(
  instanceName: string,
  messageObj: any,
  customApiKey?: string
): Promise<{ base64: string | null; mimeType: string }> {
  const rawMsg = messageObj.message || messageObj;
  const imageMsg =
    rawMsg?.imageMessage ||
    rawMsg?.viewOnceMessage?.message?.imageMessage ||
    rawMsg?.viewOnceMessageV2?.message?.imageMessage ||
    rawMsg?.ephemeralMessage?.message?.imageMessage ||
    (messageObj.messageType === 'imageMessage' ? rawMsg : null);

  const fallbackMime = imageMsg?.mimetype || 'image/jpeg';

  // 1. Cek apakah base64 sudah disertakan langsung di payload webhook
  const directBase64 =
    messageObj.base64 ||
    messageObj.mediaBase64 ||
    imageMsg?.base64 ||
    null;

  if (directBase64 && typeof directBase64 === 'string') {
    return { base64: directBase64, mimeType: fallbackMime };
  }

  // 2. Unduh Base64 Media dari endpoint resmi Evolution API
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = getRequiredEvolutionApiKey(customApiKey);
  const endpoint = `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;

  try {
    const payloadBody =
      messageObj.key && messageObj.message
        ? { key: messageObj.key, message: messageObj.message }
        : messageObj;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        message: payloadBody,
        convertToMp4: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const base64 = data.base64 || data.data || data.mediaBase64 || null;
      const mimeType = data.mimetype || fallbackMime;
      return { base64, mimeType };
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[Evolution Media] Failed HTTP ${res.status} from ${endpoint}:`, errText);
    }
  } catch (err) {
    console.warn('[Evolution Media] Exception downloading media:', err);
  }

  return { base64: null, mimeType: fallbackMime };
}

/**
 * Sends a text message back to WhatsApp via Evolution API.
 */
export async function sendEvolutionTextMessage(
  instanceName: string,
  recipientPhone: string,
  text: string,
  customApiKey?: string,
  tenantId?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = getRequiredEvolutionApiKey(customApiKey);
  const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

  let cleanNumber = (recipientPhone || '').trim();
  if (!cleanNumber.includes('@g.us')) {
    cleanNumber = cleanNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    } else if (cleanNumber.startsWith('8')) {
      cleanNumber = '62' + cleanNumber;
    }
  }

  const formattedText = formatToWhatsAppMarkdown(text).trim();

  // Pre-register in Outbound Registry to eliminate race condition with immediate webhook echo
  registerBotOutbound({
    tenantId,
    recipientPhone: cleanNumber,
    text: formattedText,
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: formattedText,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      try {
        const data = await res.json();
        const returnedId = data?.key?.id || data?.id || data?.messageId;
        if (returnedId) {
          registerBotOutbound({
            tenantId,
            messageId: returnedId,
            recipientPhone: cleanNumber,
            text: formattedText,
          });
        }
      } catch (_) {}
    }

    return res.ok;
  } catch (err) {
    console.warn('[Evolution Send] Exception sending text message:', err);
    return false;
  }
}

/**
 * Sends presence status (composing / typing simulation) to Evolution API.
 * Calls `POST /chat/sendPresence/{instance}`.
 */
export async function sendEvolutionPresence(
  instanceName: string,
  recipientPhone: string,
  presence: 'composing' | 'recording' | 'paused' = 'composing',
  customApiKey?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = getRequiredEvolutionApiKey(customApiKey);
  const endpoint = `${baseUrl}/chat/sendPresence/${encodeURIComponent(instanceName)}`;

  let cleanNumber = (recipientPhone || '').trim();
  if (!cleanNumber.includes('@g.us')) {
    cleanNumber = cleanNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    } else if (cleanNumber.startsWith('8')) {
      cleanNumber = '62' + cleanNumber;
    }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        presence,
        delay: 3500,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Evolution Presence] Failed to set presence:', err);
    return false;
  }
}

/**
 * Sends media (image / dynamic QRIS) message back to WhatsApp via Evolution API.
 * Calls `POST /message/sendMedia/{instance}`.
 */
export async function sendEvolutionMediaMessage(
  instanceName: string,
  recipientPhone: string,
  mediaUrlOrBase64: string,
  caption?: string,
  customApiKey?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = getRequiredEvolutionApiKey(customApiKey);
  const endpoint = `${baseUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;

  let cleanNumber = (recipientPhone || '').trim();
  if (!cleanNumber.includes('@g.us')) {
    cleanNumber = cleanNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    } else if (cleanNumber.startsWith('8')) {
      cleanNumber = '62' + cleanNumber;
    }
  }

  const formattedCaption = caption ? formatToWhatsAppMarkdown(caption).trim() : undefined;

  if (formattedCaption) {
    registerBotOutbound({
      recipientPhone: cleanNumber,
      text: formattedCaption,
    });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        mediatype: 'image',
        media: mediaUrlOrBase64,
        caption: formattedCaption,
        fileName: 'qris-konsultasi.webp',
      }),
      signal: AbortSignal.timeout(12000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Evolution Send Media] Exception sending media:', err);
    return false;
  }
}

/**
 * Main Webhook Event Processor for Evolution API.
 */
export async function processEvolutionWebhookEvent(
  payload: any,
  paramInstance?: string
): Promise<{ success: boolean; processed: number; event?: string; error?: string; status?: string }> {
  const supabase = getSupabaseAdmin() || getSupabase();
  const rawEvent = String(payload.event || payload.type || '').toUpperCase();
  const instanceName =
    paramInstance ||
    payload.instance ||
    payload.instanceName ||
    payload.data?.instance ||
    'boontrack-gateway';

  // 1. Handle Connection Status Update
  if (rawEvent.includes('CONNECTION') || rawEvent.includes('STATUS')) {
    const stateRaw = String(payload.data?.state || payload.state || payload.data?.status || payload.status || '').toLowerCase().trim();
    let resolvedStatus: 'open' | 'close' | 'connecting' | 'refused' = 'connecting';
    let isConnected = false;

    if (stateRaw === 'open' || stateRaw === 'connected') {
      resolvedStatus = 'open';
      isConnected = true;
    } else if (stateRaw === 'close' || stateRaw === 'closed' || stateRaw === 'disconnected' || stateRaw === 'logged_out') {
      resolvedStatus = 'close';
      isConnected = false;
    } else if (stateRaw === 'refused') {
      resolvedStatus = 'refused';
      isConnected = false;
    } else if (stateRaw === 'connecting') {
      resolvedStatus = 'connecting';
      isConnected = false;
    }

    const rawOwnerPhone = payload.data?.ownerJid || payload.owner || payload.data?.owner || payload.data?.connected_phone;
    const cleanOwnerPhone = rawOwnerPhone ? cleanCustomerPhone(String(rawOwnerPhone)) : null;

    if (supabase && instanceName) {
      await supabase
        .from('whatsapp_connections')
        .update({
          status: resolvedStatus,
          is_connected: isConnected,
          ...(cleanOwnerPhone ? { phone_number: cleanOwnerPhone } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('instance_name', instanceName);
    }

    return { success: true, processed: 1, event: rawEvent, status: resolvedStatus };
  }

  // 2. Resolve Tenant Identity from whatsapp_connections dynamically (Zero Hardcoding)
  let tenantId: string | null = null;
  let tenantSlug: string | null = null;

  const botPhoneNumber =
    payload.owner ||
    payload.data?.owner ||
    payload.sender ||
    payload.data?.sender ||
    undefined;

  const resolvedTenant = await resolveTenantFromConnection({
    instanceName,
    botPhoneNumber,
  });

  let resolvedApiKey: string;
  try {
    resolvedApiKey = getRequiredEvolutionApiKey(resolvedTenant?.apiKey);
  } catch (keyErr: any) {
    console.error(
      `[SECURITY_ALERT] Webhook aborted: ${keyErr?.message || 'EVOLUTION_API_KEY missing'}. Halting process (FAIL-CLOSED).`
    );
    throw keyErr;
  }

  // ATURAN MUTLAK FAIL-CLOSED & ANTI-LEAK:
  // Jika tenant_id bernilai null atau validasi instance/owner gagal, bot HARUS DIAM (SILENT / SAFE DROP) dan log alert ke internal.
  // DILARANG KERAS memanggil AI, dilarang mengirim template platform BoonTrack, dilarang membalas ke customer!
  if (!resolvedTenant || !resolvedTenant.tenantId) {
    console.warn(
      `[SECURITY_ALERT / QUARANTINE] Unable to resolve or validate tenant identity for instance '${instanceName}', owner='${botPhoneNumber || 'none'}'. Silently dropping webhook event (FAIL-CLOSED).`
    );
    return { success: true, processed: 0, status: 'quarantine', error: 'Tenant unresolved (fail-closed silent drop)' };
  }

  tenantId = resolvedTenant.tenantId;
  tenantSlug = resolvedTenant.tenantSlug;

  // Resolve Hardening Policy version (Progressive Runtime Rollout)
  let tenantRecordForHardening: any = { id: tenantId, slug: tenantSlug || tenantId };
  if (supabase && (tenantId || tenantSlug)) {
    try {
      const { data: tRow } = await supabase
        .from('tenants')
        .select('id, slug, name, metadata, tier, status')
        .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
        .maybeSingle();
      if (tRow) tenantRecordForHardening = tRow;
    } catch {}
  }
  const hardeningPolicy = resolveHardeningPolicy(tenantRecordForHardening);

  // 2.5 Handle Incoming WhatsApp Call (Auto-Reject & Dedicated Bot Auto-Reply)
  if (
    rawEvent.includes('CALL') ||
    rawEvent === 'CALL' ||
    rawEvent === 'CALLS' ||
    rawEvent === 'CALL_UPDATE' ||
    rawEvent === 'CALL_OFFER' ||
    Boolean(payload.call) ||
    Boolean(payload.data?.call)
  ) {
    let callList: any[] = [];
    if (Array.isArray(payload.data)) {
      callList = payload.data;
    } else if (Array.isArray(payload.data?.calls)) {
      callList = payload.data.calls;
    } else if (payload.data?.call && typeof payload.data.call === 'object') {
      callList = [payload.data.call];
    } else if (
      payload.data &&
      typeof payload.data === 'object' &&
      (payload.data.id || payload.data.from || payload.data.status)
    ) {
      callList = [payload.data];
    } else if (Array.isArray(payload.calls)) {
      callList = payload.calls;
    } else if (payload.call && typeof payload.call === 'object') {
      callList = [payload.call];
    }

    let rejectedCallsCount = 0;

    for (const callItem of callList) {
      const callStatus = String(callItem.status || '').toLowerCase();
      // Hanya tolak panggilan saat statusnya adalah offer (panggilan baru masuk diajukan)
      if (callStatus === 'offer') {
        const callId = String(callItem.id || callItem.callId || '');
        const fromJid = String(callItem.from || callItem.sender || callItem.remoteJid || '');
        const cleanCallerPhone = cleanCustomerPhone(fromJid);

        if (callId && fromJid) {
          // 1. Putus / tolak panggilan otomatis via Evolution API (Baileys)
          await rejectEvolutionCall(
            EVOLUTION_API_URL,
            instanceName,
            callId,
            fromJid,
            resolvedApiKey
          );

          // 2. Kirim pesan notifikasi singkat bot
          if (cleanCallerPhone) {
            await sendEvolutionTextMessage(
              instanceName,
              cleanCallerPhone,
              AUTO_REJECT_CALL_MESSAGE,
              resolvedApiKey,
              tenantId
            );

            // 3. Catat di Inbox Supabase Ledger (Inbound Call + Outbound Auto-Reply)
            try {
              await persistInboundMessage({
                tenantId,
                tenantSlug: tenantSlug || undefined,
                customerPhone: cleanCallerPhone,
                messageBody: '[Panggilan Suara/Video WhatsApp Masuk - Ditolak Otomatis]',
                senderType: 'customer',
                messageType: 'call',
                rawPayload: callItem,
              });

              await persistOutboundMessage({
                tenantId,
                tenantSlug: tenantSlug || undefined,
                customerPhone: cleanCallerPhone,
                messageBody: AUTO_REJECT_CALL_MESSAGE,
                senderType: 'bot',
                senderName: 'Boon Assistant (Auto-Reply)',
                rawPayload: { callId, autoRejected: true },
              });
            } catch (persistErr) {
              console.warn('[Evolution Call Handler] Warning persisting call event to inbox:', persistErr);
            }
          }

          rejectedCallsCount++;
        }
      }
    }

    if (rejectedCallsCount > 0 || rawEvent.includes('CALL')) {
      return {
        success: true,
        processed: rejectedCallsCount,
        event: 'CALL_AUTO_REJECTED',
        status: 'rejected',
      };
    }
  }

  // 3. Normalisasi Daftar Pesan
  let messagesList: any[] = [];
  if (Array.isArray(payload.data)) {
    messagesList = payload.data;
  } else if (Array.isArray(payload.data?.messages)) {
    messagesList = payload.data.messages;
  } else if (payload.data && typeof payload.data === 'object') {
    messagesList = [payload.data];
  } else if (Array.isArray(payload.messages)) {
    messagesList = payload.messages;
  } else if (payload.message) {
    messagesList = [payload];
  }

  let processedCount = 0;

  for (const item of messagesList) {
    const key = item.key || {};
    const rawFrom = String(key.remoteJid || item.sender || '');
    if (!rawFrom) continue;
    if (rawFrom === 'status@broadcast' || rawFrom.endsWith('@broadcast')) continue;

    const isGroup = rawFrom.includes('@g.us');
    let senderPhone = normalizeWhatsAppNumber(rawFrom);
    if (isGroup) {
      const partJid = String(
        key.participantAlt ||
        item.participantAlt ||
        key.participant ||
        item.participant ||
        ''
      );
      const cleanPart = normalizeWhatsAppNumber(partJid);
      if (cleanPart) {
        senderPhone = cleanPart;
      }
    }
    if (!senderPhone) continue;

    const messageExternalId = key.id || item.id || undefined;

    // HARDENING_V1: Durable deduplication check (Redis + DB messages record). Duplicate event -> direct NO-OP!
    if (hardeningPolicy === 'HARDENING_V1' && messageExternalId) {
      const dedupCheck = await isDuplicateWebhookEvent({
        externalId: messageExternalId,
        tenantId,
        tenantSlug,
        senderPhone,
      });

      if (dedupCheck.isDuplicate) {
        console.info(
          `[Evolution Webhook] HARDENING_V1 Deduplication: event ${messageExternalId} from ${senderPhone} already processed. Direct NO-OP.`,
          {
            hardening_policy_version: 'HARDENING_V1',
            external_id: messageExternalId,
            tenant_slug: tenantSlug,
            sender_phone: senderPhone,
          }
        );
        processedCount++;
        continue; // Direct NO-OP per requirement!
      }
    }

    const rawMsgEarly = item.message || {};
    const textBodyEarly = (
      rawMsgEarly.conversation ||
      rawMsgEarly.extendedTextMessage?.text ||
      rawMsgEarly.imageMessage?.caption ||
      ''
    ).trim();
    const cleanCmdLower = textBodyEarly.toLowerCase();

    // =========================================================================
    // 2B. fromMe Webhook Handling:
    // 1. Echo Detection (Using tenant_id + wa_message_id) -> MUST RUN BEFORE parseBotControlCommand!
    //    If echo: ignore event immediately (return 200/NO-OP), DO NOT trigger manual CS takeover, DO NOT set pause 24 jam!
    // 2. Admin Command Override (#pause / #resume from connected bot device)
    // 3. CS Manual Mobile Outbound Takeover (HUMAN_PAUSED + 24h sliding window)
    // =========================================================================
    if (key.fromMe === true) {
      if (!isGroup && senderPhone) {
        // Step 1: Detect bot outbound echo using tenantId + wa_message_id (with DB fallback for restarts)
        const echoResult = await isBotOutboundAsync({
          tenantId,
          messageId: key.id || undefined,
          recipientPhone: senderPhone,
          text: textBodyEarly,
          supabase,
        });

        if (echoResult === 'MATCH') {
          console.info(
            `[Evolution Webhook] Bot outbound echo detected for ${senderPhone} (tenant: ${tenantId}, msgId: ${key.id || 'n/a'}). Ignoring event seketika (NO-OP).`
          );
          // Return 200 / ignore event seketika: JANGAN evaluasi command, JANGAN trigger manual CS takeover, JANGAN set pause 24 jam!
          continue;
        }

        if (echoResult === 'UNKNOWN') {
          console.warn(
            `[Evolution Webhook] Echo detection returned UNKNOWN (DB timeout/error) for ${senderPhone} (tenant: ${tenantId}, msgId: ${key.id || 'n/a'}). DILARANG memicu human takeover (preventing false self-pause). Quarantined / NO-OP.`
          );
          // Quarantined / NO-OP: JANGAN trigger manual CS takeover, JANGAN set status HUMAN_PAUSED!
          continue;
        }

        // Step 2: Not an echo! Now evaluate whether admin/operator typed a bot control command from WhatsApp Web / bot device:
        const controlCmd = parseBotControlCommand(textBodyEarly);
        if (controlCmd) {
          // RBAC Gatekeeper: Pastikan validasi pengirim tidak mengizinkan role leak dari level percakapan ke tenant.
          // Pada event fromMe = true, remoteJid (senderPhone) adalah nomor kontak pembeli.
          // Pengirim sesungguhnya di perangkat adalah botPhoneNumber atau participantPhone (jika dalam group).
          const participantPhone = key.participant ? toCanonicalPhone(key.participant) : undefined;
          const candidateControllers = Array.from(new Set([botPhoneNumber, participantPhone].filter(Boolean))) as string[];

          let resolvedAuth = {
            authorized: false,
            role: 'none',
            canControlTenant: false,
            canControlContact: false,
          };
          let authorizedPhone = '';

          for (const cand of candidateControllers) {
            const authRes = await resolveBotControllerRole({
              senderPhone: cand,
              tenantId,
              tenantSlug,
              supabase,
            });
            if (authRes.authorized) {
              resolvedAuth = authRes;
              authorizedPhone = cand;
              break;
            }
          }

          const isTenantScope = controlCmd.scope === 'TENANT';
          const isPermitted = isTenantScope ? resolvedAuth.canControlTenant : resolvedAuth.canControlContact;

          if (isPermitted) {
            console.info(`[Evolution Admin Override] Authorized Command ${controlCmd.action} (${controlCmd.scope}) fromMe on tenant ${tenantId} by ${authorizedPhone} (role: ${resolvedAuth.role})`);
            const targetScope = isTenantScope ? 'tenant' : 'conversation';
            const targetCustomerPhone = !isTenantScope ? senderPhone : undefined;
            const ctrlRes = await executeBotControl({
              action: controlCmd.action,
              scope: targetScope,
              tenantId,
              tenantSlug,
              customerPhone: targetCustomerPhone,
              senderPhone: authorizedPhone,
              userRole: resolvedAuth.role,
              source: 'admin_from_me',
              supabase,
            });

            await sendEvolutionTextMessage(instanceName, senderPhone, ctrlRes.message, resolvedApiKey, tenantId);
            processedCount++;
            continue; // Halt turn: prevent control command from reaching LLM context!
          } else {
            console.warn(
              `[Evolution Admin Override] Forbidden fromMe bot control attempt (${controlCmd.action} / ${controlCmd.scope}) on tenant ${tenantId}. Candidate phones: ${candidateControllers.join(', ')}, role: ${resolvedAuth.role}`
            );
            if (resolvedAuth.authorized && isTenantScope && !resolvedAuth.canControlTenant) {
              await sendEvolutionTextMessage(
                instanceName,
                senderPhone,
                '⚠️ *[AKSES DITOLAK]* Perintah #on / #off tingkat toko (TENANT) hanya dapat dieksekusi oleh Owner atau Admin.',
                resolvedApiKey,
                tenantId
              );
            }
            // DO NOT forward to LLM
            continue;
          }
        }

        // Step 3: Not an echo, and not a bot control command -> Real Human CS Mobile Outbound Message Takeover!
        const nowIso = new Date().toISOString();
        const pausedUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        console.info(`[Human Takeover] Mobile CS outbound message to ${senderPhone} on tenant ${tenantId}. Setting status to HUMAN_HANDOVER (24h sliding window).`);
        if (supabase) {
          try {
            const tenantUuid = tenantRecordForHardening?.id || tenantId;
            const csTable = supabase.from('conversation_sessions');
            if (typeof csTable?.upsert === 'function') {
              await csTable.upsert({
                tenant_id: tenantUuid,
                session_id: `wa_${tenantUuid}_${senderPhone}`,
                channel: 'WHATSAPP',
                user_identifier: senderPhone,
                current_state: 'HUMAN_PAUSED',
                bot_status: 'HUMAN_HANDOVER',
                is_paused: true,
                paused_at: nowIso,
                paused_by: 'cs_mobile_outbound',
                paused_until: pausedUntilIso,
                metadata: {
                  auto_pause: true,
                  triggered_by: 'cs_mobile_outbound',
                  paused_at: nowIso,
                  paused_until: pausedUntilIso,
                },
                updated_at: nowIso,
              }, { onConflict: 'tenant_id,user_identifier' });
            }

            const phoneVariants = [senderPhone, cleanCustomerPhone(senderPhone)].filter(Boolean);
            const convTable = supabase.from('conversations');
            if (typeof convTable?.update === 'function') {
              let uQ = convTable.update({
                bot_paused: true,
                is_paused: true,
                is_bot_paused: true,
                is_bot_active: false,
                bot_mode: 'HUMAN_ACTIVE',
                status: 'HUMAN_PAUSED',
                last_message: textBodyEarly || 'Pesan terkirim dari CS',
                last_message_at: nowIso,
                updated_at: nowIso,
              });
              if (typeof uQ?.or === 'function') {
                uQ = uQ.or(`tenant_slug.eq.${tenantId},tenant_id.eq.${tenantUuid}`);
              }
              if (typeof uQ?.in === 'function') {
                await uQ.in('customer_phone', phoneVariants);
              } else if (typeof uQ?.eq === 'function') {
                await uQ.eq('customer_phone', senderPhone);
              }
            }

            // Database is Single Source of Truth: update cache ONLY AFTER db write confirms
            setRuntimeSessionCache({
              tenantId: tenantUuid,
              userIdentifier: senderPhone,
              isPaused: true,
              botStatus: 'HUMAN_HANDOVER',
              pausedUntil: pausedUntilIso,
              pausedBy: 'cs_mobile_outbound',
            });

            if (textBodyEarly) {
              await persistOutboundMessage({
                tenantId: tenantUuid,
                tenantSlug: tenantSlug || tenantId,
                customerPhone: senderPhone,
                senderType: 'agent',
                senderName: 'CS Manual (WhatsApp HP)',
                messageBody: textBodyEarly,
                externalId: key.id || undefined,
              });
            }
          } catch (hErr) {
            console.warn('[Evolution Webhook] Mobile CS auto-pause error:', hErr);
          }
        }
        // Outbound message - don't increment processedCount (inbound counter)
        continue;
      }
      // Pesan fromMe lainnya (e.g. status broadcast) -> BYPASS / NO ACTION
      continue;
    }

    // =========================================================================
    // 2C. Inbound Admin Command Handling from external phone (Customer/Owner chat)
    // =========================================================================
    if (!isGroup && senderPhone) {
      const controlCmd = parseBotControlCommand(textBodyEarly);
      if (controlCmd) {
        const authRes = await resolveBotControllerRole({
          senderPhone,
          tenantId,
          tenantSlug,
          supabase,
        });

        const isTenantScope = controlCmd.scope === 'TENANT';
        const isPermitted = isTenantScope ? authRes.canControlTenant : authRes.canControlContact;

        if (isPermitted) {
          console.info(`[Evolution Admin Ingress] Authorized Command ${controlCmd.action} (${controlCmd.scope}) by ${senderPhone} (role: ${authRes.role}) on tenant ${tenantId}`);
          const targetScope = isTenantScope ? 'tenant' : 'conversation';
          const targetCustomerPhone = !isTenantScope ? senderPhone : undefined;
          const ctrlRes = await executeBotControl({
            action: controlCmd.action,
            scope: targetScope,
            tenantId,
            tenantSlug,
            customerPhone: targetCustomerPhone,
            senderPhone,
            userRole: authRes.role,
            source: 'owner_inbound_chat',
            supabase,
          });

          await sendEvolutionTextMessage(instanceName, senderPhone, ctrlRes.message, resolvedApiKey, tenantId);
          processedCount++;
          continue; // Halt turn: prevent control command from reaching LLM context!
        } else {
          console.warn(`[Evolution Admin Ingress] Unauthorized/forbidden control command attempt by ${senderPhone} (role: ${authRes.role}): ${textBodyEarly}`);
          if (authRes.authorized && isTenantScope && !authRes.canControlTenant) {
            await sendEvolutionTextMessage(
              instanceName,
              senderPhone,
              '⚠️ *[AKSES DITOLAK]* Perintah #on / #off tingkat toko (TENANT) hanya dapat dieksekusi oleh Owner atau Admin.',
              resolvedApiKey,
              tenantId
            );
          }
          // Crucial: Pastikan teks perintah kontrol tidak pernah diteruskan ke LLM sebagai percakapan!
          processedCount++;
          continue; // Drop / halt turn so command is NEVER passed to LLM!
        }
      }
    }

    // Group Mention Guard (§39.1): Merchant accounts strictly for 1-on-1 chats
    if (isGroup) {
      const cleanBotPhone = (resolvedTenant?.ownerPhone || botPhoneNumber || '').replace(/\D/g, '');
      const isOfficial =
        tenantId === 'boon' ||
        tenantId === '52967979-4760-4cea-b686-cdbdb389c0e1' ||
        instanceName === 'boontrack-shop' ||
        instanceName === 'boontrack-app-shop' ||
        cleanBotPhone === '6281215567168' ||
        cleanBotPhone === '081215567168';

      if (!isOfficial) {
        console.warn(`[Evolution Webhook] Group message dropped for merchant '${tenantId}' in ${rawFrom}`);
        continue;
      }

      const rawText =
        item.message?.conversation ||
        item.message?.extendedTextMessage?.text ||
        item.message?.imageMessage?.caption ||
        '';
      const rawTrimmed = rawText.trim().toLowerCase();
      const isDirectIdCommand = rawTrimmed === '/id' || rawTrimmed === '!id' || rawTrimmed === '@boon id';

      // Group Mention Regex Guard (§39.1):
      // Pastikan nomor platform 6281215567168 merespons jika memuat regex /@(boon|boontrack|081215567168)\b/i
      const groupMentionRegex = /@(boon|boontrack|081215567168)\b/i;
      const isGroupMentionMatch = groupMentionRegex.test(rawText);

      const mentionedJids: string[] =
        item.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const isBotJidMentioned = Array.isArray(mentionedJids) && mentionedJids.some((jid) =>
        typeof jid === 'string' && (jid.includes('6281215567168') || jid.includes('081215567168'))
      );

      const wakeWord = isBoonPilotWakeWordTriggered(rawText, true, 'WHATSAPP');
      const hasMention = wakeWord.triggered || isDirectIdCommand || isGroupMentionMatch || isBotJidMentioned;
      if (!hasMention) {
        continue;
      }

      // FITUR CEK ID INSTAN (@boon id / /id / !id)
      const cleanLower = wakeWord.cleanText.trim().toLowerCase();
      const isIdCommand =
        isDirectIdCommand ||
        cleanLower === 'id' ||
        cleanLower === '/id' ||
        cleanLower === '!id' ||
        cleanLower === 'cek id' ||
        rawTrimmed.startsWith('@boon id') ||
        rawTrimmed.startsWith('/id') ||
        rawTrimmed.startsWith('!id');

      if (isIdCommand) {
        const idReply = `🆔 *ID Grup WhatsApp Ini:*\n\`${rawFrom}\`\n\nSalin ID di atas untuk dimasukkan ke dashboard affiliate.`;
        await sendEvolutionTextMessage(instanceName, rawFrom, idReply, resolvedApiKey);
        processedCount++;
        continue;
      }

      // CEK APAKAH PESAN MERUPAKAN PERTANYAAN NYATA ATAU HANYA SALAM SINGKAT
      const cleanQuery = (wakeWord.cleanText || '').trim();
      const isJustGreeting =
        !cleanQuery ||
        /^(halo|hai|hi|hello|p|ping|start|test|tes|yo|bro|kak|min|mimin|gan|boss|assalamualaikum|waalaikumsalam|apa kabar|selamat pagi|selamat siang|selamat malam)[\.\!\?]?$/i.test(cleanQuery);

      if (isJustGreeting) {
        // CEK KOLAM KOMUNITAS AFILIASI DI CHANNEL_BINDINGS (§43) → Dynamic community context
        try {
          const commCtx = await resolveCommunityContext(rawFrom, supabase);

          if (commCtx.binding_id) {
            const replyText =
              `👋 *Halo dari BoonTrack!*\n` +
              `Platform otomatisasi checkout & katalog digital 24 jam untuk pebisnis online & UKM.\n\n` +
              `🛍️ *Cek Contoh Demo:*\n${commCtx.demo_store_url}\n\n` +
              `🚀 *Buka Toko Online / Coba Gratis:*\n${commCtx.registration_url}`;

            await sendEvolutionTextMessage(instanceName, rawFrom, replyText, resolvedApiKey);
            processedCount++;
            continue;
          }
        } catch (waErr) {
          console.warn('[Evolution WA Group Community Trigger Error]:', waErr);
        }
      }

      // PERTANYAAN NYATA DI GRUP (@boon) → Kirim ke BoonPilot Platform Chat (Gemini LLM / Fallback) & balas ke Grup
      try {
        const platformResult = await processBoonPilotPlatformChat(
          {
            senderPhone,
            message: cleanQuery || rawText,
            channel_type: 'WAHA',
            community_source_id: rawFrom,
          },
          supabase
        );

        if (platformResult.reply && platformResult.reply.trim()) {
          await sendEvolutionTextMessage(instanceName, rawFrom, platformResult.reply.trim(), resolvedApiKey);

          await persistOutboundMessage({
            tenantId,
            tenantSlug: tenantSlug || tenantId,
            customerPhone: rawFrom,
            senderType: 'bot',
            senderName: platformResult.role === 'MERCHANT' ? 'BoonPilot Toko' : 'BoonPilot Konsultan',
            messageBody: platformResult.reply.trim(),
            externalId: item.key?.id ? `bot_group_reply_${item.key.id}` : undefined,
            rawPayload: { trigger: 'boonpilot_group_mention', groupJid: rawFrom, senderPhone, role: platformResult.role },
          });
        }
      } catch (groupAiErr) {
        console.warn('[Evolution WA Group AI Error]:', groupAiErr);
      }

      processedCount++;
      continue;
    }


    // 3.5. Deteksi Pesan Lokasi (Location Message)
    const rawMsg = item.message || {};
    const locMessage =
      rawMsg.locationMessage ||
      rawMsg.liveLocationMessage ||
      rawMsg.viewOnceMessage?.message?.locationMessage ||
      rawMsg.viewOnceMessageV2?.message?.locationMessage ||
      rawMsg.ephemeralMessage?.message?.locationMessage ||
      (item.messageType === 'locationMessage' ? rawMsg : null);

    const rawLat = locMessage?.degreesLatitude ?? locMessage?.latitude;
    const rawLng = locMessage?.degreesLongitude ?? locMessage?.longitude;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    const hasLocation = Boolean(locMessage && !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0));
    const locName = String(locMessage?.name || '').trim();
    const locAddress = String(locMessage?.address || '').trim();

    const locationData = hasLocation
      ? {
          latitude: lat,
          longitude: lng,
          name: locName || locAddress || 'Titik Lokasi Pembeli',
          address: locAddress || undefined,
        }
      : undefined;

    const locLabel = locName
      ? locAddress
        ? `${locName} (${locAddress})`
        : locName
      : locAddress || `${lat}, ${lng}`;

    // 4. Deteksi Pesan Gambar (Image Message)
    const imageMessage =
      rawMsg.imageMessage ||
      rawMsg.viewOnceMessage?.message?.imageMessage ||
      rawMsg.viewOnceMessageV2?.message?.imageMessage ||
      rawMsg.ephemeralMessage?.message?.imageMessage ||
      (item.messageType === 'imageMessage' ? rawMsg : null);

    const hasImage = Boolean(imageMessage);
    const caption =
      imageMessage?.caption ||
      rawMsg.extendedTextMessage?.text ||
      rawMsg.conversation ||
      '';

    let base64Data: string | null = null;
    let mimeType = 'image/jpeg';

    if (hasImage) {
      // 5. Unduh Base64 Media dari Evolution API
      const mediaResult = await getEvolutionMediaBase64(instanceName, item, resolvedApiKey);
      base64Data = mediaResult.base64;
      mimeType = mediaResult.mimeType || 'image/jpeg';
    }

    const textBody = caption.trim() || rawMsg.conversation || rawMsg.extendedTextMessage?.text || '';

    // Cek Pola Aktivasi Akun Toko: "AKTIVASI BT-XXXX" atau "BT-XXXX" (hanya jika bukan order manual)
    if (!isManualOrderMessage(textBody)) {
      const activation = extractActivationCode(textBody);
      if (activation && supabase) {
        const activationRes = await processStoreActivation({
          codeOrText: textBody,
          senderPhone,
          customSupabase: supabase,
        });

        await sendEvolutionTextMessage(
          instanceName,
          senderPhone,
          activationRes.replyMessage,
          resolvedApiKey
        );

        processedCount++;
        continue;
      }
    }

    // 6. Ingest ke Conversations & Messages Schema (Atomic Database Persistence)
    let convId: string | null = null;
    const lastPreview = hasLocation
      ? `📍 [Lokasi Pin]: ${locLabel}`
      : hasImage
      ? caption
        ? `📷 ${caption}`
        : '📷 [Gambar]'
      : textBody;

    try {
      const persisted = await persistInboundMessage({
        tenantId: tenantId,
        tenantSlug: tenantSlug || tenantId,
        customerPhone: senderPhone,
        customerName: item.pushName || senderPhone,
        messageBody: lastPreview || (hasLocation ? '📍 [Lokasi Pin]' : hasImage ? '[Gambar dikirim pembeli]' : ''),
        senderType: 'customer',
        externalId: item.key?.id || undefined,
        messageType: hasLocation ? 'LOCATION' : hasImage ? 'IMAGE' : 'TEXT',
        locationData,
        rawPayload: {
          has_image: hasImage,
          has_location: hasLocation,
          mime_type: hasImage ? mimeType : undefined,
          type: hasLocation ? 'location' : hasImage ? 'image' : 'text',
          ...(hasLocation ? { is_location: true, location: locationData } : {}),
          source: 'evolution_webhook',
        },
      });
      convId = persisted.conversationId;
    } catch (dbErr) {
      console.warn('[Evolution Webhook] DB logging error:', dbErr);
    }

    // Jika ini adalah pesan pin lokasi, instant shipping sudah otomatis terpicu dan dibalas via persistInboundMessage
    if (hasLocation) {
      console.info(`[Evolution Webhook] Location pin processed for ${senderPhone}. Instant courier handling complete.`);
      processedCount++;
      continue;
    }

    // 6.1. INTERCEPTOR ORDER TRANSAKSI (ORDER GATEKEEPER)
    // Cek apakah isi pesan mengandung pola order manual: "Total Nominal:", "Metode: Transfer Bank", "Mohon dicek dan aktivasi akses", atau "Masterclass CPM"
    if (isManualOrderMessage(textBody)) {
      console.info(`[ORDER_GATEKEEPER] Intercepted manual order from ${senderPhone} on tenant '${tenantId}'. Bypassing AI/LLM.`);
      const nowIso = new Date().toISOString();

      const isUuid = (val?: string | null) =>
        Boolean(val && /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(String(val).trim()));

      let storeName =
        (resolvedTenant.tenantName && !isUuid(resolvedTenant.tenantName) ? resolvedTenant.tenantName.trim() : '') ||
        (tenantSlug && !isUuid(tenantSlug)
          ? tenantSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : 'Admin Toko');

      if (supabase && (!storeName || storeName === 'Admin Toko')) {
        try {
          const { data: tRow } = await supabase
            .from('tenants')
            .select('name')
            .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
            .maybeSingle();
          if (tRow?.name && !isUuid(tRow.name)) storeName = tRow.name.trim();
        } catch {}
      }

      await markSessionAsPendingVerification({
        supabase,
        tenantId,
        senderPhone,
        textBody,
        convId,
        storeName,
      });

      const orderConfirmReply = getOrderConfirmationReply(storeName);

      await sendEvolutionTextMessage(
        instanceName,
        senderPhone,
        orderConfirmReply,
        resolvedApiKey
      );

      await persistOutboundMessage({
        tenantId: tenantId,
        tenantSlug: tenantSlug || tenantId,
        customerPhone: senderPhone,
        senderType: 'bot',
        senderName: 'OrderGatekeeper',
        messageBody: orderConfirmReply,
        rawPayload: { trigger: 'order_gatekeeper' },
      });

      processedCount++;
      continue; // JANGAN panggil AI / Gemini / OpenAI prompt!
    }

    // 6.1B. PARSER NOTIFIKASI PEMBAYARAN / MUTASI GATEWAY (TETAP BERJALAN SAAT STATUS BOT PAUSED)
    // Cek apakah isi pesan merupakan notifikasi transfer/QRIS/e-wallet (BCA, Mandiri, BRI, DANA, GoPay, ShopeePay, dll.)
    const paymentParsed = parsePaymentNotification(textBody);
    if (paymentParsed.amount && paymentParsed.amount > 0 && supabase) {
      console.info(
        `[PAYMENT_INTERCEPTOR] Detected payment notification amount Rp ${paymentParsed.amount} (${paymentParsed.detectedApp || 'GATEWAY'}) from ${senderPhone} on tenant '${tenantId}'. Processing mutation...`
      );
      try {
        const phoneVariants = [senderPhone, cleanCustomerPhone(senderPhone)].filter(Boolean);
        let orderQuery: any = supabase
          .from('orders')
          .select('id, order_number, order_id, invoice_no, gross_amount, customer_phone, customer_name, product_title')
          .or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantSlug || tenantId}`)
          .or('status.eq.PENDING,status.eq.WAITING_PAYMENT,status.eq.UNPAID,payment_status.eq.PENDING');

        if (phoneVariants.length > 0 && typeof orderQuery?.in === 'function') {
          orderQuery = orderQuery.in('customer_phone', phoneVariants);
        }
        if (typeof orderQuery?.order === 'function') {
          orderQuery = orderQuery.order('created_at', { ascending: false });
        }
        if (typeof orderQuery?.limit === 'function') {
          orderQuery = orderQuery.limit(10);
        }

        const { data: candidateOrders } = await orderQuery;
        const matchedOrder = candidateOrders?.find(
          (o: any) => Number(o.gross_amount) === paymentParsed.amount
        );

        if (matchedOrder) {
          const nowIso = new Date().toISOString();
          const targetOrderId = matchedOrder.id;
          const displayOrderNum =
            matchedOrder.order_number || matchedOrder.order_id || matchedOrder.invoice_no || targetOrderId;

          await supabase
            .from('orders')
            .update({
              status: 'PAID',
              payment_status: 'PAID',
              paid_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', targetOrderId);

          try {
            await supabase.from('order_audit_logs').insert({
              order_id: targetOrderId,
              action: 'PAYMENT_VERIFIED_VIA_WHATSAPP_MUTATION',
              actor_type: 'SYSTEM',
              actor_name: `WhatsApp Payment Parser (${paymentParsed.detectedApp || 'Gateway'})`,
              notes: `Pembayaran terverifikasi otomatis melalui parsing notifikasi: Rp ${paymentParsed.amount}`,
              created_at: nowIso,
            });
          } catch (_) {}

          try {
            const { dispatchMetaCAPIPurchaseForOrder } = await import('@/lib/capi.service');
            await dispatchMetaCAPIPurchaseForOrder({
              tenantSlug: tenantSlug || tenantId,
              orderId: targetOrderId,
              amount: paymentParsed.amount,
              customerPhone: senderPhone,
              customerName: matchedOrder.customer_name,
              contentName: matchedOrder.product_title,
              currency: 'IDR',
            });
          } catch (cErr) {
            console.warn('[Payment Interceptor] CAPI dispatch error:', cErr);
          }

          const replyText =
            `🎉 *PEMBAYARAN DITERIMA & DIVERIFIKASI!*\n\n` +
            `Halo Kak! Pembayaran sebesar *Rp ${paymentParsed.amount.toLocaleString('id-ID')}* (${paymentParsed.detectedApp || 'Pembayaran'}) untuk pesanan *#${displayOrderNum}* telah berhasil diverifikasi.\n\n` +
            `📦 *Layanan:* ${matchedOrder.product_title || 'Pesanan Anda'}\n` +
            `✅ *Status:* LUNAS (PAID)\n\n` +
            `Terima kasih! Pesanan Anda segera diproses. 🙏`;

          if (hardeningPolicy === 'HARDENING_V1') {
            // HARDENING_V1: Mode notifikasi outbox / worker async agar status pembayaran PENDING -> PAID tidak terhambat pengiriman WhatsApp
            enqueueOutboxMessage({
              tenant_id: tenantId,
              recipient: senderPhone,
              recipient_phone: senderPhone,
              channel: 'WHATSAPP',
              payload: {
                type: 'text',
                text: { body: replyText, preview_url: false },
              },
            }).catch((err: any) => console.warn('[Payment Notification Outbox] Enqueue warning:', err));

            sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey)
              .catch((err: any) => console.warn('[Payment Notification Async] Send warning:', err));
          } else {
            await sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey);
          }

          await persistOutboundMessage({
            tenantId,
            tenantSlug: tenantSlug || tenantId,
            customerPhone: senderPhone,
            senderType: 'bot',
            senderName: 'PaymentGatekeeper',
            messageBody: replyText,
            rawPayload: {
              trigger: 'payment_mutation_matched',
              order_id: targetOrderId,
              amount: paymentParsed.amount,
              hardening_policy_version: hardeningPolicy,
            },
          });

          processedCount++;
          continue; // JANGAN panggil AI / Gemini / OpenAI prompt!
        }
      } catch (pErr) {
        console.warn('[Payment Interceptor] Error processing payment mutation:', pErr);
      }
    }

    // 6.2. Deteksi Buyer Escalation Intent (Kunci Sesi & Alihkan ke Admin Manusia)
    const BUYER_ESCALATION_PATTERN = /\b(admin|cs|manusia|human|operator|bicara dengan orang|bantuan orang|ngobrol sama admin|mau cs|kang sakti|owner|pemilik|live cs|hubungi cs|chat cs|bantuan admin)\b/i;
    if (BUYER_ESCALATION_PATTERN.test(textBody)) {
      const nowIso = new Date().toISOString();
      const pausedUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const transitionText = 'Baik kak, obrolan ini saya teruskan langsung ke Admin kami ya. Sistem otomatis saya jeda agar admin kami bisa membalas manual. Mohon ditunggu sebentar ya kak 🙏';

      if (supabase) {
        try {
          await supabase.from('conversation_sessions').upsert({
            tenant_id: tenantId,
            session_id: `wa_${tenantId}_${senderPhone}`,
            channel: 'WHATSAPP',
            user_identifier: senderPhone,
            current_state: 'HANDOVER_TO_HUMAN',
            is_paused: true,
            paused_at: nowIso,
            paused_by: 'buyer_escalation',
            paused_until: pausedUntilIso,
            metadata: { handover_reason: 'buyer_escalation', paused_by: 'buyer_escalation', paused_at: nowIso, trigger_text: textBody.slice(0, 100) },
            updated_at: nowIso,
          }, { onConflict: 'tenant_id,user_identifier' });

          if (convId) {
            await supabase.from('conversations').update({
              bot_paused: true,
              bot_mode: 'HUMAN_ACTIVE',
              status: 'unassigned',
              updated_at: nowIso,
            }).eq('id', convId);
          }
        } catch (sErr) {
          console.warn('[Evolution Webhook] Handover session save error:', sErr);
        }
      }

      await sendEvolutionTextMessage(
        instanceName,
        senderPhone,
        transitionText,
        resolvedApiKey
      );

      if (supabase && convId) {
        try {
          await supabase.from('messages').insert({
            conversation_id: convId,
            tenant_slug: tenantId,
            tenant_id: tenantId,
            sender: 'bot',
            user_name: 'CS',
            text: transitionText,
            channel: 'whatsapp',
            created_at: nowIso,
          });
        } catch (_) {}
      }

      processedCount++;
      continue;
    }

    // 6.2B. HARDENING_V1: Clinical Safety Gate (Pre-LLM Acute Danger & Emergency Interceptor)
    if (hardeningPolicy === 'HARDENING_V1' && textBody) {
      const clinicalSafety = evaluateClinicalSafetyGate(textBody);
      if (clinicalSafety.isEmergency) {
        console.warn(
          `[Evolution Webhook] HARDENING_V1 Clinical Emergency triggered for ${senderPhone} (${clinicalSafety.label}). Halting AI and escalating to medical team.`,
          {
            hardening_policy_version: 'HARDENING_V1',
            category: clinicalSafety.category,
            matched_keywords: clinicalSafety.matchedKeywords,
            tenant_slug: tenantSlug,
            sender_phone: senderPhone,
          }
        );

        const nowIso = new Date().toISOString();
        const pausedUntilIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        if (supabase) {
          try {
            await supabase.from('conversation_sessions').upsert(
              {
                tenant_id: tenantId,
                session_id: `wa_${tenantId}_${senderPhone}`,
                channel: 'WHATSAPP',
                user_identifier: senderPhone,
                current_state: 'HANDOVER_TO_HUMAN',
                is_paused: true,
                paused_at: nowIso,
                paused_by: 'clinical_emergency_safety_gate',
                paused_until: pausedUntilIso,
                metadata: {
                  handover_reason: 'clinical_emergency_safety_gate',
                  emergency_category: clinicalSafety.category,
                  matched_keywords: clinicalSafety.matchedKeywords,
                  paused_at: nowIso,
                  trigger_text: textBody.slice(0, 100),
                  hardening_policy_version: 'HARDENING_V1',
                },
                updated_at: nowIso,
              },
              { onConflict: 'tenant_id,user_identifier' }
            );

            if (convId) {
              await supabase
                .from('conversations')
                .update({
                  bot_paused: true,
                  bot_mode: 'HUMAN_ACTIVE',
                  status: 'emergency_escalation',
                  updated_at: nowIso,
                })
                .eq('id', convId);
            }
          } catch (gateErr) {
            console.warn('[Evolution Webhook] Clinical gate session lock warning:', gateErr);
          }
        }

        await sendEvolutionTextMessage(
          instanceName,
          senderPhone,
          clinicalSafety.replyMessage,
          resolvedApiKey
        );

        await persistOutboundMessage({
          tenantId: tenantId,
          tenantSlug: tenantSlug || tenantId,
          customerPhone: senderPhone,
          senderType: 'bot',
          senderName: 'ClinicalSafetyGate',
          messageBody: clinicalSafety.replyMessage,
          rawPayload: {
            trigger: 'clinical_safety_gate',
            category: clinicalSafety.category,
            matched_keywords: clinicalSafety.matchedKeywords,
            hardening_policy_version: 'HARDENING_V1',
          },
        });

        processedCount++;
        continue; // Deterministic AI STOP! Do NOT call Gemini LLM!
      }
    }

    // 6.3. Active Pause Gate (Auto-Mute: Balasan Otomatis Ditahan jika is_paused == true / bot_paused == true)
    // FAIL-CLOSED POLICY: If pause / tenant status check fails or cannot be verified, terminate processing immediately!
    if (supabase) {
      try {
        // A0. Cek Status Global Bot Toko (Global #pause / Dashboard Toggle)
        let isTenantGlobalPaused = false;
        const { data: tRow, error: tErr } = await supabase
          .from('tenants')
          .select('id, slug, bot_paused, is_bot_active, metadata')
          .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
          .maybeSingle();

        if (tErr) {
          console.error(`[Evolution Webhook Gate FAIL-CLOSED] Tenant status lookup failed for '${tenantId}':`, tErr);
          processedCount++;
          continue; // FAIL-CLOSED: Stop processing, do NOT schedule AI outbound!
        }

        const tenantDecision = await checkRuntimeBotDecisionGate({
          tenant: tRow,
          textBody,
          senderPhone,
          supabase,
        });

        if (tenantDecision.shouldBypass) {
          isTenantGlobalPaused = true;
        }

        if (isTenantGlobalPaused) {
          console.info(`[Evolution Webhook Muted] Bot toko '${tenantSlug || tenantId}' sedang DIJEDA GLOBAL (#pause / Dashboard Toggle). AI Bot tidak boleh membalas.`);
          processedCount++;
          continue;
        }

        const cleanSender = toCanonicalPhone(senderPhone) || senderPhone.replace(/\D/g, '');
        const phone62 = cleanSender.startsWith('0') ? '62' + cleanSender.slice(1) : cleanSender;
        const phone08 = cleanSender.startsWith('62') ? '0' + cleanSender.slice(2) : cleanSender;
        const phoneVariants = Array.from(new Set([senderPhone, cleanSender, phone62, phone08])).filter(Boolean);
        const tenantTokens = Array.from(new Set([tenantId, tenantSlug].filter(Boolean))) as string[];

        const uuidTokens = tenantTokens.filter(tok => /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tok));
        const slugTokens = tenantTokens.filter(tok => !/^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tok));

        let convOrClause = '';
        if (uuidTokens.length > 0 && slugTokens.length > 0) {
          convOrClause = `tenant_id.in.(${uuidTokens.join(',')}),tenant_slug.in.(${slugTokens.join(',')})`;
        } else if (uuidTokens.length > 0) {
          convOrClause = `tenant_id.in.(${uuidTokens.join(',')})`;
        } else {
          convOrClause = `tenant_slug.in.(${slugTokens.join(',')})`;
        }

        // B. Cek tabel conversation_sessions (Session Level Pause / Handover & Timeout Expiry)
        let isSessionPaused = false;
        let isSessionExpired = false;
        let sessionPauseReason = '';

        let sessQuery: any = supabase
          .from('conversation_sessions')
          .select('session_id, current_state, is_paused, bot_status, paused_until, paused_at, paused_by, metadata');

        if (typeof sessQuery?.in === 'function') {
          sessQuery = sessQuery.in('tenant_id', tenantTokens);
          if (typeof sessQuery?.in === 'function') {
            sessQuery = sessQuery.in('user_identifier', phoneVariants);
          }
        } else if (typeof sessQuery?.eq === 'function') {
          sessQuery = sessQuery.eq('tenant_id', tenantTokens[0] || tenantId);
        }
        if (typeof sessQuery?.limit === 'function') {
          sessQuery = sessQuery.limit(5);
        }

        const sessRes = await (sessQuery || Promise.resolve({ data: null, error: null }));
        if (sessRes?.error) {
          console.error(`[Evolution Webhook Gate FAIL-CLOSED] Session status lookup failed for '${senderPhone}':`, sessRes.error);
          processedCount++;
          continue; // FAIL-CLOSED: Stop processing, do NOT schedule AI outbound!
        }

        const sessData = sessRes?.data;
        if (Array.isArray(sessData) && sessData.length > 0) {
          for (const s of sessData) {
            const sessionDecision = await checkRuntimeBotDecisionGate({
              tenant: null,
              session: s,
              textBody,
              senderPhone,
              supabase,
            });

            if (sessionDecision.shouldBypass) {
              isSessionPaused = true;
              sessionPauseReason = `conversation_sessions table (state: ${s.current_state}, paused_by: ${s.paused_by || 'admin'})`;
              break;
            } else if (sessionDecision.reason === 'AUTO_RESUMED_EXPIRED' || sessionDecision.reason?.startsWith('AUTO_')) {
              isSessionExpired = true;
            }
          }
        }

        // A. Cek tabel conversations (dengan sinkronisasi expiry time)
        let isConvPaused = false;
        let convPauseReason = '';

        if (!isSessionExpired) {
          let convQuery: any = supabase
            .from('conversations')
            .select('id, bot_paused, is_paused, is_bot_paused, is_bot_active, bot_mode, status');

          if (typeof convQuery?.or === 'function') {
            convQuery = convQuery.or(convOrClause);
          }
          if (typeof convQuery?.in === 'function') {
            convQuery = convQuery.in('customer_phone', phoneVariants);
          } else if (typeof convQuery?.eq === 'function') {
            convQuery = convQuery.eq('customer_phone', phoneVariants[0] || senderPhone);
          }
          if (typeof convQuery?.limit === 'function') {
            convQuery = convQuery.limit(5);
          }

          const convRes = await convQuery;
          if (convRes?.error) {
            console.error(`[Evolution Webhook Gate FAIL-CLOSED] Conversation status lookup failed for '${senderPhone}':`, convRes.error);
            processedCount++;
            continue; // FAIL-CLOSED: Stop processing, do NOT schedule AI outbound!
          }

          const convData = convRes?.data;
          if (Array.isArray(convData) && convData.length > 0) {
            const pausedConv = convData.find((c: any) =>
              c.bot_paused === true ||
              c.is_paused === true ||
              c.is_bot_paused === true ||
              c.is_bot_active === false ||
              c.bot_mode === 'HUMAN_ACTIVE' ||
              c.status === 'paused' ||
              c.status === 'human_takeover' ||
              c.status === 'HUMAN_PAUSED'
            );

            if (pausedConv) {
              isConvPaused = true;
              convPauseReason = `conversations table (id: ${pausedConv.id}, bot_paused: ${pausedConv.bot_paused}, is_paused: ${pausedConv.is_paused}, bot_mode: ${pausedConv.bot_mode}, status: ${pausedConv.status})`;
            }
          }
        } else {
          // Jika session sudah expired / auto-resumed, sinkronkan conversations table agar bot_paused & is_paused = false
          try {
            const cUpdate = supabase
              .from('conversations')
              .update({
                bot_paused: false,
                is_paused: false,
                is_bot_paused: false,
                is_bot_active: true,
                bot_mode: 'AI_ACTIVE',
                status: 'active',
                updated_at: new Date().toISOString(),
              });
            let cQ = typeof cUpdate?.or === 'function' ? cUpdate.or(convOrClause) : cUpdate;
            if (typeof cQ?.in === 'function') {
              await cQ.in('customer_phone', phoneVariants);
            } else if (typeof cQ?.eq === 'function') {
              await cQ.eq('customer_phone', senderPhone);
            }

            setRuntimeSessionCache({
              tenantId,
              userIdentifier: senderPhone,
              isPaused: false,
              botStatus: 'BOT_ACTIVE',
              pausedUntil: null,
              pausedBy: null,
            });
          } catch (_) {}
        }

        if (isSessionPaused || isConvPaused) {
          console.info(`[Evolution Webhook Muted] Chat WhatsApp dari '${senderPhone}' sedang DIJEDA (${convPauseReason || sessionPauseReason}). AI Bot tidak boleh membalas (Bypass LLM & Outbound).`);
          processedCount++;
          continue;
        }
      } catch (checkErr) {
        console.error('[Evolution Webhook Gate FAIL-CLOSED] Active pause check exception, halting AI outbound:', checkErr);
        processedCount++;
        continue; // FAIL-CLOSED: Stop execution, do NOT schedule AI outbound!
      }
    } else {
      console.error('[Evolution Webhook Gate FAIL-CLOSED] Database client unavailable, halting AI outbound');
      processedCount++;
      continue;
    }

    // 7. Teruskan ke Engine Chat / Dual-Role Platform / Gemini Multimodal Pipeline
    const promptText = hasImage
      ? caption.trim() || 'Tolong analisa gambar ini sesuai konteks toko.'
      : textBody;

    if (!promptText && !hasImage) {
      continue;
    }

    // Extra Guard: Pastikan teks perintah kontrol tidak pernah diteruskan ke LLM sebagai percakapan!
    if (parseBotControlCommand(promptText)) {
      console.info(`[Evolution Webhook Gate] Suppressed bot control command from reaching LLM context: "${promptText}"`);
      processedCount++;
      continue;
    }

    const isOfficialBot =
      instanceName === 'boontrack-app-shop' ||
      instanceName === 'boontrack-shop' ||
      (tenantId === 'boon' && !instanceName.includes('gateway'));

    if (isOfficialBot && !isGroup && !hasImage) {
      const resolution = await resolveBoonPilotSender(senderPhone, supabase);
      const chatRes = await processBoonPilotPlatformChat(
        {
          senderPhone,
          message: promptText,
          image_base64: base64Data || undefined,
          mime_type: mimeType,
        },
        supabase
      );

      if (chatRes.reply && chatRes.reply.trim()) {
        await sendEvolutionTextMessage(
          instanceName,
          senderPhone,
          chatRes.reply.trim(),
          resolvedApiKey
        );

        await persistOutboundMessage({
          tenantId: resolution.tenant?.id || tenantId,
          tenantSlug: resolution.tenant?.slug || tenantSlug || tenantId,
          customerPhone: senderPhone,
          senderType: 'bot',
          senderName: resolution.role === 'MERCHANT' ? 'BoonPilot Toko' : 'BoonPilot Konsultan',
          messageBody: chatRes.reply.trim(),
          externalId: item.key?.id ? `bot_reply_${item.key.id}` : undefined,
          rawPayload: { trigger: 'boonpilot_platform_dual_role', role: resolution.role },
        });

        processedCount++;
        continue;
      }
    }

    const isUuid = (val?: string | null) =>
      Boolean(val && /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(String(val).trim()));

    const storeDisplayName =
      (resolvedTenant.tenantName && !isUuid(resolvedTenant.tenantName) ? resolvedTenant.tenantName.trim() : '') ||
      (tenantSlug && !isUuid(tenantSlug)
        ? tenantSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : 'Toko Kami');

    let conversationHistory: Array<{ role: 'user' | 'model'; text: string }> = [];
    let hasPreviousBotGreeting = false;

    if (supabase) {
      try {
        const cleanSender = senderPhone.replace(/\D/g, '');
        const phoneVariants = Array.from(
          new Set([
            senderPhone,
            cleanSender,
            cleanSender.startsWith('0') ? '62' + cleanSender.slice(1) : cleanSender,
            cleanSender.startsWith('62') ? '0' + cleanSender.slice(2) : cleanSender,
          ])
        ).filter(Boolean);
        const tenantTokens = Array.from(new Set([tenantId, tenantSlug].filter(Boolean))) as string[];

        // Check if there are existing messages in this conversation
        let msgQuery = supabase
          .from('messages')
          .select('sender, text, created_at')
          .order('created_at', { ascending: false })
          .limit(8);

        if (convId) {
          msgQuery = msgQuery.eq('conversation_id', convId);
        } else {
          const uuidTokens = tenantTokens.filter(tok => /^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tok));
          const slugTokens = tenantTokens.filter(tok => !/^[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}$/i.test(tok));

          let msgOrClause = '';
          if (uuidTokens.length > 0 && slugTokens.length > 0) {
            msgOrClause = `tenant_id.in.(${uuidTokens.join(',')}),tenant_slug.in.(${slugTokens.join(',')})`;
          } else if (uuidTokens.length > 0) {
            msgOrClause = `tenant_id.in.(${uuidTokens.join(',')})`;
          } else {
            msgOrClause = `tenant_slug.in.(${slugTokens.join(',')})`;
          }

          msgQuery = msgQuery
            .or(msgOrClause)
            .in('customer_phone', phoneVariants);
        }

        const { data: recentMsgs } = await msgQuery;

        if (recentMsgs && recentMsgs.length > 0) {
          hasPreviousBotGreeting = recentMsgs.some(
            (m: any) => m.sender === 'bot' || (m as any).sender_type === 'bot'
          );

          conversationHistory = recentMsgs
            .reverse()
            .map((m: any) => ({
              role: (m.sender === 'customer' || m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
              text: m.text || '',
            }));
        }

        // Also check conversation_sessions state
        const { data: sessRow } = await supabase
          .from('conversation_sessions')
          .select('current_state')
          .in('tenant_id', tenantTokens)
          .in('user_identifier', phoneVariants)
          .maybeSingle();

        if (sessRow?.current_state && sessRow.current_state !== 'GREETING') {
          hasPreviousBotGreeting = true;
        }
      } catch (histErr) {
        console.warn('[Evolution Webhook] Error fetching conversation history:', histErr);
      }
    }

    const aiResult = await processMultimodalChat({
      tenant_slug: tenantSlug || tenantId,
      tenant_id: tenantId,
      message: promptText,
      text: promptText,
      image_base64: base64Data || undefined,
      mime_type: mimeType,
      sender_phone: senderPhone,
      user_identifier: senderPhone,
      channel: 'WHATSAPP',
      conversation_history: conversationHistory,
      context: {
        storeName: storeDisplayName,
        hasPreviousBotGreeting,
      },
    });

    // 8. Kirim Balasan AI ke Pelanggan via Evolution API
    if (aiResult.reply && aiResult.reply.trim()) {
      // Simulasi Typing Alami (Human-like delay 3 - 5 detik) dengan composing presence
      await sendEvolutionPresence(
        instanceName,
        senderPhone,
        'composing',
        resolvedApiKey
      );

      const naturalDelayMs = process.env.NODE_ENV === 'test' ? 10 : Math.floor(Math.random() * 2000) + 3000; // 3000ms - 5000ms
      await new Promise((resolve) => setTimeout(resolve, naturalDelayMs));

      // Jika ada media QRIS dinamis (Hybrid Checkout), kirim gambar QRIS terlebih dahulu
      if (aiResult.media_url) {
        await sendEvolutionMediaMessage(
          instanceName,
          senderPhone,
          aiResult.media_url,
          aiResult.media_caption || 'QRIS Pembayaran Konsultasi',
          resolvedApiKey
        );

        await persistOutboundMessage({
          tenantId: tenantId,
          tenantSlug: tenantSlug || tenantId,
          customerPhone: senderPhone,
          senderType: 'bot',
          senderName: 'Asisten Klinik',
          messageBody: '[QRIS Dinamis Pembayaran Konsultasi]',
          messageType: 'image',
          externalId: item.key?.id ? `bot_qris_${item.key.id}` : undefined,
          rawPayload: { trigger: 'qris_hybrid_dispatch', media_url: aiResult.media_url },
        });

        // Jeda alami 1.5 detik antara gambar QRIS dan rincian teks invoice
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      await sendEvolutionTextMessage(
        instanceName,
        senderPhone,
        aiResult.reply.trim(),
        resolvedApiKey
      );

      // Catat balasan bot di messages & update conversations
      await persistOutboundMessage({
        tenantId: tenantId,
        tenantSlug: tenantSlug || tenantId,
        customerPhone: senderPhone,
        senderType: 'bot',
        senderName: aiResult.media_url ? 'Asisten Klinik' : 'BoonPilot CS',
        messageBody: aiResult.reply.trim(),
        externalId: item.key?.id ? `bot_reply_${item.key.id}` : undefined,
        rawPayload: { trigger: 'gemini_multimodal' },
      });

      // Update session state to ACTIVE in conversation_sessions
      if (supabase) {
        try {
          const nowIso = new Date().toISOString();
          const targetTenantId = tenantSlug || tenantId;
          await supabase.from('conversation_sessions').upsert(
            {
              tenant_id: targetTenantId,
              session_id: `wa_${targetTenantId}_${senderPhone}`,
              channel: 'WHATSAPP',
              user_identifier: senderPhone,
              current_state: 'ACTIVE',
              updated_at: nowIso,
            },
            { onConflict: 'tenant_id,user_identifier' }
          );
        } catch (_) {}
      }
    }

    processedCount++;
  }

  return { success: true, processed: processedCount };
}
