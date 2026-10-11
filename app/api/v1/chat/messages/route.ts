import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { processMultimodalChat } from '@/lib/ai/multimodal-chat';

export const dynamic = 'force-dynamic';

function getDbClient() {
  return getSupabaseAdmin() || getSupabase();
}

/**
 * GET /api/v1/chat/messages
 * Retrieves conversation status and message history for a storefront webchat visitor.
 * Query params:
 * - tenant_slug (required)
 * - visitor_id (required if conversation_id not provided)
 * - conversation_id (optional)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenant_slug') || searchParams.get('tenant') || '';
    const visitorId = searchParams.get('visitor_id') || searchParams.get('vid') || '';
    const conversationIdParam = searchParams.get('conversation_id') || '';

    if (!tenantSlug && !conversationIdParam) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant_slug atau conversation_id wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getDbClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database client tidak tersedia.' }, { status: 500 });
    }

    let conversation: any = null;

    if (conversationIdParam) {
      const { data: convById, error: convErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationIdParam)
        .maybeSingle();

      if (convErr) {
        console.error('[WebchatAPI GET] Error fetching conversation by ID:', convErr);
      }
      conversation = convById;
    }

    if (!conversation && tenantSlug && visitorId) {
      // 1. Resolve tenant identity
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('id, slug')
        .or(`slug.eq.${tenantSlug},id.eq.${tenantSlug}`)
        .maybeSingle();

      if (tenantErr || !tenant) {
        return NextResponse.json({ success: false, error: 'Tenant tidak ditemukan.' }, { status: 404 });
      }

      const cleanVisitorPhone = visitorId.startsWith('webchat_') ? visitorId : `webchat_${visitorId}`;

      const { data: convByPhone, error: phoneErr } = await supabase
        .from('conversations')
        .select('*')
        .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`)
        .eq('customer_phone', cleanVisitorPhone)
        .maybeSingle();

      if (phoneErr) {
        console.error('[WebchatAPI GET] Error fetching conversation by visitor phone:', phoneErr);
      }
      conversation = convByPhone;
    }

    if (!conversation) {
      return NextResponse.json({
        success: true,
        conversation: null,
        conversation_id: null,
        messages: [],
      });
    }

    // 2. Fetch all messages in this conversation
    const { data: rawMessages, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (msgErr) {
      console.error('[WebchatAPI GET] Error fetching messages:', msgErr);
      return NextResponse.json({ success: false, error: 'Gagal memuat pesan.' }, { status: 500 });
    }

    const formattedMessages = (rawMessages || []).map((m: any) => {
      const isCust = m.sender_type === 'customer' || m.sender === 'user' || m.sender === 'customer';
      const isAgent = m.sender_type === 'agent' || m.sender === 'agent';
      const sender = isCust ? 'user' : isAgent ? 'agent' : 'bot';
      const ts = m.created_at ? new Date(m.created_at) : new Date();
      const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;

      return {
        id: m.id,
        sender,
        senderName: m.user_name || (isAgent ? 'Live CS' : isCust ? m.user_name : 'BoonPilot AI'),
        text: (m.message_body || m.text || '').trim(),
        time: timeStr,
        created_at: m.created_at,
        type: m.type || 'TEXT',
        payload: m.payload || m.raw_payload || m.metadata,
        quick_actions: m.metadata?.quick_actions || [],
        checkout_url: m.metadata?.checkout_url || null,
      };
    });

    return NextResponse.json({
      success: true,
      conversation_id: conversation.id,
      conversation: {
        id: conversation.id,
        customerName: conversation.customer_name || conversation.contact_name,
        customerPhone: conversation.customer_phone,
        channelType: conversation.channel_type || 'WEBCHAT',
        isBotActive: conversation.bot_paused === true ? false : (conversation.bot_mode === 'HUMAN_ACTIVE' ? false : true),
        status: conversation.status,
        lastMessage: conversation.last_message,
        lastMessageAt: conversation.last_message_at,
      },
      messages: formattedMessages,
    });
  } catch (err: any) {
    console.error('[WebchatAPI GET] Unexpected error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/v1/chat/messages
 * Ingests inbound message from storefront webchat visitor into `conversations` & `messages`.
 * Automatically triggers AI bot reply if conversation is not paused by CS human takeover.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      tenant_slug,
      tenant_id,
      visitor_id,
      customer_name,
      customer_phone,
      message,
      intent,
      metadata,
    } = body;

    const tenantIdentifier = tenant_slug || tenant_id;
    const rawMessage = (message || '').trim();

    if (!tenantIdentifier || !visitorIdNormalized(visitor_id) || !rawMessage) {
      return NextResponse.json(
        {
          success: false,
          error: 'Parameter tenant_slug, visitor_id, dan message wajib diisi.',
        },
        { status: 400 }
      );
    }

    const supabase = getDbClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database client tidak tersedia.' }, { status: 500 });
    }

    // 1. Resolve tenant identity (Single Source of Truth: Supabase `tenants`)
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .or(`slug.eq.${tenantIdentifier},id.eq.${tenantIdentifier}`)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: `Tenant '${tenantIdentifier}' tidak ditemukan.` }, { status: 404 });
    }

    const cleanVid = visitorIdNormalized(visitor_id);
    const cleanVisitorPhone = cleanVid.startsWith('webchat_') ? cleanVid : `webchat_${cleanVid}`;
    const resolvedCustomerName = (customer_name || '').trim() || 'Pengunjung Webchat';
    const nowIso = new Date().toISOString();

    // 2. Atomic UPSERT into `conversations`
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, unread_count, bot_paused, bot_mode, status, customer_name')
      .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`)
      .eq('customer_phone', cleanVisitorPhone)
      .maybeSingle();

    let conversationId: string;
    let isConvBotPaused = false;

    if (existingConv?.id) {
      conversationId = existingConv.id;
      isConvBotPaused = Boolean(
        existingConv.bot_paused === true ||
        existingConv.bot_mode === 'HUMAN_ACTIVE' ||
        existingConv.status === 'HUMAN_PAUSED' ||
        existingConv.status === 'paused'
      );

      const newUnread = (existingConv.unread_count || 0) + 1;
      const nameToSave = customer_name ? customer_name.trim() : existingConv.customer_name || resolvedCustomerName;

      await supabase
        .from('conversations')
        .update({
          last_message: rawMessage,
          last_message_at: nowIso,
          unread_count: newUnread,
          customer_name: nameToSave,
          contact_name: nameToSave,
          customer_phone: cleanVisitorPhone,
          phone_number: customer_phone ? customer_phone.trim() : cleanVisitorPhone,
          channel_type: 'WEBCHAT',
          status: 'active',
          updated_at: nowIso,
        })
        .eq('id', conversationId);
    } else {
      const convInsertRes = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          customer_phone: cleanVisitorPhone,
          phone_number: customer_phone ? customer_phone.trim() : cleanVisitorPhone,
          customer_name: resolvedCustomerName,
          contact_name: resolvedCustomerName,
          last_message: rawMessage,
          last_message_at: nowIso,
          unread_count: 1,
          channel_type: 'WEBCHAT',
          bot_mode: 'AI_ACTIVE',
          bot_paused: false,
          status: 'active',
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('id')
        .single();

      if (convInsertRes.error || !convInsertRes.data) {
        console.error('[WebchatAPI POST] Failed to insert conversation:', convInsertRes.error);
        return NextResponse.json({ success: false, error: 'Gagal membuat percakapan baru.' }, { status: 500 });
      }

      conversationId = convInsertRes.data.id;
    }

    // 3. Insert customer message into `messages`
    const { data: newCustomerMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        sender_type: 'customer',
        sender: 'customer',
        type: 'TEXT',
        message_body: rawMessage,
        text: rawMessage,
        channel: 'webchat',
        user_name: resolvedCustomerName,
        user_phone: cleanVisitorPhone,
        metadata: {
          visitor_id: cleanVid,
          intent: intent || null,
          real_phone: customer_phone || null,
          ...(metadata || {}),
        },
        created_at: nowIso,
      })
      .select('id')
      .single();

    if (msgErr) {
      console.warn('[WebchatAPI POST] Error inserting customer message:', msgErr);
    }

    // 4. Bot Auto-reply Evaluation
    const isGlobalBotPaused = Boolean(
      tenant.metadata?.bot_paused === true ||
      tenant.metadata?.is_bot_active === false
    );

    const isBotDisabledForThisChat = isConvBotPaused || isGlobalBotPaused;

    if (isBotDisabledForThisChat) {
      // CS Takeover / Bot is paused: Do not generate AI response
      return NextResponse.json({
        success: true,
        conversation_id: conversationId,
        customer_message_id: newCustomerMsg?.id || null,
        bot_paused: true,
        reply: null,
      });
    }

    // 5. Trigger AI bot reply via universal multimodal chat pipeline
    let botReplyText: string | null = null;
    let quickActions: string[] = [];
    let checkoutUrl: string | null = null;
    let botMessageType = 'TEXT';

    try {
      const aiResponse = await processMultimodalChat({
        tenant_slug: tenant.slug,
        tenant_id: tenant.id,
        message: rawMessage,
        channel: 'WEBCHAT',
        user_identifier: cleanVisitorPhone,
        sender_phone: customer_phone || cleanVisitorPhone,
        context: {
          visitor_id: cleanVid,
          customer_name: resolvedCustomerName,
          intent: intent || null,
        },
      });

      if (aiResponse && aiResponse.reply && !aiResponse.silent) {
        botReplyText = aiResponse.reply.trim();
        quickActions = aiResponse.quick_actions || [];
        checkoutUrl = aiResponse.checkout_url || null;
        botMessageType = aiResponse.type || 'TEXT';

        const nowBotIso = new Date().toISOString();

        // Persist bot reply in `messages`
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          sender_type: 'bot',
          sender: 'bot',
          type: botMessageType,
          message_body: botReplyText,
          text: botReplyText,
          channel: 'webchat',
          user_name: 'BoonPilot AI',
          user_phone: cleanVisitorPhone,
          metadata: {
            quick_actions: quickActions,
            checkout_url: checkoutUrl,
          },
          created_at: nowBotIso,
        });

        // Update conversation last_message to reflect bot response
        await supabase
          .from('conversations')
          .update({
            last_message: botReplyText,
            last_message_at: nowBotIso,
            updated_at: nowBotIso,
          })
          .eq('id', conversationId);
      }
    } catch (botErr) {
      console.warn('[WebchatAPI POST] Exception in AI auto-reply:', botErr);
    }

    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      customer_message_id: newCustomerMsg?.id || null,
      bot_paused: false,
      reply: botReplyText,
      quick_actions: quickActions,
      checkout_url: checkoutUrl,
      type: botMessageType,
    });
  } catch (err: any) {
    console.error('[WebchatAPI POST] Unexpected error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

function visitorIdNormalized(vid?: string | null): string {
  if (!vid) return '';
  return String(vid).trim().replace(/[^a-zA-Z0-9_-]/g, '');
}
