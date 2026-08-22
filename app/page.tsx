'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

interface Message {
  id?: string;
  created_at?: string;
  sender?: string;
  text?: string;
  phone_number?: string;
  message?: string;
  tenant_id?: string;
  [key: string]: any;
}

function InboxContent() {
  const searchParams = useSearchParams();
  const tenantParam = searchParams.get('tenant'); // Mengambil nilai dari ?tenant=...

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    async function fetchMessages() {
      try {
        setLoading(true);
        let query = supabase.from('messages').select('*');

        // Filter otomatis jika parameter tenant ada di URL
        if (tenantParam) {
          query = query.eq('tenant_id', tenantParam);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data) {
          const sorted = [...data].reverse();
          setMessages(sorted);
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();

    // Listen realtime event
    const channel = supabase
      .channel(`messages-${tenantParam || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          ...(tenantParam ? { filter: `tenant_id=eq.${tenantParam}` } : {}),
        },
        (payload) => {
          setMessages((prev) => [payload.new as Message, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantParam]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <header className="border-b pb-4 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {tenantParam ? `Inbox: ${tenantParam}` : 'BoonTrack Live Inbox'}
            </h1>
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
          <div className="py-12 text-center text-gray-400">
            Belum ada pesan masuk {tenantParam ? `untuk tenant ${tenantParam}` : ''}.
          </div>
        ) : (
          <div className="divide-y">
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className="py-4 flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span className="font-semibold text-gray-700">
                    {msg.sender || msg.phone_number || 'Customer'}
                  </span>
                  <span>
                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : 'Baru saja'}
                  </span>
                </div>
                <p className="text-gray-800 text-sm">{msg.text || msg.message || '(Pesan kosong)'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-400">Loading inbox...</div>}>
      <InboxContent />
    </Suspense>
  );
}