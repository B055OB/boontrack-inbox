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
  tenant_id?: string | null;
  [key: string]: any;
}

function InboxContent() {
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get('tenant');

  const [messages, setMessages] = useState<Message[]>([]);
  const [tenantName, setTenantName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    async function loadData() {
      try {
        setLoading(true);
        let resolvedTenantId: string | null = null;

        if (tenantSlug) {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (tenantData) {
            resolvedTenantId = tenantData.id;
            setTenantName(tenantData.name);
          } else {
            setTenantName(tenantSlug);
          }
        }

        // Fetch Messages (Ambil pesan yang cocok dengan tenant ATAU tenant_id is NULL)
        let query = supabase.from('messages').select('*').order('created_at', { ascending: false });
        
        const { data, error } = await query;
        if (error) throw error;

        if (data) {
          const filtered = data.filter((m: Message) => {
            if (!tenantSlug) return true;
            return (
              m.tenant_id === resolvedTenantId ||
              m.tenant_id === tenantSlug ||
              m.tenant_id === null ||
              m.tenant_id === '00000000-0000-0000-0000-000000000000'
            );
          });
          setMessages(filtered);
        }

        // Realtime Subscription
        const channel = supabase
          .channel(`messages-live-${tenantSlug || 'all'}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
            },
            (payload) => {
              const newMsg = payload.new as Message;
              if (
                !tenantSlug ||
                newMsg.tenant_id === resolvedTenantId ||
                newMsg.tenant_id === tenantSlug ||
                newMsg.tenant_id === null ||
                newMsg.tenant_id === '00000000-0000-0000-0000-000000000000'
              ) {
                setMessages((prev) => [newMsg, ...prev]);
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.error('Error loading inbox:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [tenantSlug]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <header className="border-b pb-4 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {tenantName ? `Inbox: ${tenantName}` : 'BoonTrack Live Inbox'}
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
            Belum ada pesan masuk untuk {tenantName || 'tenant ini'}.
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
                <p className="text-gray-800 text-sm whitespace-pre-wrap">{msg.text || msg.message || '(Pesan kosong)'}</p>
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