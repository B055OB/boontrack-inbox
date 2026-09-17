'use client';

import React, { useState } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  CheckCircle2
} from 'lucide-react';

interface FloatingWaDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  referralCode?: string;
}

interface MessageItem {
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isQris?: boolean;
}

export default function FloatingWaDemoModal({
  isOpen,
  onClose,
  onOpen,
  referralCode
}: FloatingWaDemoModalProps) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      sender: 'bot',
      text: 'Halo! Saya BoonPilot AI Assistant. Anda sedang mencoba demo live otomasi pesan WhatsApp toko.',
      time: '11:15'
    },
    {
      sender: 'bot',
      text: 'Silakan klik salah satu pertanyaan di bawah untuk melihat bagaimana sistem merespon secara instan:',
      time: '11:15'
    }
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);

  const samplePrompts = [
    'Bisa simulasi transaksi QRIS?',
    'Bagaimana cara cek ongkir otomatis?',
    'Apakah Meta CAPI berjalan otomatis?'
  ];

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputVal.trim();
    if (!text) return;

    const newTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    setMessages((prev) => [
      ...prev,
      { sender: 'user', text, time: newTime }
    ]);
    setInputVal('');
    setIsBotTyping(true);

    setTimeout(() => {
      setIsBotTyping(false);
      let botResponse = '';
      let isQris = false;

      if (text.toLowerCase().includes('qris')) {
        botResponse = 'Tentu! Sistem langsung menerbitkan Dynamic QRIS dengan nominal presisi. Pembeli tinggal scan via BCA, GoPay, OVO, atau DANA. Dana langsung cair detik itu juga tanpa potongan komisi marketplace.';
        isQris = true;
      } else if (text.toLowerCase().includes('ongkir')) {
        botResponse = 'BoonTrack terintegrasi dengan ekspedisi reguler (J&T, SiCepat, Kargo) dan kurir instan otomatis (radius km). Saat pembeli memasukkan alamat/kota, ongkir dihitung otomatis dan dijumlahkan ke invoice.';
      } else if (text.toLowerCase().includes('capi') || text.toLowerCase().includes('meta')) {
        botResponse = 'Betul! Begitu pembeli menyelesaikan pesanan, server Next.js BoonTrack otomatis menembakkan event Purchase lengkap dengan Event ID deduplikasi ke Meta Conversions API (EMQ 9.8/10).';
      } else {
        botResponse = `Terima kasih! Asisten bot toko kami mampu menangani 10.000+ percakapan bersamaan, mengunci pesanan, dan mencatat data pelanggan otomatis ke database Anda.`;
      }

      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: botResponse, time: newTime, isQris }
      ]);
    }, 750);
  };

  return (
    <>
      {/* Floating Action Trigger Button (Bottom Right) */}
      <aside aria-label="Demo Bot WhatsApp" className="fixed bottom-6 right-5 z-50">
        <button
          type="button"
          onClick={onOpen}
          className="group px-4 py-3 bg-[#008069] hover:bg-[#00705c] active:scale-95 text-white font-bold text-xs rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 cursor-pointer border border-emerald-400/30"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <MessageSquare className="w-4 h-4 fill-white" />
          <span className="hidden sm:inline">Coba Demo Bot WhatsApp</span>
          <span className="sm:hidden">Demo Bot</span>
        </button>
      </aside>

      {/* Interactive Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-zinc-200 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-900 animate-in zoom-in-95 duration-200">
            
            {/* Modal WhatsApp Top Header (Light Green) */}
            <div className="bg-[#008069] px-4 py-3 flex items-center justify-between text-white shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white text-[#008069] flex items-center justify-center font-black text-xs shadow-xs">
                  BT
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>BoonTrack Bot Demo</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white fill-white text-[#008069]" />
                  </div>
                  <div className="text-[10px] text-emerald-100 font-mono">Live Simulation Active</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-white/80 hover:text-white hover:bg-black/10 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Messages Body (Clean WhatsApp Light Background: #EFEAE2) */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#EFEAE2]">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-white text-zinc-900 rounded-tr-none'
                        : 'bg-[#D9FDD3] text-zinc-900 rounded-tl-none border border-emerald-200/70'
                    }`}
                  >
                    <p>{msg.text}</p>

                    {/* Optional Mock QRIS card if triggered */}
                    {msg.isQris && (
                      <div className="mt-2.5 p-2.5 bg-white border border-emerald-300 rounded-xl space-y-1 font-mono text-[10px] shadow-xs">
                        <div className="flex items-center justify-between text-emerald-800 font-bold">
                          <span>QRIS Standar Nasional</span>
                          <span>Rp 99.000</span>
                        </div>
                        <div className="text-zinc-500 text-[9px]">
                          BCA, Mandiri, BRI, GoPay, OVO, DANA. Bebas biaya admin.
                        </div>
                      </div>
                    )}

                    <div className="text-[9px] text-zinc-400 text-right mt-1 font-mono">
                      {msg.time} {msg.sender === 'bot' ? '• Bot' : '• Terkirim'}
                    </div>
                  </div>
                </div>
              ))}

              {isBotTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-zinc-500 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs font-mono animate-pulse border border-zinc-200 shadow-xs">
                    Bot sedang mengetik respon...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestion Pills */}
            <div className="bg-zinc-100 p-2 border-t border-zinc-200 overflow-x-auto flex gap-1.5 no-scrollbar">
              {samplePrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 bg-white hover:bg-zinc-50 text-zinc-800 text-[10px] font-medium rounded-full shrink-0 border border-zinc-300 transition cursor-pointer shadow-xs"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="bg-white p-3 flex items-center gap-2 border-t border-zinc-200"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ketik pesan tes bot..."
                className="flex-1 bg-zinc-100 text-xs text-zinc-900 placeholder:text-zinc-400 rounded-xl px-3.5 py-2.5 border border-zinc-200 focus:outline-none focus:border-[#008069] font-sans"
              />
              <button
                type="submit"
                className="p-2.5 bg-[#008069] hover:bg-[#00705c] text-white rounded-xl transition cursor-pointer shadow-xs"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>
        </div>
      )}
    </>
  );
}
