/**
 * app/[tenant]/dashboard/hooks/useTenantInbox.ts
 * 100% Global & Tenant-Agnostic Supabase Realtime Inbox Hook.
 *
 * Implements:
 * 1. Fetching real conversations from `conversations` table
 * 2. Fetching real messages from `messages` table for active conversation
 * 3. Listening to Supabase Realtime Channel (`tenant-inbox-${tenantId}`)
 * 4. Zero static/dummy/mock data (100% dynamic database-driven)
 * 5. Sending manual live CS replies back to customer
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import { ChatConversation, ConversationMessage } from '../components/tabs/TeamChatTab';

export function formatInboxTime(date: Date | string | null | undefined): string {
  if (!date) return 'Baru saja';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Baru saja';

  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  if (diffHr < 24) return `${diffHr} jam lalu`;
  if (diffDay === 1) return 'Kemarin';
  if (diffDay < 7) return `${diffDay} hari lalu`;

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
}

export function getInitials(name: string): string {
  if (!name) return 'WA';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function useTenantInbox(tenantId?: string | null, tenantSlug?: string | null) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  const [resolvedTenantUuid, setResolvedTenantUuid] = useState<string | null>(
    tenantId && tenantId.includes('-') && tenantId.length > 30 ? tenantId : null
  );
  const [resolvedTenantSlug, setResolvedTenantSlug] = useState<string | null>(
    tenantSlug || (tenantId && !tenantId.includes('-') ? tenantId : null)
  );

  // Auto-resolve full tenant record from Supabase if either UUID or slug is missing
  useEffect(() => {
    let isMounted = true;
    async function resolveTenantIdentities() {
      const identifier = tenantId || tenantSlug;
      if (!identifier) return;
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        let query = supabase.from('tenants').select('id, slug');
        if (tenantId && tenantId.includes('-') && tenantId.length > 30) {
          query = query.or(`id.eq.${tenantId},slug.eq.${tenantId}`);
        } else if (tenantSlug) {
          query = query.or(`slug.eq.${tenantSlug},id.eq.${tenantSlug}`);
        } else {
          query = query.or(`slug.eq.${identifier},id.eq.${identifier}`);
        }

        const { data } = await query.maybeSingle();
        if (data && isMounted) {
          if (data.id) setResolvedTenantUuid(data.id);
          if (data.slug) setResolvedTenantSlug(data.slug);
        }
      } catch (e) {
        console.debug('[useTenantInbox] resolveTenantIdentities error:', e);
      }
    }
    resolveTenantIdentities();
    return () => { isMounted = false; };
  }, [tenantId, tenantSlug]);

  const effectiveTenantId = resolvedTenantUuid || tenantId || resolvedTenantSlug || tenantSlug || '';
  const effectiveTenantSlug = resolvedTenantSlug || tenantSlug || '';

  // 1. Fetch Conversations from Supabase (Universal & 100% Tenant-Agnostic, Zero Dummy Mock)
  const fetchConversations = useCallback(async () => {
    if (!effectiveTenantId && !effectiveTenantSlug) {
      setConversations([]);
      setIsLoadingConversations(false);
      return;
    }

    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const orTokens = new Set<string>();
      if (resolvedTenantUuid) orTokens.add(`tenant_id.eq.${resolvedTenantUuid}`);
      if (resolvedTenantSlug) {
        orTokens.add(`tenant_slug.eq.${resolvedTenantSlug}`);
        orTokens.add(`tenant_id.eq.${resolvedTenantSlug}`);
      }
      if (tenantId) orTokens.add(`tenant_id.eq.${tenantId}`);
      if (tenantSlug) {
        orTokens.add(`tenant_slug.eq.${tenantSlug}`);
        orTokens.add(`tenant_id.eq.${tenantSlug}`);
      }

      const orClause = Array.from(orTokens).join(',');
      const query = supabase
        .from('conversations')
        .select('*')
        .or(orClause)
        .order('last_message_at', { ascending: false })
        .limit(150);

      const { data, error } = await query;

      let convRows = data;
      if (error || !Array.isArray(convRows) || convRows.length === 0) {
        // Fallback to server route handler via service role key
        try {
          const targetParam = effectiveTenantSlug || effectiveTenantId || tenantSlug || tenantId || '';
          if (targetParam) {
            const res = await fetch(`/api/inbox/conversations?tenant=${encodeURIComponent(targetParam)}`);
            if (res.ok) {
              const json = await res.json();
              if (Array.isArray(json.conversations) && json.conversations.length > 0) {
                convRows = json.conversations;
              }
            }
          }
        } catch (apiErr) {
          console.debug('[useTenantInbox] Server API fallback note:', apiErr);
        }
      }

      if (Array.isArray(convRows)) {
        const uniqueConvs: ChatConversation[] = [];
        const seenIds = new Set<string>();
        const seenPhones = new Set<string>();

        for (const c of convRows) {
          const phone = c.customer_phone || c.phone_number || '';
          const name = c.customer_name || c.contact_name || phone || 'Pelanggan WhatsApp';
          const lastTime = c.last_message_at || c.updated_at || c.created_at;
          const cleanPhone = phone ? phone.replace(/\D/g, '') : '';

          if (seenIds.has(c.id)) continue;
          if (cleanPhone && seenPhones.has(cleanPhone)) continue;
          seenIds.add(c.id);
          if (cleanPhone) seenPhones.add(cleanPhone);

          uniqueConvs.push({
            id: c.id,
            customerPhone: phone,
            customerName: name,
            avatarInitials: getInitials(name),
            lastMessage: c.last_message || 'Belum ada pesan',
            time: formatInboxTime(lastTime),
            status: c.status === 'resolved' ? 'offline' : 'online',
            assignedTo: c.assigned_agent_id ? 'my_chat' : 'unassigned',
            assignedAgentName: c.assigned_agent_id ? 'CS Aktif' : 'Unassigned / AI Bot',
            isBotActive: c.bot_paused === true ? false : (c.bot_mode === 'HUMAN_ACTIVE' ? false : true),
            tag: c.unread_count > 0 ? 'Pesan Baru' : 'WhatsApp',
            unreadCount: c.unread_count || 0,
            messages: [],
          });
        }

        setConversations(uniqueConvs);
        if (uniqueConvs.length > 0 && !activeConversationId) {
          setActiveConversationId(uniqueConvs[0].id);
        }
      } else {
        setConversations([]);
      }
    } catch (err) {
      console.error('[useTenantInbox] Exception fetching conversations:', err);
      setConversations([]);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [resolvedTenantUuid, resolvedTenantSlug, tenantId, tenantSlug, effectiveTenantId, effectiveTenantSlug, activeConversationId]);

  // 2. Fetch Messages for Active Conversation (with Frontend Deduplication)
  const fetchMessages = useCallback(async (convId: string) => {
    if (!convId) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    try {
      const supabase = getSupabase();
      let msgRows: any[] | null = null;

      if (supabase) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true })
          .limit(200);

        if (!error && Array.isArray(data)) {
          msgRows = data;
        }
      }

      if (!msgRows || msgRows.length === 0) {
        // Fallback to server route handler via service role
        try {
          const res = await fetch(`/api/inbox/messages?conversationId=${encodeURIComponent(convId)}`);
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.messages)) {
              msgRows = json.messages;
            }
          }
        } catch (apiErr) {
          console.debug('[useTenantInbox] Server messages API note:', apiErr);
        }
      }

      if (Array.isArray(msgRows)) {
        const uniqueMsgs: ConversationMessage[] = [];
        const seenMsgIds = new Set<string | number>();
        const seenSignatures = new Set<string>();

        for (const m of msgRows) {
          const msgId = m.id || m.created_at;
          const isCustomer = m.sender_type === 'customer' || m.sender === 'user' || m.sender === 'customer';
          const isBot = m.sender_type === 'bot' || m.sender === 'bot';
          const isAgent = m.sender_type === 'agent' || m.sender === 'agent';
          const text = (m.message_body || m.text || '').trim();
          const sender = isCustomer ? 'customer' : isBot ? 'bot' : isAgent ? 'agent' : 'system';
          const ts = m.created_at ? new Date(m.created_at) : new Date();
          const timeSecBucket = Math.floor(ts.getTime() / 15000);
          const sig = `${sender}:${text}:${timeSecBucket}`;

          if (seenMsgIds.has(msgId)) continue;
          if (m.external_id && seenMsgIds.has(m.external_id)) continue;
          if (text && seenSignatures.has(sig)) continue;

          seenMsgIds.add(msgId);
          if (m.external_id) seenMsgIds.add(m.external_id);
          if (text) seenSignatures.add(sig);

          const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')} WIB`;

          uniqueMsgs.push({
            id: msgId,
            external_id: m.external_id || undefined,
            created_at: m.created_at,
            sender,
            senderName: m.user_name || (isBot ? 'BoonPilot AI' : isAgent ? 'Live CS Agent' : undefined),
            text,
            time: timeStr,
            isQris: m.payload?.is_qris || m.raw_payload?.is_qris,
            qrisData: m.payload?.qris_data || m.raw_payload?.qris_data,
          });
        }

        setMessages(uniqueMsgs);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, messages: uniqueMsgs, unreadCount: 0 } : c))
        );
      }
    } catch (err) {
      console.error('[useTenantInbox] Exception fetching messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when activeConversationId changes
  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  // 3. Supabase Realtime Listener (tenant-inbox-${effectiveTenantSlug || effectiveTenantId})
  useEffect(() => {
    if (!effectiveTenantId && !effectiveTenantSlug) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channelIdentifier = effectiveTenantSlug || effectiveTenantId;
    const channelName = `tenant-inbox-${channelIdentifier}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        (payload: any) => {
          const rec = payload.new || payload.old || {};
          const isTargetTenant =
            rec.tenant_id === effectiveTenantId ||
            rec.tenant_slug === effectiveTenantSlug ||
            rec.tenant_id === effectiveTenantSlug ||
            rec.tenant_id === resolvedTenantUuid;

          if (!isTargetTenant) return;

          if (payload.eventType === 'INSERT') {
            fetchConversations();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new;
            setConversations((prev) => {
              const exists = prev.some((c) => c.id === updated.id);
              if (exists) {
                return prev.map((c) =>
                  c.id === updated.id
                    ? {
                        ...c,
                        lastMessage: updated.last_message || c.lastMessage,
                        time: formatInboxTime(updated.last_message_at || updated.updated_at),
                        unreadCount: updated.unread_count ?? c.unreadCount,
                      }
                    : c
                );
              }
              return prev;
            });
          } else if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old?.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (newMsg && newMsg.conversation_id === activeConversationId) {
            const isCust = newMsg.sender_type === 'customer' || newMsg.sender === 'user' || newMsg.sender === 'customer';
            const isBot = newMsg.sender_type === 'bot' || newMsg.sender === 'bot';
            const isAgent = newMsg.sender_type === 'agent' || newMsg.sender === 'agent';
            const ts = newMsg.created_at ? new Date(newMsg.created_at) : new Date();
            const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')} WIB`;
            const incomingText = (newMsg.message_body || newMsg.text || '').trim();
            const incomingSender = isCust ? 'customer' : isBot ? 'bot' : isAgent ? 'agent' : 'system';

            const incoming: ConversationMessage = {
              id: newMsg.id,
              external_id: newMsg.external_id || undefined,
              created_at: newMsg.created_at,
              sender: incomingSender,
              senderName: newMsg.user_name || (isBot ? 'BoonPilot AI' : isAgent ? 'Live CS Agent' : undefined),
              text: incomingText,
              time: timeStr,
              isQris: newMsg.payload?.is_qris || newMsg.raw_payload?.is_qris,
              qrisData: newMsg.payload?.qris_data || newMsg.raw_payload?.qris_data,
            };

            setMessages((prev) => {
              if (
                prev.some(
                  (m) =>
                    m.id === incoming.id ||
                    (m.external_id && incoming.external_id && m.external_id === incoming.external_id) ||
                    (m.text.trim() === incomingText && m.sender === incomingSender)
                )
              ) {
                return prev;
              }
              return [...prev, incoming];
            });
          }
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveTenantId, effectiveTenantSlug, resolvedTenantUuid, activeConversationId, fetchConversations]);

  // Active conversation object
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || conversations[0] || null;
  }, [conversations, activeConversationId]);

  // 4. Send Message from CS Agent
  const handleSendMessage = useCallback(
    async (text?: string): Promise<boolean> => {
      const body = (text !== undefined ? text : replyText).trim();
      if (!body || !activeConversation || (!effectiveTenantId && !effectiveTenantSlug)) return false;

      setIsSending(true);
      try {
        const supabase = getSupabase();
        if (!supabase) return false;

        const customerPhone = activeConversation.customerPhone;
        const nowIso = new Date().toISOString();

        // 4a. Insert into messages
        await supabase.from('messages').insert({
          conversation_id: activeConversation.id,
          tenant_id: effectiveTenantId,
          tenant_slug: effectiveTenantSlug,
          sender_type: 'agent',
          sender: 'agent',
          message_body: body,
          text: body,
          channel: 'whatsapp',
          user_name: 'Anda (Live CS)',
          user_phone: customerPhone,
          created_at: nowIso,
        });

        // 4b. Update conversations table and pause bot for human takeover
        await supabase
          .from('conversations')
          .update({
            last_message: body,
            last_message_at: nowIso,
            bot_paused: true,
            bot_mode: 'HUMAN_ACTIVE',
            updated_at: nowIso,
          })
          .eq('id', activeConversation.id);

        // 4c. Outbound dispatch via Evolution API if instance exists
        try {
          const { data: conn } = await supabase
            .from('whatsapp_connections')
            .select('instance_name, credential_ref')
            .or(`tenant_id.eq.${effectiveTenantId},tenant_slug.eq.${effectiveTenantSlug},tenant_id.eq.${effectiveTenantSlug}`)
            .eq('status', 'open')
            .maybeSingle();

          if (conn?.instance_name) {
            const { sendEvolutionTextMessage } = await import('@/lib/whatsapp/evolution-webhook-handler');
            await sendEvolutionTextMessage(conn.instance_name, customerPhone, body, conn.credential_ref);
          }
        } catch (sendErr) {
          console.warn('[useTenantInbox] WhatsApp dispatch warning:', sendErr);
        }

        setReplyText('');
        if (activeConversation.id) {
          fetchMessages(activeConversation.id);
        }
        fetchConversations();
        return true;
      } catch (err) {
        console.error('[useTenantInbox] Error sending message:', err);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [replyText, activeConversation, effectiveTenantId, effectiveTenantSlug, fetchMessages, fetchConversations]
  );

  return {
    conversations,
    activeConversationId,
    activeConversation,
    setActiveConversationId,
    messages,
    isLoadingConversations,
    isLoadingMessages,
    replyText,
    setReplyText,
    handleSendMessage,
    isSending,
    refreshConversations: fetchConversations,
  };
}
