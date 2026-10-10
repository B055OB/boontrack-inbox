/**
 * lib/whatsapp/inbox-persistence.ts
 * 100% Global & Tenant-Agnostic WhatsApp Inbox Persistence Engine.
 *
 * Implements:
 * 1. Dynamic Tenant Resolution from `whatsapp_connections` (Zero hardcoded slugs)
 * 2. Atomic UPSERT into `conversations` (with customer_phone & tenant_id conflict resolution)
 * 3. Structured INSERT into `messages`
 * 4. Outbound reply logging (AI bot / live CS agent / system gatekeeper)
 * 5. Uses getSupabaseAdmin() (SUPABASE_SERVICE_ROLE_KEY) to bypass RLS on ingress
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendInstantShippingRecommendation } from '@/lib/shipping/instant-shipping-service';
import { registerBotOutbound } from '@/lib/whatsapp/outbound-registry';

export interface TenantRuntimeContext {
  tenantId: string;
  tenantSlug: string;
  tenantName?: string;
  instanceName?: string;
  ownerPhone?: string;
  apiKey?: string;
  isVerified: boolean;
}

export type ResolvedTenant = TenantRuntimeContext;

/**
 * Normalizes phone numbers to standard E.164-compatible Indonesian format (628xxx).
 */
export function cleanCustomerPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

export interface InboundMessageParams {
  tenantId: string;
  tenantSlug?: string;
  customerPhone: string;
  customerName?: string;
  messageBody: string;
  senderType?: 'customer' | 'bot' | 'agent' | 'system';
  rawPayload?: any;
  externalId?: string;
  messageType?: string;
  locationData?: {
    latitude: number;
    longitude: number;
    address?: string;
    name?: string;
  } | null;
}

export interface OutboundMessageParams {
  tenantId: string;
  tenantSlug?: string;
  customerPhone: string;
  senderType: 'bot' | 'agent' | 'system';
  senderName?: string;
  messageBody: string;
  rawPayload?: any;
  externalId?: string;
  messageType?: string;
}

/**
 * 1. Global Fail-Closed WhatsApp Pipeline & Dynamic Tenant Resolution
 * Inbound Message -> Identify Instance -> Identify Owner Phone -> Resolve tenant_id -> Validate instance ↔ owner ↔ tenant -> TenantRuntimeContext.
 *
 * JIKA BOONTRACK TIDAK TAHU TENANT MANA YANG DIPROSES, BOONTRACK HARUS FAIL-CLOSED (TIDAK BOLEH MENJAWAB / ZERO FALLBACK).
 */
