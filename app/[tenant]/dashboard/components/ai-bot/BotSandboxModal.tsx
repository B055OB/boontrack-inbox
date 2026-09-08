'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RotateCcw, X, Sparkles } from 'lucide-react';

interface BotSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  initialGreeting?: string;
}

export default function BotSandboxModal({
  isOpen,
  onClose,
  tenantSlug,
  initialGreeting = 'Halo! Mau konsultasi pembersihan toren ukuran berapa liter ya Kak?',
}: BotSandboxModalProps) {
  const [messages, setMessages] = useState<{ sender: 'user' | 'bot'; text: string; state?: string }[]>([
    { sender: 'bot', text: initialGreeting, state: 'GREETING' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/bot/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          message: userText,
          history: messages,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: data.reply || 'Maaf, bot tidak merespons.', state: data.state },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Koneksi simulator terputus.', state: 'ERROR' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([{ sender: 'bot', text: initialGreeting, state: 'GREETING' }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl flex flex-col h-[560px] overflow-hidden">
        
        {/* Header Sandbox */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black">WA Bot Simulator</span>
                <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.2 rounded">
                  Dry-Run Sandbox
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">shop.boontrack.com/{tenantSlug}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              title="Reset Percakapan"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Log */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#EFEAE2]/30 text-xs">
          <div className="text-center my-1">
            <span className="px-2.5 py-1 bg-white/80 border border-slate-200 rounded-full text-[10px] text-slate-500 font-medium shadow-2xs">
              Simulasi slot-filling template dan intersepsi AI
            </span>
          </div>

          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[82%] p-3 rounded-2xl leading-relaxed shadow-xs ${
                  m.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                }`}
              >
                <div className="flex items-center gap-1 mb-1 opacity-60 text-[10px] font-bold">
                  {m.sender === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  <span>{m.sender === 'user' ? 'Calon Pembeli' : 'Bot Asisten'}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
              {m.state && (
                <span className="text-[9px] font-mono text-slate-400 mt-0.5 px-1">
                  state: {m.state}
                </span>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 italic p-2 bg-white/80 rounded-xl max-w-[50%] border border-slate-200">
              <Sparkles className="w-3 h-3 text-blue-600 animate-spin" />
              <span>Bot sedang mengetik...</span>
            </div>
          )}
        </div>

        {/* Form Chat Input */}
        <form onSubmit={handleSend} className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Coba: 'kuras toren 500 liter berapa?'..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600 transition"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition cursor-pointer shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}