/**
 * app/[tenant]/dashboard/hooks/useTenantInbox.ts
 * 100% Global & Tenant-Agnostic Supabase Realtime Inbox Hook.
 *
 * Implements:
 * 1. Fetching real conversations from `conversations` table
 * 2. Fetching real messages from `messages` table for active conversation
 * 3. Listening to Supabase Realtime Channel (`tenant-inbox-${tenantId}`)
 * 4. Zero static/dummy/mock data ('Bagus', 'Shopee Ads', etc.)
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

  const resolvedTenantId = tenantId || tenantSlug || '';

  // 1. Fetch Conversations from Supabase
  const fetchConversations = useCallback(async () => {
    if (!resolvedTenantId) {
      setConversations([]);
      setIsLoadingConversations(false);
      return;
    }

    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const query = supabase
        .from('conversations')
        .select('*')
        .or(`tenant_id.eq.${resolvedTenantId},tenant_slug.eq.${tenantSlug || resolvedTenantId}`)
        .order('last_message_at', { ascending: false })
        .limit(150);

      const { data, error } = await query;

      if (error) {
        console.debug('[useTenantInbox] Fetch conversations note:', error.message);
        return;
      }

      if (Array.isArray(data)) {
        const mapped: ChatConversation[] = data.map((c: any) => {
          const phone = c.customer_phone || c.phone_number || '';
          const name = c.customer_name || c.contact_name || phone || 'Pelanggan WhatsApp';
          const lastTime = c.last_message_at || c.updated_at || c.created_at;

          return {
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
          };
        });

        setConversations(mapped);
        if (mapped.length > 0 && !activeConversationId) {
          setActiveConversationId(mapped[0].id);
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
  }, [resolvedTenantId, tenantSlug, activeConversationId]);

  // 2. Fetch Messages for Active Conversation
  const fetchMessages = useCallback(async (convId: string) => {
    if (!convId) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.debug('[useTenantInbox] Fetch messages error:', error.message);
        return;
      }

      if (Array.isArray(data)) {
        const mapped: ConversationMessage[] = data.map((m: any) => {
          const isCustomer = m.sender_type === 'customer' || m.sender === 'user' || m.sender === 'customer';
          const isBot = m.sender_type === 'bot' || m.sender === 'bot';
          const isAgent = m.sender_type === 'agent' || m.sender === 'agent';
          const ts = m.created_at ? new Date(m.created_at) : new Date();
          const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')} WIB`;

          return {
            id: m.id || m.created_at,
            sender: isCustomer ? 'customer' : isBot ? 'bot' : isAgent ? 'agent' : 'system',
            senderName: m.user_name || (isBot ? 'BoonPilot AI' : isAgent ? 'Live CS Agent' : undefined),
            text: m.message_body || m.text || '',
            time: timeStr,
            isQris: m.payload?.is_qris || m.raw_payload?.is_qris,
            qrisData: m.payload?.qris_data || m.raw_payload?.qris_data,
          };
        });

        setMessages(mapped);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, messages: mapped, unreadCount: 0 } : c))
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

  // 3. Supabase Realtime Listener (tenant-inbox-${tenantId})
  useEffect(() => {
    if (!resolvedTenantId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channelName = `tenant-inbox-${resolvedTenantId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${resolvedTenantId}`,
        },
        (payload: any) => {
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
          filter: `tenant_id=eq.${resolvedTenantId}`,
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (newMsg && newMsg.conversation_id === activeConversationId) {
            const isCust = newMsg.sender_type === 'customer' || newMsg.sender === 'user' || newMsg.sender === 'customer';
            const isBot = newMsg.sender_type === 'bot' || newMsg.sender === 'bot';
            const isAgent = newMsg.sender_type === 'agent' || newMsg.sender === 'agent';
            const ts = newMsg.created_at ? new Date(newMsg.created_at) : new Date();
            const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')} WIB`;

            const incoming: ConversationMessage = {
              id: newMsg.id,
              sender: isCust ? 'customer' : isBot ? 'bot' : isAgent ? 'agent' : 'system',
              senderName: newMsg.user_name || (isBot ? 'BoonPilot AI' : isAgent ? 'Live CS Agent' : undefined),
              text: newMsg.message_body || newMsg.text || '',
              time: timeStr,
              isQris: newMsg.payload?.is_qris || newMsg.raw_payload?.is_qris,
              qrisData: newMsg.payload?.qris_data || newMsg.raw_payload?.qris_data,
            };

            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev;
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
  }, [resolvedTenantId, activeConversationId, fetchConversations]);

  // Active conversation object
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || conversations[0] || null;
  }, [conversations, activeConversationId]);

  // 4. Send Message from CS Agent
  const handleSendMessage = useCallback(
    async (text?: string): Promise<boolean> => {
      const body = (text !== undefined ? text : replyText).trim();
      if (!body || !activeConversation || !resolvedTenantId) return false;

      setIsSending(true);
      try {
        const supabase = getSupabase();
        if (!supabase) return false;

        const customerPhone = activeConversation.customerPhone;
        const nowIso = new Date().toISOString();

        // 4a. Insert into messages
        await supabase.from('messages').insert({
          conversation_id: activeConversation.id,
          tenant_id: resolvedTenantId,
          tenant_slug: tenantSlug || resolvedTenantId,
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
            .or(`tenant_id.eq.${resolvedTenantId},tenant_slug.eq.${tenantSlug || resolvedTenantId}`)
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
    [replyText, activeConversation, resolvedTenantId, tenantSlug, fetchMessages, fetchConversations]
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
