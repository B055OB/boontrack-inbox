'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);

  // 1. Ambil riwayat percakapan dari Supabase
  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setConversations(data);
  }

  // 2. Ambil detail pesan & pasang Supabase Realtime
  useEffect(() => {
    if (!selectedChat) return;

    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedChat.id)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    }

    loadMessages();

    // Supabase Realtime Listener
    const channel = supabase
      .channel('realtime_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedChat.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat]);

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Sidebar Daftar Kontak */}
      <div className="w-1/3 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800 font-bold text-lg text-emerald-400">
          BoonTrack Live Inbox
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">Belum ada percakapan masuk</div>
          ) : (
            conversations.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`p-4 border-b border-slate-800 cursor-pointer hover:bg-slate-800 transition ${
                  selectedChat?.id === chat.id ? 'bg-slate-800' : ''
                }`}
              >
                <div className="font-semibold">{chat.contact_name || chat.phone_number}</div>
                <div className="text-xs text-slate-400">{chat.phone_number}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel Percakapan */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {selectedChat ? (
          <>
            <div className="p-4 border-b border-slate-800 font-semibold text-emerald-400">
              {selectedChat.contact_name || selectedChat.phone_number}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg text-sm ${
                      msg.sender === 'user'
                        ? 'bg-slate-800 text-white rounded-bl-none'
                        : 'bg-emerald-600 text-white rounded-br-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Pilih kontak di sebelah kiri untuk melihat pesan
          </div>
        )}
      </div>
    </div>
  );
}