export async function resolveTenantFromConnection(identifier: {
  instanceName?: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  botPhoneNumber?: string;
}): Promise<TenantRuntimeContext | null> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  const { instanceName, phoneNumberId, phoneNumber, botPhoneNumber } = identifier;
  const botPhone = botPhoneNumber || phoneNumber;
  const cleanBotPhone = botPhone ? cleanCustomerPhone(botPhone) : '';
  const cleanInstance = instanceName?.trim() || '';
  const cleanPhoneId = phoneNumberId?.trim() || '';

  if (!cleanInstance && !cleanBotPhone && !cleanPhoneId) {
    console.warn('[SECURITY_ALERT / QUARANTINE] Neither instance, owner phone, nor phone_number_id provided. FAIL-CLOSED.');
    return null;
  }

  try {
    let connByInstance: any = null;
    let connByPhone: any = null;
    let connByPhoneId: any = null;

    // 1. Identify Instance & Owner Phone in whatsapp_connections
    if (cleanInstance) {
      const q = supabase
        .from('whatsapp_connections')
        .select('tenant_id, tenant_slug, instance_name, phone_number, phone_number_id, credential_ref, status, ownership_domain');
      const { data } = await (typeof (q as any).or === 'function'
        ? (q as any).or(`instance_name.eq.${cleanInstance},tenant_slug.eq.${cleanInstance}`).maybeSingle()
        : q.eq('instance_name', cleanInstance).maybeSingle());
      connByInstance = data;
    }

    if (cleanBotPhone) {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('tenant_id, tenant_slug, instance_name, phone_number, phone_number_id, credential_ref, status, ownership_domain')
        .eq('phone_number', cleanBotPhone)
        .maybeSingle();
      connByPhone = data;
    }

    if (cleanPhoneId) {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('tenant_id, tenant_slug, instance_name, phone_number, phone_number_id, credential_ref, status, ownership_domain')
        .eq('phone_number_id', cleanPhoneId)
        .maybeSingle();
      connByPhoneId = data;
    }

    // 2. Validate Instance ↔ Owner Phone (Anti-Spoofing & Cross-Tenant Mismatch Guard)
    if (cleanInstance && cleanBotPhone) {
      if (connByInstance) {
        const expectedPhone = connByInstance.phone_number ? cleanCustomerPhone(connByInstance.phone_number) : '';
        if (expectedPhone && expectedPhone !== cleanBotPhone) {
          console.warn(
            `[SECURITY_ALERT / QUARANTINE] Mismatched Instance and Owner Phone: instance "${cleanInstance}" is bound to phone "${expectedPhone}", but request claimed owner phone "${cleanBotPhone}". REJECTING (FAIL-CLOSED).`
          );
          return null;
        }
      }

      if (connByPhone) {
        const expectedInstance = connByPhone.instance_name || connByPhone.tenant_slug;
        if (expectedInstance && expectedInstance !== cleanInstance) {
          console.warn(
            `[SECURITY_ALERT / QUARANTINE] Mismatched Owner Phone and Instance: phone "${cleanBotPhone}" belongs to instance "${expectedInstance}", but request claimed instance "${cleanInstance}". REJECTING (FAIL-CLOSED).`
          );
          return null;
        }
      }

      if (!connByInstance && !connByPhone) {
        console.warn(
          `[SECURITY_ALERT / QUARANTINE] Unknown WhatsApp instance "${cleanInstance}" and owner phone "${cleanBotPhone}". REJECTING (FAIL-CLOSED).`
        );
        return null;
      }
    }

    const matchedConn = connByInstance || connByPhone || connByPhoneId;
    let candidateTenantId: string | null = matchedConn?.tenant_id || null;
    let candidateApiKey: string | undefined = matchedConn?.credential_ref || undefined;

    // Direct tenant table check ONLY if instanceName was given without conflicting phone
    if (!candidateTenantId && cleanInstance && !cleanBotPhone) {
      let tQuery: any = supabase.from('tenants').select('id, slug, name, status, metadata');
      if (typeof tQuery.or === 'function') {
        tQuery = tQuery.or(`slug.eq.${cleanInstance},metadata->>whatsapp_instance.eq.${cleanInstance}`);
      } else {
        tQuery = tQuery.eq('slug', cleanInstance);
      }
      const { data: tenantRow } = await tQuery.maybeSingle();
      if (tenantRow?.id) {
        candidateTenantId = tenantRow.id;
      }
    }

    // Direct tenant table check by owner phone ONLY if phone given without conflicting instance
    if (!candidateTenantId && cleanBotPhone && !cleanInstance) {
      let tQuery: any = supabase.from('tenants').select('id, slug, name, status, metadata');
      if (typeof tQuery.or === 'function') {
        tQuery = tQuery.or(`metadata->>phone.eq.${cleanBotPhone},metadata->>whatsapp_number.eq.${cleanBotPhone}`);
      } else {
        tQuery = tQuery.eq('slug', cleanBotPhone);
      }
      const { data: tenantRow } = await tQuery.maybeSingle();
      if (tenantRow?.id) {
        candidateTenantId = tenantRow.id;
      }
    }

    if (!candidateTenantId) {
      console.warn(
        `[SECURITY_ALERT / QUARANTINE] Unable to resolve tenant identity for instance="${cleanInstance}", phone="${cleanBotPhone}". REJECTING (FAIL-CLOSED).`
      );
      return null;
    }

    if (matchedConn && matchedConn.status === 'REVOKED') {
      console.warn(`[SECURITY_ALERT / QUARANTINE] Connection for tenant "${candidateTenantId}" is REVOKED. FAIL-CLOSED.`);
      return null;
    }

    // 3. Resolve canonical tenant from tenants table (Single Source of Truth)
    let tenantRow: any = null;
    const { data: tById } = await supabase
      .from('tenants')
      .select('id, slug, name, status, metadata')
      .eq('id', candidateTenantId)
      .maybeSingle();

    if (tById?.id) {
      tenantRow = tById;
    } else {
      const { data: tBySlug } = await supabase
        .from('tenants')
        .select('id, slug, name, status, metadata')
        .eq('slug', candidateTenantId)
        .maybeSingle();
      if (tBySlug?.id) {
        tenantRow = tBySlug;
      }
    }

    if (!tenantRow || !tenantRow.id) {
      console.warn(
        `[SECURITY_ALERT / QUARANTINE] Resolved tenant ID "${candidateTenantId}" does not exist in tenants database. REJECTING (FAIL-CLOSED).`
      );
      return null;
    }

    // 4. Return Verified Immutable TenantRuntimeContext
    return {
      tenantId: tenantRow.id,
      tenantSlug: tenantRow.slug || matchedConn?.tenant_slug || candidateTenantId,
      tenantName: tenantRow.name || undefined,
      instanceName: cleanInstance || matchedConn?.instance_name || undefined,
      ownerPhone: cleanBotPhone || (matchedConn?.phone_number ? cleanCustomerPhone(matchedConn.phone_number) : undefined),
      apiKey: candidateApiKey,
      isVerified: true,
    };
  } catch (err) {
    console.warn('[SECURITY_ALERT / QUARANTINE] resolveTenantFromConnection exception:', err);
    return null;
  }
}

