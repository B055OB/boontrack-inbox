'use client';

import React, { useState } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2,
  MessageCircle
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
}: FloatingWaDemoModalProps) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      sender: 'bot',
      text: 'Halo! Saya BoonPilot AI Assistant. Anda sedang mencoba demo live simulasi percakapan otomatis BoonTrack Shop.',
      time: '11:15'
    },
    {
      sender: 'bot',
      text: 'Silakan pilih atau ketik pertanyaan di bawah untuk melihat bagaimana sistem merespon secara instan:',
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
        botResponse = 'Tentu! Sistem langsung menerbitkan Dynamic QRIS standar Bank Indonesia. Pembeli tinggal scan via BCA, Mandiri, BRI, GoPay, OVO, atau DANA. Pembayaran terverifikasi otomatis dalam hitungan detik oleh Reader APK tanpa potongan komisi marketplace.';
        isQris = true;
      } else if (text.toLowerCase().includes('ongkir')) {
        botResponse = 'BoonTrack terintegrasi dengan ekspedisi reguler (J&T, SiCepat, JNE) dan kurir instan (radius km). Saat pembeli memasukkan alamat, ongkir otomatis terhitung dan masuk ke total invoice.';
      } else if (text.toLowerCase().includes('capi') || text.toLowerCase().includes('meta')) {
        botResponse = 'Betul! Begitu pembeli menyelesaikan pesanan, server Next.js BoonTrack otomatis mengirim event Purchase lengkap dengan deduplication key ke Meta Conversions API (EMQ 9.6/10).';
      } else {
        botResponse = 'Terima kasih! Bot asisten toko kami mampu menangani ribuan percakapan bersamaan, mengunci pesanan, dan mencatat data pelanggan otomatis ke database toko Anda.';
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
          <MessageCircle className="w-4 h-4" />
          <span>Live Demo WA</span>
        </button>
      </aside>

      {/* WhatsApp Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[580px] max-h-[90vh]">
            
            {/* Header Dialog (WhatsApp Green) */}
            <div className="bg-[#008069] p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white text-[#008069] flex items-center justify-center font-black text-sm shadow-xs">
                  BT
                </div>
                <div>
                  <div className="font-bold text-sm flex items-center gap-1">
                    <span>BoonPilot Assistant</span>
                    <CheckCircle2 className="w-4 h-4 text-white fill-white text-[#008069]" />
                  </div>
                  <div className="text-[11px] text-emerald-100 font-mono">
                    Online • Simulasi Respon Otomatis
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-white/20 transition cursor-pointer text-white"
                aria-label="Tutup modal demo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Body Area (WhatsApp Pattern Background) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#EFEAE2]">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                      msg.sender === 'user'
                        ? 'bg-white text-slate-900 rounded-tr-none'
                        : 'bg-[#D9FDD3] text-slate-900 rounded-tl-none border border-emerald-200/60'
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.isQris && (
                      <div className="mt-2 p-2.5 bg-white rounded-xl border border-emerald-300 font-mono text-[10px] space-y-1">
                        <div className="font-bold text-slate-900">Dynamic QRIS Terbit:</div>
                        <div className="text-emerald-700 font-black text-xs">Rp 299.000 (ID: ORD-9921)</div>
                        <div className="text-slate-400">Verifikasi hitungan detik via Reader APK</div>
                      </div>
                    )}
                    <div className="text-[9px] text-slate-400 text-right mt-1 font-mono">
                      {msg.time} {msg.sender === 'bot' && '• Bot'}
                    </div>
                  </div>
                </div>
              ))}

              {isBotTyping && (
                <div className="flex justify-start">
                  <div className="bg-[#D9FDD3] text-slate-500 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs font-mono shadow-xs animate-pulse">
                    BoonPilot sedang mengetik...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Sample Prompts Pills */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 overflow-x-auto flex items-center gap-1.5 shrink-0 scrollbar-none">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-blue-700 text-[11px] font-bold rounded-lg shrink-0 transition cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Bottom Text Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                placeholder="Ketik pertanyaan untuk bot..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:bg-white focus:outline-none focus:border-blue-600 transition"
              />
              <button
                type="submit"
                className="p-2.5 bg-[#008069] hover:bg-[#00705c] active:scale-95 text-white rounded-xl transition cursor-pointer"
                aria-label="Kirim pesan"
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
