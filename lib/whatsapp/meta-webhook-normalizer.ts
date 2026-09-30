/**
 * lib/whatsapp/meta-webhook-normalizer.ts
 * Inbound Event Normalizer & Handshake Verification for Meta WhatsApp Cloud API.
 *
 * Provides:
 * 1. Meta Webhook HMAC-SHA256 signature verification.
 * 2. GET handshake challenge verification (Meta hub.mode & verify_token).
 * 3. Payload parsing & normalization into standardized internal event schemas:
 *    - messages: text, interactive (button/list reply), media (image, doc, audio, video), location.
 *    - statuses: sent, delivered, read, failed (with error codes).
 * 4. Ingestion pipeline dispatcher mapping into internal conversations & message_outbox schemas.
 */

import crypto from 'crypto';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { ConversationEngine } from '@/lib/conversationEngine';
import { metaWabaAdapter } from '@/services/waba';
import { sendWhatsAppSessionMessage } from '@/lib/whatsapp';
import {
  isManualOrderMessage,
  getOrderConfirmationReply,
  markSessionAsPendingVerification,
} from '@/lib/whatsapp/order-interceptor';
import {
  persistInboundMessage,
  persistOutboundMessage,
} from '@/lib/whatsapp/inbox-persistence';

// ============================================================================
// Types
// ============================================================================

