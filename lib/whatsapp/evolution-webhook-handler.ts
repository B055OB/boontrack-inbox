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
} from '@/lib/whatsapp/outbound-registry';
import { parsePaymentNotification } from '@/lib/payment-webhook-service';
import { resolveHardeningPolicy } from '@/lib/resolvers/tenant-runtime-resolver';
import { isDuplicateWebhookEvent } from '@/lib/hardening/deduplication';
import { evaluateClinicalSafetyGate } from '@/lib/hardening/clinical-safety-gate';
import { enqueueOutboxMessage } from '@/lib/outbox/enqueue';

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  'https://evolution-api-production-abb7.up.railway.app';

const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY ||
  '4398809d97f770b1a2b243ed0ee33bf3312d02dec42be8789ea3512f487f4c5e';

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
  const apiKey = customApiKey || EVOLUTION_API_KEY;
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
  customApiKey?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = customApiKey || EVOLUTION_API_KEY;
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
  const apiKey = customApiKey || EVOLUTION_API_KEY;
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
  const apiKey = customApiKey || EVOLUTION_API_KEY;
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
  let resolvedApiKey = EVOLUTION_API_KEY;

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
  if (resolvedTenant.apiKey) {
    resolvedApiKey = resolvedTenant.apiKey;
  }

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
    const senderPhone = rawFrom.split('@')[0].replace(/\D/g, '');
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

    // 2B. Admin Command Override & Outbound fromMe Handling
    if (key.fromMe === true) {
      if (!isGroup && senderPhone) {
        // STEP 1: Cek Outbound Registry. Jika pesan ini dikirim oleh bot/sistem kita sendiri, abaikan (BYPASS / JANGAN SELF-PAUSE).
        if (
          isBotOutbound({
            messageId: key.id || undefined,
            recipientPhone: senderPhone,
            text: textBodyEarly,
          })
        ) {
          console.info(
            `[Evolution Webhook] Bot outbound echo detected for ${senderPhone} (msgId: ${key.id || 'n/a'}). Bypassing auto-pause.`
          );
          continue;
        }

        const nowIso = new Date().toISOString();
        const cmdClean = cleanCmdLower.trim();

        // 1. GLOBAL COMMAND: #resume
        if (cmdClean === '#resume' || cmdClean === 'resume') {
          console.info(`[Evolution Admin Override] GLOBAL RESUME on tenant ${tenantId}`);
          if (supabase) {
            try {
              // Update tenants metadata.bot_paused = false
              const { data: tRow } = await supabase
                .from('tenants')
                .select('metadata')
                .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
                .maybeSingle();
              const meta = tRow?.metadata || {};
              meta.bot_paused = false;
              meta.is_bot_paused = false;
              await supabase
                .from('tenants')
                .update({ metadata: meta, updated_at: nowIso })
                .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`);

              // Update semua sesi conversation_sessions.is_paused = false
              await supabase
                .from('conversation_sessions')
                .update({
                  is_paused: false,
                  paused_until: null,
                  current_state: 'ACTIVE',
                  updated_at: nowIso,
                  metadata: { manual_toggle: 'GLOBAL_RESUME', resumed_at: nowIso },
                })
                .or(`tenant_id.eq.${tenantId},tenant_id.eq.${tenantSlug || tenantId}`);

              // Update semua conversations bot_paused = false
              await supabase
                .from('conversations')
                .update({
                  bot_paused: false,
                  bot_mode: 'AI_ACTIVE',
                  status: 'active',
                  updated_at: nowIso,
                })
                .or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantSlug || tenantId}`);
            } catch (sErr) {
              console.warn('[Evolution Webhook] Global resume error:', sErr);
            }
          }

          const replyText = '🤖 *[SISTEM]* Bot AI aktif untuk SEMUA percakapan.';
          await sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey);
          processedCount++;
          continue;
        }

        // 2. GLOBAL COMMAND: #pause
        if (cmdClean === '#pause' || cmdClean === 'pause') {
          console.info(`[Evolution Admin Override] GLOBAL PAUSE on tenant ${tenantId}`);
          if (supabase) {
            try {
              const { data: tRow } = await supabase
                .from('tenants')
                .select('metadata')
                .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
                .maybeSingle();
              const meta = tRow?.metadata || {};
              meta.bot_paused = true;
              meta.is_bot_paused = true;
              await supabase
                .from('tenants')
                .update({ metadata: meta, updated_at: nowIso })
                .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`);
            } catch (sErr) {
              console.warn('[Evolution Webhook] Global pause error:', sErr);
            }
          }

          const replyText = '⏸️ *[SISTEM]* Bot AI dinonaktifkan GLOBAL (semua percakapan masuk mode manual).';
          await sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey);
          processedCount++;
          continue;
        }

        // 3. LOCAL COMMAND: #on (Hanya untuk Lawan Bicara / Sesi Terkait)
        if (cmdClean === '#on' || cmdClean === 'on') {
          console.info(`[Evolution Admin Override] LOCAL ON for ${senderPhone} on tenant ${tenantId}`);
          if (supabase) {
            try {
              await supabase.from('conversation_sessions').upsert({
                tenant_id: tenantId,
                session_id: `wa_${tenantId}_${senderPhone}`,
                channel: 'WHATSAPP',
                user_identifier: senderPhone,
                current_state: 'ACTIVE',
                is_paused: false,
                paused_at: null,
                paused_by: 'admin_command',
                paused_until: null,
                metadata: { manual_toggle: 'ON', paused_reason: null, resumed_by: 'admin_command', resumed_at: nowIso },
                updated_at: nowIso,
              }, { onConflict: 'tenant_id,user_identifier' });

              const phoneVariants = [senderPhone, cleanCustomerPhone(senderPhone)].filter(Boolean);
              await supabase
                .from('conversations')
                .update({
                  bot_paused: false,
                  bot_mode: 'AI_ACTIVE',
                  status: 'active',
                  updated_at: nowIso,
                })
                .or(`tenant_slug.eq.${tenantId},tenant_id.eq.${tenantId}`)
                .in('customer_phone', phoneVariants);
            } catch (sErr) {
              console.warn('[Evolution Webhook] Local ON error:', sErr);
            }
          }

          const replyText = '🟢 *[SISTEM]* Bot AI aktif kembali untuk nomor ini.';
          await sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey);
          processedCount++;
          continue;
        }

        // 4. LOCAL COMMAND: #off (Hanya untuk Lawan Bicara / Sesi Terkait)
        if (cmdClean === '#off' || cmdClean === 'off') {
          console.info(`[Evolution Admin Override] LOCAL OFF for ${senderPhone} on tenant ${tenantId}`);
          if (supabase) {
            try {
              await supabase.from('conversation_sessions').upsert({
                tenant_id: tenantId,
                session_id: `wa_${tenantId}_${senderPhone}`,
                channel: 'WHATSAPP',
                user_identifier: senderPhone,
                current_state: 'HUMAN_PAUSED',
                is_paused: true,
                paused_at: nowIso,
                paused_by: 'admin_command',
                paused_until: null,
                metadata: { manual_toggle: 'OFF', paused_reason: 'MANUAL_OFF', paused_by: 'admin_command', paused_at: nowIso },
                updated_at: nowIso,
              }, { onConflict: 'tenant_id,user_identifier' });

              const phoneVariants = [senderPhone, cleanCustomerPhone(senderPhone)].filter(Boolean);
              await supabase
                .from('conversations')
                .update({
                  bot_paused: true,
                  bot_mode: 'HUMAN_ACTIVE',
                  status: 'HUMAN_PAUSED',
                  updated_at: nowIso,
                })
                .or(`tenant_slug.eq.${tenantId},tenant_id.eq.${tenantId}`)
                .in('customer_phone', phoneVariants);
            } catch (sErr) {
              console.warn('[Evolution Webhook] Local OFF error:', sErr);
            }
          }

          const replyText = '🔴 *[SISTEM]* Bot AI dimatikan khusus untuk nomor ini (CS Manual Takeover).';
          await sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey);
          processedCount++;
          continue;
        } else {
          // Auto-Pause via Mobile: Pesan keluar dari HP (fromMe === true bukan bot registry dan bukan admin command)
          // Berasal dari CS Manual mengetik di WhatsApp HP / WhatsApp Web resmi toko.
          // Wajib mengubah status ke HUMAN_PAUSED dengan sliding window paused_until = now + 24 jam.
          const pausedUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          console.info(`[Human Takeover] Mobile CS outbound message to ${senderPhone} on tenant ${tenantId}. Setting status to HUMAN_PAUSED (24h sliding window).`);
          if (supabase) {
            try {
              const csTable = supabase.from('conversation_sessions');
              if (typeof csTable?.upsert === 'function') {
                await csTable.upsert({
                  tenant_id: tenantId,
                  session_id: `wa_${tenantId}_${senderPhone}`,
                  channel: 'WHATSAPP',
                  user_identifier: senderPhone,
                  current_state: 'HUMAN_PAUSED',
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
                  bot_mode: 'HUMAN_ACTIVE',
                  status: 'HUMAN_PAUSED',
                  last_message: textBodyEarly || 'Pesan terkirim dari CS',
                  last_message_at: nowIso,
                  updated_at: nowIso,
                });
                if (typeof uQ?.or === 'function') {
                  uQ = uQ.or(`tenant_slug.eq.${tenantId},tenant_id.eq.${tenantId}`);
                }
                if (typeof uQ?.in === 'function') {
                  await uQ.in('customer_phone', phoneVariants);
                } else if (typeof uQ?.eq === 'function') {
                  await uQ.eq('customer_phone', senderPhone);
                }
              }

              if (textBodyEarly) {
                await persistOutboundMessage({
                  tenantId,
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
      }
      // Pesan admin biasa lainnya -> BYPASS / NO ACTION
      continue;
    }

    // Group Mention Guard: Merchant accounts strictly for 1-on-1 chats
    if (isGroup) {
      const isOfficial =
        tenantId === 'boon' ||
        tenantId === '52967979-4760-4cea-b686-cdbdb389c0e1' ||
        instanceName === 'boontrack-shop' ||
        instanceName === 'boontrack-app-shop' ||
        senderPhone === '6281215567168';

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

      const wakeWord = isBoonPilotWakeWordTriggered(rawText, true, 'WHATSAPP');
      const hasMention = wakeWord.triggered || isDirectIdCommand;
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

    // Cek Pola Aktivasi Akun Toko: "AKTIVASI BT-XXXX"
    const activationMatch = textBody.match(/AKTIVASI\s+([A-Za-z0-9_-]+)/i);
    if (activationMatch && supabase) {
      const token = activationMatch[1].toUpperCase().trim();
      const { data: actTenant } = await supabase
        .from('tenants')
        .select('id, slug, name, metadata')
        .eq('metadata->>wa_verification_token', token)
        .maybeSingle();

      if (actTenant) {
        const curMeta = actTenant.metadata || {};
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const verifiedAt = new Date().toISOString();

        await supabase
          .from('tenants')
          .update({
            status: 'active',
            is_active: true,
            trial_ends_at: trialEndsAt,
            metadata: {
              ...curMeta,
              wa_verification_status: 'verified',
              wa_verified_at: verifiedAt,
              wa_verified_phone: senderPhone,
              phone: senderPhone,
              whatsapp_number: senderPhone,
            },
            updated_at: verifiedAt,
          })
          .eq('id', actTenant.id);

        await sendEvolutionTextMessage(
          instanceName,
          senderPhone,
          'Selamat! Nomor WhatsApp Anda berhasil diverifikasi. Akun toko Anda sudah aktif. Silakan kembali ke browser untuk mulai menggunakan BoonTrack.',
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
            }).catch((err) => console.warn('[Payment Notification Outbox] Enqueue warning:', err));

            sendEvolutionTextMessage(instanceName, senderPhone, replyText, resolvedApiKey)
              .catch((err) => console.warn('[Payment Notification Async] Send warning:', err));
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
    if (supabase) {
      try {
        // A0. Cek Status Global Bot Toko (Global #pause)
        let isTenantGlobalPaused = false;
        try {
          const { data: tRow } = await supabase
            .from('tenants')
            .select('metadata')
            .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
            .maybeSingle();
          if (tRow?.metadata?.bot_paused === true || tRow?.metadata?.is_bot_paused === true) {
            isTenantGlobalPaused = true;
          }
        } catch (_) {}

        if (isTenantGlobalPaused) {
          console.info(`[Evolution Webhook Muted] Bot toko '${tenantSlug || tenantId}' sedang DIJEDA GLOBAL (#pause). AI Bot tidak boleh membalas.`);
          processedCount++;
          continue;
        }

        const cleanSender = senderPhone.replace(/\D/g, '');
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
          .select('session_id, current_state, is_paused, paused_until, paused_at, paused_by, metadata');

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

        const { data: sessData } = await (sessQuery || Promise.resolve({ data: null }));
        if (Array.isArray(sessData) && sessData.length > 0) {
          for (const s of sessData) {
            const isStatePaused =
              s.current_state === 'HUMAN_PAUSED' ||
              s.current_state === 'HANDOVER_TO_HUMAN' ||
              s.current_state === 'PAUSED' ||
              s.current_state === 'human_takeover';
            const isFlagPaused = Boolean(s.is_paused) || Boolean(s.metadata?.is_bot_paused);

            if (isStatePaused || isFlagPaused) {
              const pUntil = s.paused_until ? new Date(s.paused_until) : null;
              if (pUntil && pUntil.getTime() <= Date.now()) {
                // Timeout 24 jam telah kedaluwarsa -> Auto-Resume!
                console.info(`[Auto-Resume] Timeout pause kedaluwarsa untuk '${senderPhone}' (until: ${s.paused_until}). Mengembalikan bot ke mode aktif.`);
                isSessionExpired = true;
                try {
                  const updateRes = supabase.from('conversation_sessions').update({
                    is_paused: false,
                    current_state: 'ACTIVE',
                    paused_until: null,
                    updated_at: new Date().toISOString(),
                  });
                  if (typeof updateRes?.eq === 'function') {
                    await updateRes.eq('session_id', s.session_id);
                  }
                } catch (_) {}
              } else {
                isSessionPaused = true;
                sessionPauseReason = `conversation_sessions table (state: ${s.current_state}, paused_by: ${s.paused_by || 'admin'})`;
                break;
              }
            }
          }
        }

        // A. Cek tabel conversations (dengan sinkronisasi expiry time)
        let isConvPaused = false;
        let convPauseReason = '';

        if (!isSessionExpired) {
          let convQuery: any = supabase
            .from('conversations')
            .select('id, bot_paused, bot_mode, status');

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

          const { data: convData } = await convQuery;
          if (Array.isArray(convData) && convData.length > 0) {
            const pausedConv = convData.find((c: any) =>
              c.bot_paused === true ||
              c.is_bot_paused === true ||
              c.is_bot_active === false ||
              c.bot_mode === 'HUMAN_ACTIVE' ||
              c.status === 'paused' ||
              c.status === 'human_takeover' ||
              c.status === 'HUMAN_PAUSED'
            );

            if (pausedConv) {
              isConvPaused = true;
              convPauseReason = `conversations table (id: ${pausedConv.id}, bot_paused: ${pausedConv.bot_paused}, bot_mode: ${pausedConv.bot_mode}, status: ${pausedConv.status})`;
            }
          }
        } else {
          // Jika session sudah expired / auto-resumed, sinkronkan conversations table agar bot_paused = false
          try {
            const cUpdate = supabase
              .from('conversations')
              .update({
                bot_paused: false,
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
          } catch (_) {}
        }

        if (isSessionPaused || isConvPaused) {
          console.info(`[Evolution Webhook Muted] Chat WhatsApp dari '${senderPhone}' sedang DIJEDA (${convPauseReason || sessionPauseReason}). AI Bot tidak boleh membalas (Bypass LLM & Outbound).`);
          processedCount++;
          continue;
        }
      } catch (checkErr) {
        console.warn('[Evolution Webhook] Active pause check warning:', checkErr);
      }
    }

    // 7. Teruskan ke Engine Chat / Dual-Role Platform / Gemini Multimodal Pipeline
    const promptText = hasImage
      ? caption.trim() || 'Tolong analisa gambar ini sesuai konteks toko.'
      : textBody;

    if (!promptText && !hasImage) {
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
