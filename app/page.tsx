'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Message {
  id: string;
  created_at: string;
  sender: string;
  text: string;
  phone_number?: string;
  status?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMessages() {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setMessages(data);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();

    const channel = supabase
      .channel('messages-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [payload.new as Message, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <header className="border-b pb-4 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">BoonTrack Live Inbox</h1>
            <p className="text-sm text-gray-500">Realtime Incoming WhatsApp & Bot Activity</p>
          </div>
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        </header>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-gray-400">Belum ada pesan masuk.</div>
        ) : (
          <div className="divide-y">
            {messages.map((msg) => (
              <div key={msg.id} className="py-4 flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span className="font-semibold text-gray-700">{msg.sender || msg.phone_number || 'Unknown'}</span>
                  <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-gray-800 text-sm">{msg.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}