export interface NormalizedMetaMessage {
  id: string;
  from: string;
  senderPhone: string;
  senderName?: string;
  timestamp: number;
  isoTimestamp: string;
  type:
    | 'text'
    | 'interactive'
    | 'image'
    | 'document'
    | 'audio'
    | 'video'
    | 'location'
    | 'contacts'
    | 'sticker'
    | 'other';
  text: string;
  interactiveReply?: {
    type: 'button_reply' | 'list_reply';
    id: string;
    title: string;
    description?: string;
  };
  media?: {
    id: string;
    mime_type?: string;
    caption?: string;
    filename?: string;
    sha256?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  raw: any;
  fromMe: boolean;
  ctwa_clid?: string;
  referral?: {
    source_url?: string;
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    image_url?: string;
    video_url?: string;
    thumbnail_url?: string;
    ctwa_clid?: string;
    click_id?: string;
  };
}

export interface NormalizedMetaStatus {
  id: string;
  recipientId: string;
  recipientPhone: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: number;
  isoTimestamp: string;
  conversationId?: string;
  pricing?: {
    billable?: boolean;
    category?: string;
    pricing_model?: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: any;
  }>;
  raw: any;
}

export interface NormalizedMetaWebhookEvent {
  wabaId?: string;
  phoneNumberId: string | null;
  displayPhoneNumber?: string;
  messages: NormalizedMetaMessage[];
  statuses: NormalizedMetaStatus[];
  raw: any;
}

export interface WebhookChallengeResult {
  isValid: boolean;
  challenge: string;
  status: number;
  error?: string;
}

// ============================================================================
// 1. Signature Verification (HMAC-SHA256)
// ============================================================================

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
): boolean {
  const secret = appSecret || process.env.META_APP_SECRET;
  if (!secret) {
    // Non-production or unconfigured secret bypass only if no signature provided
    return !signatureHeader;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// ============================================================================
// 2. GET Handshake Challenge Verification
// ============================================================================

export function verifyMetaWebhookChallenge(
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): WebhookChallengeResult {
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge') || '';

  const validTokens = [
    process.env.META_WHATSAPP_VERIFY_TOKEN,
    process.env.META_VERIFY_TOKEN,
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    process.env.META_WEBHOOK_VERIFY_TOKEN,
    'boontrack_verify_secret',
    'boontrack_master_verify_token_2026',
    'boontrack_waba_webhook_verify_token',
  ].filter(Boolean) as string[];

  if (mode === 'subscribe' && token && validTokens.includes(token)) {
    return {
      isValid: true,
      challenge,
      status: 200,
    };
  }

  return {
    isValid: false,
    challenge: '',
    status: 403,
    error: 'Forbidden: Token mismatch',
  };
}

// ============================================================================
// 3. Payload Normalizer
// ============================================================================

export function parseMetaWebhookPayload(body: any): NormalizedMetaWebhookEvent {
  const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
  const change = Array.isArray(entry?.changes) ? entry.changes[0] : null;
  const value = change?.value || {};

  const rawPhoneId = value?.metadata?.phone_number_id;
  const phoneNumberId = rawPhoneId ? String(rawPhoneId).trim() : null;
  const displayPhoneNumber = value?.metadata?.display_phone_number || undefined;
  const wabaId = entry?.id ? String(entry.id).trim() : undefined;

  // Contact dictionary by wa_id for fast profile name resolution
  const contactsMap = new Map<string, string>();
  if (Array.isArray(value?.contacts)) {
    for (const c of value.contacts) {
      const waId = String(c?.wa_id || '').replace(/\D/g, '');
      const name = c?.profile?.name;
      if (waId && name) {
        contactsMap.set(waId, name);
      }
    }
  }

  // Parse messages
  const rawMessages = Array.isArray(value?.messages) ? value.messages : [];
  const normalizedMessages: NormalizedMetaMessage[] = [];

  for (const msg of rawMessages) {
    const rawFrom = String(msg?.from || '');
    const senderPhone = rawFrom.split('@')[0].replace(/\D/g, '');
    const senderName = contactsMap.get(senderPhone) || undefined;
    const fromMe = msg?.key?.fromMe === true;

    const epochSec = Number(msg?.timestamp) || Math.floor(Date.now() / 1000);
    const isoTimestamp = new Date(epochSec * 1000).toISOString();

    let text = '';
    let interactiveReply: NormalizedMetaMessage['interactiveReply'] = undefined;
    let media: NormalizedMetaMessage['media'] = undefined;
    let location: NormalizedMetaMessage['location'] = undefined;
    let msgType: NormalizedMetaMessage['type'] = 'other';

    if (msg.type === 'text' && msg.text?.body) {
      msgType = 'text';
      text = String(msg.text.body).trim();
    } else if (msg.type === 'interactive') {
      msgType = 'interactive';
      const inter = msg.interactive || {};
      if (inter.type === 'button_reply' && inter.button_reply) {
        interactiveReply = {
          type: 'button_reply',
          id: inter.button_reply.id || '',
          title: inter.button_reply.title || '',
        };
        text = inter.button_reply.title || inter.button_reply.id || '';
      } else if (inter.type === 'list_reply' && inter.list_reply) {
        interactiveReply = {
          type: 'list_reply',
          id: inter.list_reply.id || '',
          title: inter.list_reply.title || '',
          description: inter.list_reply.description,
        };
        text = inter.list_reply.title || inter.list_reply.id || '';
      }
    } else if (msg.type === 'image' && msg.image) {
      msgType = 'image';
      media = {
        id: msg.image.id,
        mime_type: msg.image.mime_type,
        caption: msg.image.caption,
        sha256: msg.image.sha256,
      };
      text = msg.image.caption || '[Gambar dikirim pembeli]';
    } else if (msg.type === 'document' && msg.document) {
      msgType = 'document';
      media = {
        id: msg.document.id,
        mime_type: msg.document.mime_type,
        caption: msg.document.caption,
        filename: msg.document.filename,
      };
      text = msg.document.caption || msg.document.filename || '[Dokumen dikirim pembeli]';
    } else if (msg.type === 'audio' && msg.audio) {
      msgType = 'audio';
      media = {
        id: msg.audio.id,
        mime_type: msg.audio.mime_type,
      };
      text = '[Pesan Suara / Audio]';
    } else if (msg.type === 'video' && msg.video) {
      msgType = 'video';
      media = {
        id: msg.video.id,
        mime_type: msg.video.mime_type,
        caption: msg.video.caption,
      };
      text = msg.video.caption || '[Video dikirim pembeli]';
    } else if (msg.type === 'location' && msg.location) {
      msgType = 'location';
      location = {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        name: msg.location.name,
        address: msg.location.address,
      };
      const locLabel = msg.location.name || msg.location.address || `${msg.location.latitude}, ${msg.location.longitude}`;
      text = `[Lokasi: ${locLabel}]`;
    } else {
      msgType = 'other';
      text = `[Pesan ${msg.type || 'WhatsApp'}]`;
    }

    const rawReferral = msg.referral;
    const refCtwaClid = rawReferral?.ctwa_clid || rawReferral?.click_id;
    const textCtwaMatch = typeof text === 'string' ? text.match(/ctwa:([A-Za-z0-9_-]+)/i) : null;
    const resolvedCtwaClid = refCtwaClid || (textCtwaMatch ? textCtwaMatch[1] : undefined);

    normalizedMessages.push({
      id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      from: rawFrom,
      senderPhone,
      senderName,
      timestamp: epochSec,
      isoTimestamp,
      type: msgType,
      text,
      interactiveReply,
      media,
      location,
      raw: msg,
      fromMe,
      ctwa_clid: resolvedCtwaClid,
      referral: rawReferral,
    });
  }

  // Parse statuses
  const rawStatuses = Array.isArray(value?.statuses) ? value.statuses : [];
  const normalizedStatuses: NormalizedMetaStatus[] = [];

  for (const st of rawStatuses) {
    const rawRecipient = String(st?.recipient_id || '');
    const recipientPhone = rawRecipient.replace(/\D/g, '');
    const epochSec = Number(st?.timestamp) || Math.floor(Date.now() / 1000);
    const isoTimestamp = new Date(epochSec * 1000).toISOString();

    const statusValue = String(st?.status || '').toLowerCase() as NormalizedMetaStatus['status'];
    const validStatus = ['sent', 'delivered', 'read', 'failed'].includes(statusValue)
      ? statusValue
      : 'sent';

    let errors: NormalizedMetaStatus['errors'] = undefined;
    if (Array.isArray(st.errors) && st.errors.length > 0) {
      errors = st.errors.map((e: any) => ({
        code: e.code,
        title: e.title,
        message: e.message,
        error_data: e.error_data,
      }));
    }

    normalizedStatuses.push({
      id: String(st.id || ''),
      recipientId: rawRecipient,
      recipientPhone,
      status: validStatus,
      timestamp: epochSec,
      isoTimestamp,
      conversationId: st.conversation?.id,
      pricing: st.pricing
        ? {
            billable: st.pricing.billable,
            category: st.pricing.category,
            pricing_model: st.pricing.pricing_model,
          }
        : undefined,
      errors,
      raw: st,
    });
  }

  return {
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
    messages: normalizedMessages,
    statuses: normalizedStatuses,
    raw: body,
  };
}

// ============================================================================
// 4. Ingestion Pipeline & Execution Dispatcher
// ============================================================================

export type ProcessingReport =
  | { status: 'ignored'; reason?: string }
  | {
      status: 'processed';
      tenant_id?: string;
      processed_messages: number;
      processed_statuses?: number;
      messages_count?: number;
    };

export async function processNormalizedMetaEvent(
  event: NormalizedMetaWebhookEvent
): Promise<ProcessingReport> {
  const { phoneNumberId, displayPhoneNumber, messages, statuses } = event;

  if (!phoneNumberId) {
    console.warn('[SECURITY_WABA_INGRESS_DROP] Missing phone_number_id in webhook payload. Dropping immediately.');
    return {
      status: 'ignored',
      reason: 'missing_phone_number_id',
    };
  }

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    console.error('[SECURITY_WABA_INGRESS_ERROR] Database client unreachable.');
    return {
      status: 'ignored',
      reason: 'db_unreachable',
    };
  }

  // --- TENANT RESOLUTION & OWNERSHIP VALIDATION ---
  // Query Supabase whatsapp_connections: domain TENANT and status != REVOKED
  let connection: any = null;
  let connError: any = null;
  try {
    const res = await supabase
      .from('whatsapp_connections')
      .select('tenant_id, ownership_domain, status, credential_ref, phone_number_id')
      .eq('phone_number_id', phoneNumberId)
      .eq('ownership_domain', 'TENANT')
      .eq('provider', 'META')
      .single();

    connection = res.data;
    connError = res.error;
  } catch (dbErr) {
    connError = dbErr;
  }

  // Validasi Syarat Kepemilikan (Ownership State):
  // Record wajib ada, domain TENANT, tenant_id ada, dan status BUKAN REVOKED.
  if (
    connError ||
    !connection ||
    connection.ownership_domain !== 'TENANT' ||
    !connection.tenant_id ||
    connection.status === 'REVOKED'
  ) {
    console.warn(
      `[SECURITY_WABA_UNMAPPED_RESOURCE] phone_number_id="${phoneNumberId}" is unmapped or revoked (status=${connection?.status || 'NOT_FOUND'}, domain=${connection?.ownership_domain || 'UNKNOWN'}). Dropping silently without AI call or DB mutation.`
    );
    return { status: 'ignored' };
  }

  const tenantId = String(connection.tenant_id).trim().toLowerCase();

  // --- A. PROCESS STATUS UPDATES (DELIVERY / READ / FAILED) ---
  let processedStatuses = 0;
  for (const st of statuses) {
    try {
      const targetStatus =
        st.status === 'delivered'
          ? 'DELIVERED'
          : st.status === 'failed'
          ? 'FAILED'
          : st.status === 'read'
          ? 'DELIVERED'
          : 'SENT';

      const updateData: Record<string, any> = {
        status: targetStatus,
        updated_at: st.isoTimestamp,
      };

      if (st.status === 'delivered' || st.status === 'read') {
        updateData.delivered_at = st.isoTimestamp;
      }
      if (st.errors && st.errors.length > 0) {
        updateData.last_error = `[Meta Error ${st.errors[0].code}] ${st.errors[0].title}: ${st.errors[0].message || ''}`;
      }

      const outboxTable = supabase.from('message_outbox');
      if (outboxTable && typeof (outboxTable as any).update === 'function') {
        await (outboxTable as any)
          .update(updateData)
          .or(`provider_message_id.eq.${st.id},external_message_id.eq.${st.id}`);
      }

      processedStatuses++;
    } catch {
      // Graceful fallback if table is not mocked or present
    }
  }

  // Jika ini adalah event non-pesan (misal delivery receipt, read status):
  if (messages.length === 0) {
    return {
      status: 'processed',
      tenant_id: tenantId,
      processed_messages: 0,
      processed_statuses: processedStatuses,
      messages_count: 0,
    };
  }

  let processedMessages = 0;

  // --- B. PROCESS INCOMING MESSAGES ---
  for (const msg of messages) {
    // 1. Guard clause: Abaikan pesan dari bot itu sendiri (fromMe=true)
    if (msg.fromMe) {
      console.log(`[WABA Webhook] Skipping outbound bot message (fromMe=true), msgId=${msg.id}`);
      continue;
    }

    const senderPhone = msg.senderPhone;
    if (!senderPhone) continue;

    const textContent = msg.text.trim() || (msg.type === 'image' ? 'Tolong analisa gambar ini sesuai konteks toko.' : '');
    if (!textContent && msg.type !== 'image') continue;

    // 1.1 GROUP MENTION GUARD:
    // Rule Chat Grup (remoteJid / rawFrom mengandung '@g.us'):
    // - Cek ID / Nomor Instance Gateway yang menerima pesan:
    //   * JIKA instance nomor BUKAN official support ('+6281215567168' / instance 'boontrack-shop' / internal node):
    //     SEGERA DROP / RETURN. Jangan proses pesan, jangan panggil LLM, dan jangan kirim pesan keluar ke grup.
    //   * HANYA nomor official +6281215567168 yang diizinkan memproses mention @boon di dalam grup.
    // Rule Chat Personal / Direct Message (remoteJid mengandung '@s.whatsapp.net'):
    // - Semua akun toko merchant (seperti buzzerukm) HANYA boleh aktif membalas di jalur Personal Chat (DM 1-on-1).
    const rawFrom = String(msg.from || msg.raw?.key?.remoteJid || '');
    const isGroup = rawFrom.includes('@g.us') || Boolean(msg.raw?.key?.remoteJid?.includes('@g.us'));

    if (isGroup) {
      const cleanDisplayPhone = (displayPhoneNumber || '').replace(/\D/g, '');
      const cleanConnPhone = (connection?.phone_number || connection?.phone || '').replace(/\D/g, '');
      const isOfficialSupport =
        tenantId === 'boon' ||
        tenantId === '52967979-4760-4cea-b686-cdbdb389c0e1' ||
        connection?.instance_name === 'boontrack-shop' ||
        connection?.instance_name === 'boontrack-app-shop' ||
        cleanDisplayPhone === '6281215567168' ||
        cleanConnPhone === '6281215567168' ||
        connection?.phone_number_id === '6281215567168';

      if (!isOfficialSupport) {
        console.warn(
          `[GROUP_MENTION_GUARD_DROP] Non-official merchant tenant '${tenantId}' received group message in '${rawFrom}'. Merchant accounts are strictly limited to 1-on-1 personal DM chats (@s.whatsapp.net). Dropping immediately.`
        );
        continue;
      }

      // HANYA nomor official +6281215567168 yang diizinkan memproses mention @boon di dalam grup
      const hasBoonMention =
        /@boon\b/i.test(textContent) ||
        /@boontrack\b/i.test(textContent) ||
        /@081215567168\b/i.test(textContent);
      if (!hasBoonMention) {
        console.info(`[GROUP_GUARD] Official support ignoring general group chatter in '${rawFrom}' (no @boon mention).`);
        continue;
      }
    }

    // 2. Deteksi pola aktivasi platform (AKTIVASI BT-XXXX)
    const activationMatch = textContent.match(/AKTIVASI\s+([A-Za-z0-9_-]+)/i);
    if (activationMatch) {
      const token = activationMatch[1].toUpperCase().trim();
      try {
        const tenantQuery = supabase.from('tenants');
        if (tenantQuery && typeof (tenantQuery as any).select === 'function') {
          const { data: tenant } = await (tenantQuery as any)
            .select('id, slug, name, status, tier, trial_ends_at, metadata')
            .eq('metadata->>wa_verification_token', token)
            .maybeSingle();

          if (tenant) {
            const currentMeta = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
            const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const verifiedAt = new Date().toISOString();

            await (tenantQuery as any)
              .update({
                status: 'active',
                is_active: true,
                trial_ends_at: trialEndsAt,
                metadata: {
                  ...currentMeta,
                  wa_verification_status: 'verified',
                  wa_verified_at: verifiedAt,
                  wa_verified_phone: senderPhone,
                  phone: senderPhone,
                  whatsapp_number: senderPhone,
                },
                updated_at: verifiedAt,
              })
              .eq('id', tenant.id);

            await sendWhatsAppSessionMessage(
              senderPhone,
              'Selamat! Nomor WhatsApp Anda berhasil diverifikasi. Akun toko Anda sudah aktif. Silakan kembali ke browser untuk mulai menggunakan BoonTrack.'
            );
            processedMessages++;
            continue;
          }
        }
      } catch {
        // Fallback
      }
    }

    // 3. Ingest into internal conversations & messages schema (BoonTrack Inbox Console)
    let convId: string | null = null;
    try {
      const convTable = supabase.from('conversations');
      if (convTable && typeof (convTable as any).insert === 'function') {

        // --- QUALIFICATION FORM PARSER ---
        // Deteksi dan parse form kualifikasi WhatsApp:
        // Format: "Nama : X\nDomisili : Y\nNama Toko : Z\nLink Toko : ...\nOmset ... : W"
        let leadQualification: Record<string, string> | null = null;
        let qualifiedName: string | null = null;
        const qualText = String(textContent || '');
        const hasNamaField = /(?:nama|name)\s*[:\-]/i.test(qualText);
        const hasDomisiliField = /(?:domisili|kota|lokasi|alamat)\s*[:\-]/i.test(qualText);
        const hasOmsetField = /(?:omset|omzet|revenue|pendapatan)\s*[:\-]/i.test(qualText);

        if (hasNamaField && (hasDomisiliField || hasOmsetField)) {
          const parseField = (text: string, pattern: RegExp): string => {
            const match = text.match(pattern);
            return match ? String(match[1] || '').trim().replace(/^[*_~`]+|[*_~`]+$/g, '') : '';
          };

          const nama = parseField(qualText, /(?:nama|name)\s*[:\-]\s*(.+)/i);
          const domisili = parseField(qualText, /(?:domisili|kota|lokasi|alamat)\s*[:\-]\s*(.+)/i);
          const namaToko = parseField(qualText, /(?:nama\s*toko|toko)\s*[:\-]\s*(.+)/i);
          const linkToko = parseField(qualText, /(?:link\s*toko|link|url)\s*[:\-]\s*(.+)/i);
          const omset = parseField(qualText, /(?:omset|omzet|revenue|pendapatan)[^:\-]*\s*[:\-]\s*(.+)/i);

          if (nama) {
            qualifiedName = nama;
            leadQualification = {
              name: nama,
              city: domisili,
              store_name: namaToko,
              store_link: linkToko || 'Belum ada',
              monthly_revenue: omset,
              phone: senderPhone,
              submitted_at: msg.isoTimestamp || new Date().toISOString(),
            };
            console.log(`[WABA_QUALIFIER] Lead form parsed for tenant=${tenantId}, phone=${senderPhone}, name=${nama}, city=${domisili}`);
          }
        }
        // --- END QUALIFICATION FORM PARSER ---

        // Ingest into conversations & messages via universal persistence engine
        try {
          const persisted = await persistInboundMessage({
            tenantId,
            customerPhone: senderPhone,
            customerName: qualifiedName || msg.senderName || senderPhone,
            messageBody: textContent,
            senderType: 'customer',
            externalId: msg.id || undefined,
            messageType: msg.type === 'location' ? 'LOCATION' : (msg.type === 'image' ? 'IMAGE' : 'TEXT'),
            locationData: msg.location
              ? {
                  latitude: Number(msg.location.latitude),
                  longitude: Number(msg.location.longitude),
                  name: msg.location.name,
                  address: msg.location.address,
                }
              : undefined,
            rawPayload: {
              meta_message_id: msg.id,
              type: msg.type,
              media: msg.media,
              interactive: msg.interactiveReply,
              ...(msg.location ? { location: msg.location, is_location: true } : {}),
              ...(msg.ctwa_clid ? { ctwa_clid: msg.ctwa_clid } : {}),
              ...(msg.referral ? { referral: msg.referral } : {}),
            },
          });
          if (persisted.conversationId) {
            convId = persisted.conversationId;
          }
        } catch (dbErr) {
          console.warn('[Meta WABA] Error persisting inbound message:', dbErr);
        }
      }
    } catch {
      // Non-fatal if schema is mocked in tests
    }

    // 3.5. INTERCEPTOR ORDER TRANSAKSI (ORDER GATEKEEPER)
    // Cek apakah isi pesan mengandung pola order manual: "Total Nominal:", "Metode: Transfer Bank", "Mohon dicek dan aktivasi akses", atau "Masterclass CPM"
    if (isManualOrderMessage(textContent)) {
      console.info(
        `[ORDER_GATEKEEPER] Intercepted manual order from ${senderPhone} on tenant '${tenantId}' via Meta WABA. Bypassing ConversationEngine/LLM.`
      );
      const nowIso = new Date().toISOString();

      let storeName = 'Admin Toko';
      try {
        const { data: storeInfo } = await supabase
          .from('tenants')
          .select('name')
          .eq('slug', tenantId)
          .maybeSingle();
        if (storeInfo?.name) {
          storeName = storeInfo.name;
        }
      } catch {}

      await markSessionAsPendingVerification({
        supabase,
        tenantId,
        senderPhone,
        textBody: textContent,
        convId,
        storeName,
      });

      const orderConfirmReply = getOrderConfirmationReply(storeName);

      // Kirim auto-reply konfirmasi order standar jika WABA connected
      if (connection.status === 'CONNECTED' && connection.credential_ref) {
        const resolvedToken =
          process.env[`META_TOKEN_${tenantId.toUpperCase()}`] ||
          process.env.META_WA_TOKEN ||
          process.env.WHATSAPP_API_TOKEN ||
          (connection.credential_ref.startsWith('ey') ? connection.credential_ref : '');

        if (resolvedToken) {
          try {
            await metaWabaAdapter.dispatchTenantMessage(
              tenantId,
              connection,
              senderPhone,
              {
                type: 'text',
                text: { preview_url: false, body: orderConfirmReply },
              },
              resolvedToken,
              connection.credential_ref
            );

            await persistOutboundMessage({
              tenantId,
              customerPhone: senderPhone,
              senderType: 'bot',
              senderName: 'OrderGatekeeper',
              messageBody: orderConfirmReply,
              rawPayload: { trigger: 'order_gatekeeper' },
            });
          } catch (sendErr) {
            console.warn('[Meta Webhook] Order confirmation reply error:', sendErr);
          }
        }
      }

      processedMessages++;
      continue; // JANGAN panggil ConversationEngine / AI!
    }

    // 4. Pass payload to internal ConversationEngine
    try {
      let wabaBase64: string | undefined = undefined;
      if (msg.type === 'image' && msg.media?.id) {
        try {
          const resolvedToken =
            process.env[`META_TOKEN_${tenantId.toUpperCase()}`] ||
            process.env.META_WA_TOKEN ||
            process.env.WHATSAPP_API_TOKEN ||
            (connection.credential_ref?.startsWith('ey') ? connection.credential_ref : '');
          if (resolvedToken) {
            const metaMediaRes = await fetch(`https://graph.facebook.com/v21.0/${msg.media.id}`, {
              headers: { Authorization: `Bearer ${resolvedToken}` },
            });
            if (metaMediaRes.ok) {
              const metaMediaData = await metaMediaRes.json();
              if (metaMediaData.url) {
                const imgRes = await fetch(metaMediaData.url, {
                  headers: { Authorization: `Bearer ${resolvedToken}` },
                });
                if (imgRes.ok) {
                  const arrBuf = await imgRes.arrayBuffer();
                  wabaBase64 = Buffer.from(arrBuf).toString('base64');
                }
              }
            }
          }
        } catch (mediaErr) {
          console.warn('[Meta WABA Media Fetch Warning]:', mediaErr);
        }
      }

      const engineResult = await ConversationEngine.process({
        tenant_id: tenantId,
        channel: 'WHATSAPP',
        session_id: senderPhone,
        user_identifier: senderPhone,
        message: textContent,
        image_base64: wabaBase64,
        mime_type: msg.media?.mime_type || 'image/jpeg',
        interactive_reply: msg.interactiveReply,
        channel_type: 'WABA',
      });

      // 5. Outbound Dispatch: Penegakan State Operasional (CONNECTED)
      if (engineResult?.reply && connection.credential_ref) {
        if (connection.status !== 'CONNECTED') {
          console.warn(
            `[SECURITY_WABA_OUTBOUND_SUPPRESSED] Operational state is '${connection.status}' (not CONNECTED). Inbound accepted for tenant=${tenantId}, but outbound reply suppressed.`
          );
        } else {
          const resolvedToken =
            process.env[`META_TOKEN_${tenantId.toUpperCase()}`] ||
            process.env.META_WA_TOKEN ||
            process.env.WHATSAPP_API_TOKEN ||
            (connection.credential_ref.startsWith('ey') ? connection.credential_ref : '');

          if (resolvedToken) {
            await metaWabaAdapter.dispatchTenantMessage(
              tenantId,
              connection,
              senderPhone,
              {
                type: 'text',
                text: { preview_url: false, body: engineResult.reply },
              },
              resolvedToken,
              connection.credential_ref
            );

            // Record bot reply in messages & update conversation
            await persistOutboundMessage({
              tenantId,
              customerPhone: senderPhone,
              senderType: 'bot',
              senderName: 'BoonPilot AI',
              messageBody: engineResult.reply,
              externalId: msg.id ? `bot_reply_${msg.id}` : undefined,
              rawPayload: { trigger: 'conversation_engine' },
            });
          }
        }
      }

      processedMessages++;
    } catch (procErr) {
      console.error(
        `[WABA Ingress Error] Failed processing message for tenant=${tenantId}:`,
        procErr
      );
    }
  }

  return {
    status: 'processed',
    tenant_id: tenantId,
    processed_messages: processedMessages,
  };
}
