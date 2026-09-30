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

export interface ResolvedTenant {
  tenantId: string;
  tenantSlug: string;
  apiKey?: string;
}

export interface InboundMessageParams {
  tenantId: string;
  tenantSlug?: string;
  customerPhone: string;
  customerName?: string;
  messageBody: string;
  senderType?: 'customer' | 'bot' | 'agent' | 'system';
  rawPayload?: any;
}

export interface OutboundMessageParams {
  tenantId: string;
  tenantSlug?: string;
  customerPhone: string;
  senderType: 'bot' | 'agent' | 'system';
  senderName?: string;
  messageBody: string;
  rawPayload?: any;
}

/**
 * Normalizes phone number into clean international format (e.g. 6281234567890)
 */
export function cleanCustomerPhone(phone: string): string {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * 1. Resolve Tenant Identity dynamically from `whatsapp_connections`
 * DILARANG hardcode nama slug! Seluruh aliran ditentukan oleh database.
 */
export async function resolveTenantFromConnection(identifier: {
  instanceName?: string;
  phoneNumberId?: string;
  phoneNumber?: string;
}): Promise<ResolvedTenant | null> {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  const { instanceName, phoneNumberId, phoneNumber } = identifier;

  try {
    let query: any = supabase.from('whatsapp_connections').select('tenant_id, tenant_slug, credential_ref, status');

    if (phoneNumberId) {
      query = query.eq('phone_number_id', phoneNumberId);
    } else if (instanceName) {
      if (typeof query.or === 'function') {
        query = query.or(`instance_name.eq.${instanceName},tenant_slug.eq.${instanceName},phone_number.eq.${instanceName}`);
      } else {
        query = query.eq('instance_name', instanceName);
      }
    } else if (phoneNumber) {
      const clean = cleanCustomerPhone(phoneNumber);
      if (typeof query.or === 'function') {
        query = query.or(`phone_number.eq.${phoneNumber},phone_number.eq.${clean}`);
      } else {
        query = query.eq('phone_number', clean);
      }
    } else {
      return null;
    }

    const { data: conn } = await query.maybeSingle();

    if (conn?.tenant_id) {
      // Lookup canonical tenant UUID and slug
      let tenantQuery: any = supabase.from('tenants').select('id, slug');
      if (typeof tenantQuery.or === 'function') {
        tenantQuery = tenantQuery.or(`id.eq.${conn.tenant_id},slug.eq.${conn.tenant_id}`);
      } else {
        tenantQuery = tenantQuery.eq('id', conn.tenant_id);
      }
      const { data: tenantRow } = await tenantQuery.maybeSingle();

      return {
        tenantId: tenantRow?.id || conn.tenant_id,
        tenantSlug: tenantRow?.slug || conn.tenant_slug || conn.tenant_id,
        apiKey: conn.credential_ref || undefined,
      };
    }

    // Fallback: Check tenants table directly if instanceName matches slug or metadata
    if (instanceName) {
      let tQuery: any = supabase.from('tenants').select('id, slug, metadata');
      if (typeof tQuery.or === 'function') {
        tQuery = tQuery.or(`slug.eq.${instanceName},metadata->>whatsapp_instance.eq.${instanceName}`);
      } else {
        tQuery = tQuery.eq('slug', instanceName);
      }
      const { data: tenant } = await tQuery.maybeSingle();

      if (tenant?.id && tenant?.slug) {
        return {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
        };
      }
    }
  } catch (err) {
    console.warn('[InboxPersistence] resolveTenantFromConnection error:', err);
  }

  return null;
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
    // 2a. Atomic UPSERT into `conversations`
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

    // 2b. INSERT into `messages`
    if (conversationId) {
      const msgInsertRes: any = supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          tenant_id: tenantId,
          tenant_slug: tenantSlug || tenantId,
          sender_type: senderType,
          sender: senderType,
          message_body: messageBody,
          text: messageBody,
          raw_payload: rawPayload || {},
          payload: rawPayload || {},
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
      await supabase.from('messages').insert({
        conversation_id: convId,
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