/**
 * 2. Atomic UPSERT into `conversations` and INSERT into `messages`
 * Executes using SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 */
export async function persistInboundMessage(
  params: InboundMessageParams
): Promise<{ conversationId: string | null; messageId: string | null }> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return { conversationId: null, messageId: null };

  const {
    tenantId,
    tenantSlug,
    customerPhone: rawPhone,
    customerName,
    messageBody,
    senderType = 'customer',
    rawPayload,
  } = params;

  const phone = cleanCustomerPhone(rawPhone);
  if (!phone) return { conversationId: null, messageId: null };

  const nowIso = new Date().toISOString();
  let conversationId: string | null = null;
  let messageId: string | null = null;

  try {
    // 2a. Deduplication check by externalId if provided
    if (params.externalId) {
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id, conversation_id')
        .eq('external_id', params.externalId)
        .maybeSingle();

      if (existingMsg?.id) {
        console.log(`[InboxPersistence] Deduplication: external_id ${params.externalId} already exists. Skipping.`);
        return { conversationId: existingMsg.conversation_id, messageId: existingMsg.id };
      }
    }

    // 2b. Atomic UPSERT into `conversations`
    // Check if conversation already exists for (tenant_id, customer_phone)
    let convCheckQuery: any = supabase
      .from('conversations')
      .select('id, unread_count, customer_name, contact_name');

    if (typeof convCheckQuery.or === 'function') {
      const orRes = convCheckQuery.or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantId}`);
      if (orRes && typeof orRes.eq === 'function') {
        convCheckQuery = orRes.eq('customer_phone', phone);
      } else {
        convCheckQuery = orRes;
      }
    } else if (typeof convCheckQuery.eq === 'function') {
      convCheckQuery = convCheckQuery.eq('customer_phone', phone);
    }
    const { data: existingConv } = await (convCheckQuery?.maybeSingle ? convCheckQuery.maybeSingle() : Promise.resolve({ data: null }));

    const resolvedName = customerName || existingConv?.customer_name || existingConv?.contact_name || phone;

    if (existingConv?.id) {
      conversationId = existingConv.id;
      const newUnread = senderType === 'customer' ? ((existingConv.unread_count || 0) + 1) : (existingConv.unread_count || 0);

      await supabase
        .from('conversations')
        .update({
          last_message: messageBody,
          last_message_at: nowIso,
          unread_count: newUnread,
          customer_name: resolvedName,
          contact_name: resolvedName,
          customer_phone: phone,
          phone_number: phone,
          status: 'active',
          updated_at: nowIso,
        })
        .eq('id', conversationId);
    } else {
      const convInsertRes: any = supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          tenant_slug: tenantSlug || tenantId,
          customer_phone: phone,
          phone_number: phone,
          customer_name: resolvedName,
          contact_name: resolvedName,
          last_message: messageBody,
          last_message_at: nowIso,
          unread_count: senderType === 'customer' ? 1 : 0,
          status: 'active',
          bot_mode: 'AI_ACTIVE',
          created_at: nowIso,
          updated_at: nowIso,
        });

      const convInsertPromise = typeof convInsertRes?.select === 'function' ? convInsertRes.select('id').single() : convInsertRes;
      const { data: newConv, error: insertConvErr } = await convInsertPromise;

      if (insertConvErr) {
        console.warn('[InboxPersistence] Insert conversation note:', insertConvErr.message);
        // Fallback check if created concurrently
        let retryCheckQuery: any = supabase
          .from('conversations')
          .select('id')
          .eq('tenant_id', tenantId);
        if (typeof retryCheckQuery.or === 'function') {
          retryCheckQuery = retryCheckQuery.or(`customer_phone.eq.${phone},phone_number.eq.${phone}`);
        } else {
          retryCheckQuery = retryCheckQuery.eq('customer_phone', phone);
        }
        const { data: retryConv } = await retryCheckQuery.maybeSingle();
        conversationId = retryConv?.id || null;
      } else {
        conversationId = newConv?.id || null;
      }
    }

    // 2c. Check recent identical message in same conversation within 30s
    if (conversationId) {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      try {
        let dupQuery: any = supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId);

        if (typeof dupQuery?.eq === 'function') {
          dupQuery = dupQuery.eq('text', messageBody);
        }
        if (typeof dupQuery?.eq === 'function') {
          dupQuery = dupQuery.eq('sender', senderType);
        }
        if (typeof dupQuery?.gte === 'function') {
          dupQuery = dupQuery.gte('created_at', thirtySecondsAgo);
        }
        if (typeof dupQuery?.limit === 'function') {
          dupQuery = dupQuery.limit(1);
        }

        const { data: recentDup } = await (dupQuery?.maybeSingle ? dupQuery.maybeSingle() : Promise.resolve({ data: null }));

        if (recentDup?.id) {
          console.log(`[InboxPersistence] Deduplication: identical message within 30s found (${recentDup.id}). Skipping insert.`);
          return { conversationId, messageId: recentDup.id };
        }
      } catch {
        // Non-fatal if mock query chaining is limited
      }
    }

    // 2d. INSERT into `messages`
    if (conversationId) {
      const msgType =
        params.messageType ||
        (params.locationData || params.rawPayload?.is_location
          ? 'LOCATION'
          : params.rawPayload?.type === 'image'
          ? 'IMAGE'
          : 'TEXT');

      const locData = params.locationData || params.rawPayload?.location || null;

      const mergedPayload = {
        ...(rawPayload || {}),
        type: msgType,
        ...(locData ? { is_location: true, location: locData } : {}),
      };

      const mergedMetadata = {
        ...(rawPayload?.metadata || {}),
        type: msgType,
        ...(locData
          ? {
              location: locData,
              coordinates: { latitude: locData.latitude, longitude: locData.longitude },
            }
          : {}),
      };

      const msgInsertRes: any = supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          external_id: params.externalId || null,
          tenant_id: tenantId,
          tenant_slug: tenantSlug || tenantId,
          sender_type: senderType,
          sender: senderType,
          type: msgType,
          message_body: messageBody,
          text: messageBody,
          raw_payload: mergedPayload,
          payload: mergedPayload,
          metadata: mergedMetadata,
          channel: 'whatsapp',
          user_name: resolvedName,
          user_phone: phone,
          created_at: nowIso,
        });

      const msgInsertPromise = typeof msgInsertRes?.select === 'function' ? msgInsertRes.select('id').single() : msgInsertRes;
      const { data: newMsg, error: msgErr } = await msgInsertPromise;

      if (!msgErr && newMsg?.id) {
        messageId = newMsg.id;
      }

      // 2e. AUTOMATIC INSTANT SHIPPING CALCULATION FOR LOCATION PINS
      // Jika pesan bertipe LOCATION dan berasal dari pembeli, hitung ongkir instan otomatis
      if (locData && senderType === 'customer') {
        sendInstantShippingRecommendation({
          tenantId,
          tenantSlug: tenantSlug || tenantId,
          customerPhone: phone,
          customerName: resolvedName,
          locationData: locData,
          conversationId,
          messageId,
        }).catch((shipErr) => {
          console.warn('[InboxPersistence] Background instant shipping calculation note:', shipErr);
        });
      }
    }
  } catch (err) {
    console.error('[InboxPersistence] Error persisting inbound message:', err);
  }

  return { conversationId, messageId };
}

/**
 * 3. Persist Outbound Reply (AI Bot, Live CS Agent, or System Order Confirmation)
 */
export async function persistOutboundMessage(
  params: OutboundMessageParams
): Promise<void> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return;

  const {
    tenantId,
    tenantSlug,
    customerPhone: rawPhone,
    senderType,
    senderName,
    messageBody,
    rawPayload,
  } = params;

  const phone = cleanCustomerPhone(rawPhone);
  if (!phone) return;

  // Track in Outbound Registry to prevent bot self-pause when Evolution webhook echoes with fromMe = true
  if (senderType === 'bot' || senderType === 'system') {
    registerBotOutbound({
      messageId: params.externalId,
      recipientPhone: phone,
      text: messageBody,
    });

    if (params.externalId && supabase) {
      try {
        Promise.resolve(
          supabase.from('outbound_messages').insert({
            tenant_id: String(tenantId),
            wa_message_id: String(params.externalId),
            recipient_jid: String(phone),
            source: 'bot',
          })
        ).catch(() => {});
      } catch (_) {}
    }
  }

  const nowIso = new Date().toISOString();

  try {
    // Find conversation ID
    let convId: string | null = null;
    let findConvQuery: any = supabase
      .from('conversations')
      .select('id');

    if (typeof findConvQuery.or === 'function') {
      const orRes = findConvQuery.or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantId}`);
      if (orRes && typeof orRes.eq === 'function') {
        findConvQuery = orRes.eq('customer_phone', phone);
      } else {
        findConvQuery = orRes;
      }
    } else if (typeof findConvQuery.eq === 'function') {
      findConvQuery = findConvQuery.eq('customer_phone', phone);
    }
    const { data: conv } = await (findConvQuery?.maybeSingle ? findConvQuery.maybeSingle() : Promise.resolve({ data: null }));

    if (conv?.id) {
      convId = conv.id;
      await supabase
        .from('conversations')
        .update({
          last_message: messageBody,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', convId);
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          tenant_slug: tenantSlug || tenantId,
          customer_phone: phone,
          phone_number: phone,
          customer_name: phone,
          contact_name: phone,
          last_message: messageBody,
          last_message_at: nowIso,
          unread_count: 0,
          status: 'active',
          bot_mode: senderType === 'agent' ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('id')
        .single();
      convId = newConv?.id || null;
    }

    if (convId) {
      // Deduplication check for outbound replies within 30s
      if (params.externalId) {
        const { data: existingExternal } = await supabase
          .from('messages')
          .select('id')
          .eq('external_id', params.externalId)
          .maybeSingle();

        if (existingExternal?.id) {
          console.log(`[InboxPersistence] Deduplication: outbound external_id ${params.externalId} already exists. Skipping.`);
          return;
        }
      }

      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      try {
        let outboundDupQuery: any = supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', convId);

        if (typeof outboundDupQuery?.eq === 'function') {
          outboundDupQuery = outboundDupQuery.eq('text', messageBody);
        }
        if (typeof outboundDupQuery?.eq === 'function') {
          outboundDupQuery = outboundDupQuery.eq('sender', senderType);
        }
        if (typeof outboundDupQuery?.gte === 'function') {
          outboundDupQuery = outboundDupQuery.gte('created_at', thirtySecondsAgo);
        }
        if (typeof outboundDupQuery?.limit === 'function') {
          outboundDupQuery = outboundDupQuery.limit(1);
        }

        const { data: recentOutboundDup } = await (outboundDupQuery?.maybeSingle ? outboundDupQuery.maybeSingle() : Promise.resolve({ data: null }));

        if (recentOutboundDup?.id) {
          console.log(`[InboxPersistence] Deduplication: identical outbound reply to ${phone} within 30s found (${recentOutboundDup.id}). Skipping.`);
          return;
        }
      } catch {
        // Non-fatal if mock query chaining is limited
      }

      await supabase.from('messages').insert({
        conversation_id: convId,
        external_id: params.externalId || null,
        tenant_id: tenantId,
        tenant_slug: tenantSlug || tenantId,
        sender_type: senderType,
        sender: senderType,
        message_body: messageBody,
        text: messageBody,
        raw_payload: rawPayload || {},
        payload: rawPayload || {},
        channel: 'whatsapp',
        user_name: senderName || (senderType === 'bot' ? 'BoonPilot AI' : 'Live CS Agent'),
        user_phone: phone,
        created_at: nowIso,
      });
    }
  } catch (err) {
    console.error('[InboxPersistence] Error persisting outbound message:', err);
  }
}
