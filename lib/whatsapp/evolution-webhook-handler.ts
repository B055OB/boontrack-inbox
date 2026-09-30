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
} from '@/lib/whatsapp/inbox-persistence';

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

  let cleanNumber = recipientPhone.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '62' + cleanNumber.slice(1);
  } else if (cleanNumber.startsWith('8')) {
    cleanNumber = '62' + cleanNumber;
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
        text: text.trim(),
      }),
    });

    return res.ok;
  } catch (err) {
    console.warn('[Evolution Send] Exception sending text message:', err);
    return false;
  }
}

/**
 * Main Webhook Event Processor for Evolution API.
 */
export async function processEvolutionWebhookEvent(
  payload: any,
  paramInstance?: string
): Promise<{ success: boolean; processed: number; event?: string; error?: string }> {
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
    const state = payload.data?.state || payload.state;
    const resolvedStatus = state === 'open' ? 'CONNECTED' : state === 'close' ? 'DISCONNECTED' : 'CONNECTING';

    if (supabase && instanceName) {
      await supabase
        .from('whatsapp_connections')
        .update({
          status: resolvedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('instance_name', instanceName);
    }

    return { success: true, processed: 1, event: rawEvent };
  }

  // 2. Resolve Tenant Identity from whatsapp_connections dynamically (Zero Hardcoding)
  let tenantId: string | null = null;
  let tenantSlug: string | null = null;
  let resolvedApiKey = EVOLUTION_API_KEY;

  const resolvedTenant = await resolveTenantFromConnection({ instanceName });
  if (resolvedTenant) {
    tenantId = resolvedTenant.tenantId;
    tenantSlug = resolvedTenant.tenantSlug;
    if (resolvedTenant.apiKey) {
      resolvedApiKey = resolvedTenant.apiKey;
    }
  } else if (supabase) {
    const { data: conn } = await supabase
      .from('whatsapp_connections')
      .select('tenant_id, credential_ref, status')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (conn?.tenant_id) {
      tenantId = conn.tenant_id;
      tenantSlug = conn.tenant_id;
      if (conn.credential_ref) {
        resolvedApiKey = conn.credential_ref.trim();
      }
    } else {
      // Cek berdasarkan metadata->>whatsapp_instance atau slug
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, slug, metadata')
        .or(`slug.eq.${instanceName},metadata->>whatsapp_instance.eq.${instanceName}`)
        .maybeSingle();

      if (tenant?.id) {
        tenantId = tenant.id;
        tenantSlug = tenant.slug;
      } else if (tenant?.slug) {
        tenantId = tenant.slug;
        tenantSlug = tenant.slug;
      }
    }
  }

  // ATURAN MUTLAK FAIL-CLOSED & ANTI-LEAK:
  // Jika tenant_id bernilai null atau tidak ter-resolve, bot HARUS DIAM (SILENT / SAFE DROP) dan log alert ke internal.
  // DILARANG KERAS mengirimkan template sales BoonTrack ke customer toko merchant mana pun.
  if (!tenantId) {
    console.warn(
      `[SECURITY_FAIL_CLOSED_DROP] Unable to resolve tenant identity for instance '${instanceName}'. Silently dropping webhook event to prevent merchant cross-tenant leak.`
    );
    return { success: true, processed: 0, error: 'Tenant unresolved (fail-closed silent drop)' };
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
    const senderPhone = rawFrom.split('@')[0].replace(/\D/g, '');
    if (!senderPhone) continue;

    const rawMsgEarly = item.message || {};
    const textBodyEarly = (
      rawMsgEarly.conversation ||
      rawMsgEarly.extendedTextMessage?.text ||
      rawMsgEarly.imageMessage?.caption ||
      ''
    ).trim();
    const cleanCmdLower = textBodyEarly.toLowerCase();

    // 2B. Admin Command Override (fromMe == true)
    if (key.fromMe === true) {
      if (!isGroup && senderPhone) {
        const nowIso = new Date().toISOString();
        if (cleanCmdLower === 'pause' || cleanCmdLower === '#pause') {
          console.info('[Evolution Admin Override] PAUSE for ' + senderPhone + ' on tenant ' + tenantId);
          const pausedUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          if (supabase) {
            try {
              await supabase.from('conversation_sessions').upsert({
                tenant_id: tenantId,
                session_id: 'wa_' + tenantId + '_' + senderPhone,
                channel: 'WHATSAPP',
                user_identifier: senderPhone,
                current_state: 'HANDOVER_TO_HUMAN',
                is_paused: true,
                paused_at: nowIso,
                paused_by: 'admin_command',
                paused_until: pausedUntilIso,
                metadata: { manual_toggle: 'PAUSE', paused_by: 'admin_command', paused_at: nowIso },
                updated_at: nowIso,
              }, { onConflict: 'tenant_id,user_identifier' });

              await supabase.from('conversations').update({
                bot_paused: true,
                bot_mode: 'HUMAN_ACTIVE',
                updated_at: nowIso,
              }).or('tenant_slug.eq.' + tenantId + ',tenant_id.eq.' + tenantId).eq('phone_number', senderPhone);
            } catch (sErr) {
              console.warn('[Evolution Webhook] Admin pause error:', sErr);
            }
          }
          processedCount++;
          continue;
        } else if (cleanCmdLower === 'resume' || cleanCmdLower === '#resume') {
          console.info('[Evolution Admin Override] RESUME for ' + senderPhone + ' on tenant ' + tenantId);
          if (supabase) {
            try {
              await supabase.from('conversation_sessions').upsert({
                tenant_id: tenantId,
                session_id: 'wa_' + tenantId + '_' + senderPhone,
                channel: 'WHATSAPP',
                user_identifier: senderPhone,
                current_state: 'ACTIVE',
                is_paused: false,
                paused_at: null,
                paused_by: 'admin_command',
                paused_until: null,
                metadata: { manual_toggle: 'RESUME', resumed_by: 'admin_command', resumed_at: nowIso },
                updated_at: nowIso,
              }, { onConflict: 'tenant_id,user_identifier' });

              await supabase.from('conversations').update({
                bot_paused: false,
                bot_mode: 'AI_ACTIVE',
                updated_at: nowIso,
              }).or('tenant_slug.eq.' + tenantId + ',tenant_id.eq.' + tenantId).eq('phone_number', senderPhone);
            } catch (sErr) {
              console.warn('[Evolution Webhook] Admin resume error:', sErr);
            }
          }
          processedCount++;
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
      const hasMention = /@(boon|boontrack|081215567168)\b/i.test(rawText);
      if (!hasMention) {
        continue;
      }
    }

    // 4. Deteksi Pesan Gambar (Image Message)
    const rawMsg = item.message || {};
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
    const lastPreview = hasImage
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
        messageBody: lastPreview || (hasImage ? '[Gambar dikirim pembeli]' : ''),
        senderType: 'customer',
        rawPayload: {
          has_image: hasImage,
          mime_type: hasImage ? mimeType : undefined,
          type: hasImage ? 'image' : 'text',
          source: 'evolution_webhook',
        },
      });
      convId = persisted.conversationId;
    } catch (dbErr) {
      console.warn('[Evolution Webhook] DB logging error:', dbErr);
    }

    // 6.1. INTERCEPTOR ORDER TRANSAKSI (ORDER GATEKEEPER)
    // Cek apakah isi pesan mengandung pola order manual: "Total Nominal:", "Metode: Transfer Bank", "Mohon dicek dan aktivasi akses", atau "Masterclass CPM"
    if (isManualOrderMessage(textBody)) {
      console.info(`[ORDER_GATEKEEPER] Intercepted manual order from ${senderPhone} on tenant '${tenantId}'. Bypassing AI/LLM.`);
      const nowIso = new Date().toISOString();

      let storeName = 'Admin Toko';
      if (supabase) {
        try {
          const { data: tRow } = await supabase
            .from('tenants')
            .select('name')
            .eq('slug', tenantId)
            .maybeSingle();
          if (tRow?.name) storeName = tRow.name;
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

    // 6.3. Active Pause Gate (Auto-Mute: Balasan Otomatis Ditahan jika is_paused == true)
    if (supabase) {
      try {
        const { data: activeSession } = await supabase
          .from('conversation_sessions')
          .select('current_state, is_paused, paused_until, paused_at, paused_by')
          .eq('tenant_id', tenantId)
          .eq('user_identifier', senderPhone)
          .maybeSingle();

        const isStatePaused = activeSession?.current_state === 'HANDOVER_TO_HUMAN' || activeSession?.current_state === 'PAUSED';
        const isFlagPaused = Boolean(activeSession?.is_paused);
        const pUntil = activeSession?.paused_until ? new Date(activeSession.paused_until) : null;
        const isLocked = (isStatePaused || isFlagPaused) && (!pUntil || pUntil.getTime() > Date.now());

        if (isLocked) {
          console.info(`[Evolution Webhook Muted] Sesi untuk '${senderPhone}' sedang dijeda (HANDOVER_TO_HUMAN/PAUSED by ${activeSession?.paused_by || 'unknown'}). Balasan bot ditahan.`);
          processedCount++;
          continue;
        }
      } catch (checkErr) {
        console.warn('[Evolution Webhook] Active pause check warning:', checkErr);
      }
    }

    // 7. Teruskan ke Engine Chat / Gemini Multimodal Pipeline
    const promptText = hasImage
      ? caption.trim() || 'Tolong analisa gambar ini sesuai konteks toko.'
      : textBody;

    if (!promptText && !hasImage) {
      continue;
    }

    const aiResult = await processMultimodalChat({
      tenant_slug: tenantId,
      tenant_id: tenantId,
      message: promptText,
      text: promptText,
      image_base64: base64Data || undefined,
      mime_type: mimeType,
      sender_phone: senderPhone,
      user_identifier: senderPhone,
      channel: 'WHATSAPP',
    });

    // 8. Kirim Balasan AI ke Pelanggan via Evolution API
    if (aiResult.reply && aiResult.reply.trim()) {
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
        senderName: 'BoonPilot CS',
        messageBody: aiResult.reply.trim(),
        rawPayload: { trigger: 'gemini_multimodal' },
      });
    }

    processedCount++;
  }

  return { success: true, processed: processedCount };
}
