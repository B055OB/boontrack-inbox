'use client';

import React, { useState } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  CheckCircle2, 
  Sparkles, 
  QrCode, 
  Check, 
  ArrowRight,
  Bot
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
        botResponse = 'BoonTrack terintegrasi dengan ekspedisi reguler (J&T, SiCepat, Kargo) dan kurir instan Biteship. Saat pembeli memasukkan alamat/kota, ongkir dihitung otomatis dan dijumlahkan ke invoice.';
      } else if (text.toLowerCase().includes('capi') || text.toLowerCase().includes('meta')) {
        botResponse = 'Betul! Begitu pembeli menyelesaikan pesanan, server Next.js BoonTrack otomatis menembakkan event Purchase lengkap dengan Event ID deduplikasi ke Meta Conversions API (EMQ 9.8/10).';
      } else {
        botResponse = `Terima kasih! Asisten bot toko kami mampu menangani 10.000+ percakapan bersamaan, mengunci pesanan, dan mencatat data pelanggan otomatis ke database Anda.`;
      }

      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: botResponse, time: newTime, isQris }
      ]);
    }, 800);
  };

  return (
    <>
      {/* Floating Action Trigger Button (Bottom Right) */}
      <aside aria-label="Demo Bot WhatsApp" className="fixed bottom-6 right-5 z-50">
        <button
          type="button"
          onClick={onOpen}
          className="group px-4 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-full shadow-2xl shadow-emerald-600/40 hover:shadow-emerald-600/60 transition-all flex items-center gap-2 cursor-pointer border border-emerald-400/40"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#0C1317] border border-slate-700/80 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100 animate-in zoom-in-95 duration-200">
            
            {/* Modal WhatsApp Top Header */}
            <div className="bg-[#1F2C34] px-4 py-3 flex items-center justify-between border-b border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-xs shadow">
                  BT
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1">
                    <span>BoonTrack Bot Demo</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 text-slate-900" />
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">Live Simulation Active</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0B141A]">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-md leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-[#005C4B] text-white rounded-tr-none'
                        : 'bg-[#202C33] text-slate-200 rounded-tl-none border border-slate-700/40'
                    }`}
                  >
                    <p>{msg.text}</p>

                    {/* Optional Mock QRIS card if triggered */}
                    {msg.isQris && (
                      <div className="mt-2.5 p-2.5 bg-slate-950/80 border border-emerald-500/40 rounded-xl space-y-1.5 font-mono text-[10px]">
                        <div className="flex items-center justify-between text-emerald-400 font-bold">
                          <span>QRIS Standar Nasional</span>
                          <span>Rp 99.000</span>
                        </div>
                        <div className="text-slate-400 text-[9px]">
                          BCA, Mandiri, BRI, GoPay, OVO, DANA. Bebas biaya admin.
                        </div>
                      </div>
                    )}

                    <div className="text-[9px] text-slate-400 text-right mt-1 font-mono">
                      {msg.time} {msg.sender === 'bot' ? '• Bot' : '• Terkirim'}
                    </div>
                  </div>
                </div>
              ))}

              {isBotTyping && (
                <div className="flex justify-start">
                  <div className="bg-[#202C33] text-slate-400 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs font-mono animate-pulse border border-slate-700/40">
                    Bot sedang mengetik respon...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestion Pills */}
            <div className="bg-[#1F2C34]/80 p-2 border-t border-slate-700/60 overflow-x-auto flex gap-1.5 no-scrollbar">
              {samplePrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 bg-[#2A3942] hover:bg-[#354854] text-emerald-300 text-[10px] font-medium rounded-full shrink-0 border border-slate-600/40 transition cursor-pointer"
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
              className="bg-[#1F2C34] p-3 flex items-center gap-2 border-t border-slate-700/80"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ketik pesan tes bot..."
                className="flex-1 bg-[#2A3942] text-xs text-white placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500 font-sans"
              />
              <button
                type="submit"
                className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition cursor-pointer"
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
