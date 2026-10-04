import { isBoonPilotWakeWordTriggered } from '@/lib/boonpilot/wake-word';
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
import { resolveBoonPilotSender } from '@/lib/boonpilot/sender-resolver';
import { processBoonPilotPlatformChat } from '@/lib/boonpilot/platform-engine';

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
        // CEK KOLAM KOMUNITAS AFILIASI DI CHANNEL_BINDINGS (§43) → static greeting
        if (supabase) {
          try {
            const { data: waBinding } = await supabase
              .from('channel_bindings')
              .select('*')
              .eq('community_source_id', rawFrom)
              .eq('is_active', true)
              .maybeSingle();

            const affId = waBinding?.affiliate_id || 'boon';
            const demoUrl = waBinding?.demo_url || 'https://shop.boontrack.com/boon';
            const registerUrl =
              (waBinding?.metadata as Record<string, string>)?.register_url ||
              `https://shop.boontrack.com/register?ref=${encodeURIComponent(affId)}`;

            const replyText =
              `👋 *Halo dari BoonTrack!*\n` +
              `Platform otomatisasi checkout & katalog digital 24 jam untuk pebisnis online & UKM.\n\n` +
              `🛍️ *Cek Contoh Demo:*\n${demoUrl}\n\n` +
              `🚀 *Buka Toko Online / Coba Gratis:*\n${registerUrl}`;

            await sendEvolutionTextMessage(instanceName, rawFrom, replyText, resolvedApiKey);
            processedCount++;
            continue;
          } catch (waErr) {
            console.warn('[Evolution WA Group Community Trigger Error]:', waErr);
          }
        }
        // If supabase unavailable, fall through to Gemini below with group context
      }

      // PERTANYAAN NYATA → Kirim ke Gemini AI & balas ke Grup (rawFrom = group JID)
      try {
        const groupAiResult = await processMultimodalChat({
          tenant_slug: tenantSlug || tenantId,
          tenant_id: tenantId,
          message: cleanQuery || rawText,
          text: cleanQuery || rawText,
          sender_phone: senderPhone,
          user_identifier: senderPhone,
          channel: 'WHATSAPP',
          context: {
            isGroupChat: true,
            groupJid: rawFrom,
            storeName: 'BoonTrack',
          },
        });

        if (groupAiResult.reply && groupAiResult.reply.trim()) {
          await sendEvolutionTextMessage(instanceName, rawFrom, groupAiResult.reply.trim(), resolvedApiKey);

          await persistOutboundMessage({
            tenantId,
            tenantSlug: tenantSlug || tenantId,
            customerPhone: rawFrom,
            senderType: 'bot',
            senderName: 'BoonPilot Grup',
            messageBody: groupAiResult.reply.trim(),
            externalId: item.key?.id ? `bot_group_reply_${item.key.id}` : undefined,
            rawPayload: { trigger: 'boonpilot_group_gemini', groupJid: rawFrom, senderPhone },
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

    // 6.3. Active Pause Gate (Auto-Mute: Balasan Otomatis Ditahan jika is_paused == true / bot_paused == true)
    if (supabase) {
      try {
        const cleanSender = senderPhone.replace(/\D/g, '');
        const phone62 = cleanSender.startsWith('0') ? '62' + cleanSender.slice(1) : cleanSender;
        const phone08 = cleanSender.startsWith('62') ? '0' + cleanSender.slice(2) : cleanSender;
        const phoneVariants = Array.from(new Set([senderPhone, cleanSender, phone62, phone08])).filter(Boolean);
        const tenantTokens = Array.from(new Set([tenantId, tenantSlug].filter(Boolean))) as string[];

        // A. Cek tabel conversations (Toggle Jeda Bot di Menu Inbox)
        let isConvPaused = false;
        let convPauseReason = '';

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

        const convQuery = supabase
          .from('conversations')
          .select('id, bot_paused, bot_mode, status')
          .or(convOrClause)
          .in('customer_phone', phoneVariants)
          .limit(5);

        const { data: convData } = await convQuery;
        if (Array.isArray(convData) && convData.length > 0) {
          const pausedConv = convData.find((c: any) =>
            c.bot_paused === true ||
            c.is_bot_paused === true ||
            c.is_bot_active === false ||
            c.bot_mode === 'HUMAN_ACTIVE' ||
            c.status === 'paused' ||
            c.status === 'human_takeover'
          );

          if (pausedConv) {
            isConvPaused = true;
            convPauseReason = `conversations table (id: ${pausedConv.id}, bot_paused: ${pausedConv.bot_paused}, bot_mode: ${pausedConv.bot_mode}, status: ${pausedConv.status})`;
          }
        }

        // B. Cek tabel conversation_sessions (Session Level Pause / Handover)
        let isSessionPaused = false;
        let sessionPauseReason = '';

        const sessQuery = supabase
          .from('conversation_sessions')
          .select('current_state, is_paused, paused_until, paused_at, paused_by, metadata')
          .in('tenant_id', tenantTokens)
          .in('user_identifier', phoneVariants)
          .limit(5);

        const { data: sessData } = await sessQuery;
        if (Array.isArray(sessData) && sessData.length > 0) {
          const pausedSess = sessData.find((s: any) => {
            const isStatePaused = s.current_state === 'HANDOVER_TO_HUMAN' || s.current_state === 'PAUSED' || s.current_state === 'human_takeover';
            const isFlagPaused = Boolean(s.is_paused) || Boolean(s.metadata?.is_bot_paused);
            const pUntil = s.paused_until ? new Date(s.paused_until) : null;
            return (isStatePaused || isFlagPaused) && (!pUntil || pUntil.getTime() > Date.now());
          });

          if (pausedSess) {
            isSessionPaused = true;
            sessionPauseReason = `conversation_sessions table (state: ${pausedSess.current_state}, paused_by: ${pausedSess.paused_by || 'admin'})`;
          }
        }

        if (isConvPaused || isSessionPaused) {
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

      // Only short-circuit if platform engine matched a deterministic fast-path.
      // Non-deterministic fallback (isDeterministicMatch === false) falls through
      // to Gemini AI for an intelligent answer with full Knowledge Base context.
      if (chatRes.isDeterministicMatch !== false) {
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
            senderName: resolution.role === 'MERCHANT' ? 'BoonPilot Toko' : 'BoonTrack Concierge',
            messageBody: chatRes.reply.trim(),
            externalId: item.key?.id ? `bot_reply_${item.key.id}` : undefined,
            rawPayload: { trigger: 'boonpilot_platform_dual_role', role: resolution.role },
          });
        }

        processedCount++;
        continue;
      }
      // isDeterministicMatch === false → fall through to Gemini AI below
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
