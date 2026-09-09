'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RotateCcw, CheckCircle2, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

interface BotSimulatorModalProps {
  tenantSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}

export default function BotSimulatorModal({ tenantSlug, isOpen, onClose }: BotSimulatorModalProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [currentState, setCurrentState] = useState<string>('GREETING');
  const [stateHistory, setStateHistory] = useState<string[]>(['GREETING']);
  const [sessionId, setSessionId] = useState<string>(() => `sim-${Date.now()}`);
  const [loading, setLoading] = useState(false);
  const [collectedEntities, setCollectedEntities] = useState<Record<string, any>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ke bawah setiap chat bertambah
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Trigger pesan sapaan awal saat modal pertama dibuka
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      handleSendMessage('halo');
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || loading) return;

    if (!textToSend) {
      setMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          sender: 'user',
          text,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setInputMessage('');
    }

    setLoading(true);

    try {
      const res = await fetch('/api/chat/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantSlug,
          channel: 'WEBCHAT',
          session_id: sessionId,
          user_identifier: '081234567890',
          message: text,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const { reply, next_state, state_trace, entities } = json.data;

        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: 'bot',
            text: reply,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);

        setCurrentState(next_state);
        if (state_trace && Array.isArray(state_trace)) {
          setStateHistory((prev) => [...prev, ...state_trace.filter((s) => !prev.includes(s) || s === 'SIDE_QUESTION')]);
        }
        if (entities) {
          setCollectedEntities(entities);
        }
      }
    } catch (err) {
      console.error('Error invoking engine simulator:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSession = () => {
    const newId = `sim-${Date.now()}`;
    setSessionId(newId);
    setMessages([]);
    setCurrentState('GREETING');
    setStateHistory(['GREETING']);
    setCollectedEntities({});
    setTimeout(() => {
      handleSendMessage('halo');
    }, 150);
  };

  // Parser sederhana WhatsApp format (*bold* ke strong HTML)
  const renderWaText = (txt: string) => {
    const boldFormatted = txt.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    return <span dangerouslySetInnerHTML={{ __html: boldFormatted.replace(/\n/g, '<br/>') }} />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl h-[620px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        
        {/* PANEL KIRI: SIMULATOR WHATSAPP */}
        <div className="flex-1 flex flex-col bg-slate-100/70 border-r border-slate-200">
          
          {/* Header Bar */}
          <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">Bot WhatsApp Simulator</h4>
                <p className="text-[10px] text-emerald-600 font-bold">● Active Engine: LOCAL_SERVICE_V1</p>
              </div>
            </div>

            <button
              onClick={handleResetSession}
              title="Reset Percakapan"
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition flex items-center gap-1 text-[11px] font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* Message Bubbles Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/80'
                  }`}
                >
                  {renderWaText(m.text)}
                  <div
                    className={`text-[9px] mt-1 text-right font-medium ${
                      m.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2 rounded-tl-none flex items-center gap-1.5 text-slate-400 text-xs">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Questions & Input Box */}
          <div className="p-3 bg-white border-t border-slate-200 space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-[10px]">
              <button
                type="button"
                onClick={() => handleSendMessage('Toren saya 520 liter')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-medium whitespace-nowrap"
              >
                &ldquo;Toren saya 520 liter&rdquo;
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('Aman nggak buat air minum?')}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-amber-800 font-medium whitespace-nowrap"
              >
                &ldquo;Aman nggak buat air minum?&rdquo; (Side Question)
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('Ada garansi gak?')}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-amber-800 font-medium whitespace-nowrap"
              >
                &ldquo;Ada garansi gak?&rdquo;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ketik pesan balasan..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-slate-100 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white transition"
              />
              <button
                type="submit"
                disabled={loading || !inputMessage.trim()}
                className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* PANEL KANAN: STATE TRACE VISUAL & ENTITY INSPECTOR */}
        <div className="w-full md:w-80 p-5 bg-slate-900 text-white flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>State Router Trace</span>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white text-xs font-bold">
                ✕ Tutup
              </button>
            </div>

            {/* Visual State History */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Flow Step:</span>
              <div className="space-y-1.5">
                {stateHistory.map((st, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-mono border ${
                      st === 'SIDE_QUESTION'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                        : st === 'BOOKING_READY'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700'
                    }`}
                  >
                    <span>{st}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                ))}
              </div>
            </div>

            {/* Collected Entities Table */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Extracted Entities:</span>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-[11px] font-mono space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Capacity:</span>
                  <span className="text-emerald-400 font-bold">{collectedEntities.capacity ? `${collectedEntities.capacity} L` : 'null'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Price:</span>
                  <span className="text-emerald-400 font-bold">{collectedEntities.price ? `Rp ${collectedEntities.price.toLocaleString('id-ID')}` : 'null'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Address:</span>
                  <span className="text-slate-300 truncate max-w-[130px]">{collectedEntities.address || 'null'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${collectedEntities.status === 'BOOKING_READY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                    {collectedEntities.status || 'IN_PROGRESS'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-4 border-t border-slate-800">
            Otak engine sinkron 100% dengan endpoint <code>POST /api/chat/process-message</code>.
          </div>
        </div>

      </div>
    </div>
  );
}