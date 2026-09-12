'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  X,
  Send,
  QrCode,
  ShoppingBag,
  Sparkles,
  Bot,
  User,
  ChevronDown,
} from 'lucide-react';
import type { StoreChatMessage, Product } from '@/app/[tenant]/page';

interface FloatingWebchatProps {
  tenantSlug: string;
  storeName: string;
  displayName: string;
  dynamicQuickReplies: string[];
  onInitiateCheckout: (product: { id: string; title: string; price: number }) => void;
  onAddToCart?: (product: Product) => void;
}

export default function FloatingWebchat({
  tenantSlug,
  storeName,
  displayName,
  dynamicQuickReplies,
  onInitiateCheckout,
  onAddToCart,
}: FloatingWebchatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeName = storeName || displayName.toUpperCase();

  // Inisialisasi pesan pertama
  useEffect(() => {
    setMessages([
      {
        id: 'init-floating-1',
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Halo! Selamat datang di ${activeName} 👋 Ada yang bisa kami bantu seputar produk atau layanan kami hari ini?`,
        type: 'TEXT',
        quick_actions: dynamicQuickReplies,
      },
    ]);
  }, [activeName, dynamicQuickReplies]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isBotTyping, isOpen]);

  const sendChatMessage = async (userText: string) => {
    const userMsg: StoreChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: userText,
      type: 'TEXT',
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsBotTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          tenant: tenantSlug,
          history: messages.slice(-6).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }],
          })),
        }),
      });

      const data = await res.json();
      const botMsg: StoreChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: data.reply || data.response || 'Terima kasih atas pesannya. Tim kami akan segera menanggapi pertanyaan Anda.',
        action: data.action,
        type: data.type || 'TEXT',
        product: data.product,
        quick_actions: data.quick_actions || dynamicQuickReplies,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Halo! Layanan ${activeName} siap membantu. Silakan pilih opsi pertanyaan di bawah atau hubungi admin langsung.`,
          type: 'TEXT',
          quick_actions: dynamicQuickReplies,
        },
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isBotTyping) return;
    const txt = inputMessage;
    setInputMessage('');
    sendChatMessage(txt);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Floating Chat Modal Box */}
      {isOpen && (
        <div className="w-[360px] sm:w-[390px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100dvh-6rem)] bg-white rounded-3xl border border-slate-200/90 shadow-2xl flex flex-col overflow-hidden mb-3 animate-fadeIn transition-all">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-black tracking-tight">{activeName}</h4>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[10px] text-purple-200 font-medium">Asisten Interaktif 24 Jam</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="Tutup Chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/70 text-xs">
            {messages.map((msg, idx) => {
              const isLatest = msg.sender === 'bot' && idx === messages.length - 1;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-3.5 leading-relaxed shadow-2xs ${
                      msg.sender === 'user'
                        ? 'bg-purple-600 text-white rounded-br-xs'
                        : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>

                    {/* Rekomendasi Produk Dalam Chat */}
                    {msg.sender === 'bot' && msg.product && (
                      <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 space-y-2">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={msg.product.image || '/logo-shop.png'}
                            alt={msg.product.name}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-xs truncate">{msg.product.name}</p>
                            <p className="text-purple-600 font-black text-xs">
                              Rp {Number(msg.product.price || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!msg.product) return;
                            onInitiateCheckout({
                              id: String(msg.product.id),
                              title: msg.product.name,
                              price: Number(msg.product.price),
                            });
                          }}
                          className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Pesan Langsung</span>
                        </button>
                      </div>
                    )}

                    <span
                      className={`block text-[9px] mt-1 text-right font-medium ${
                        msg.sender === 'user' ? 'text-purple-200' : 'text-slate-400'
                      }`}
                    >
                      {msg.time}
                    </span>
                  </div>

                  {/* Dynamic Quick Actions */}
                  {isLatest && Array.isArray(msg.quick_actions) && msg.quick_actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                      {msg.quick_actions.slice(0, 4).map((chip, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={isBotTyping}
                          onClick={() => sendChatMessage(chip)}
                          className="text-[10px] font-semibold bg-white hover:bg-purple-50 hover:text-purple-700 text-slate-700 border border-slate-200 hover:border-purple-300 px-2.5 py-1 rounded-full transition active:scale-95 shadow-2xs"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isBotTyping && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 w-fit shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-bounce [animation-delay:0.4s]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ketik pertanyaan atau kebutuhan..."
              disabled={isBotTyping}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-purple-600 outline-none transition"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isBotTyping}
              className="w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full shadow-lg shadow-purple-600/30 transition-all duration-300 active:scale-95 cursor-pointer"
        aria-label="Buka Chat Asisten"
      >
        <span className="relative flex items-center justify-center">
          <MessageSquare className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-purple-600 animate-pulse" />
        </span>
        <span className="font-bold text-xs tracking-tight">Tanya Asisten AI</span>
      </button>
    </div>
  );
}
