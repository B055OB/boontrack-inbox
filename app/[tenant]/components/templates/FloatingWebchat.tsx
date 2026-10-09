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
  HeartHandshake,
  ShieldCheck,
  Phone,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { StoreChatMessage, Product, getStoreChatGreeting } from '@/app/[tenant]/page';
import { getIndustryQuickReplies } from '@/lib/zero-ai-engine';
import { toE164 } from '@/lib/crm/phone-utils';

interface FloatingWebchatProps {
  tenantSlug: string;
  storeName: string;
  displayName: string;
  category?: string;
  chatCtaLabel?: string;
  dynamicQuickReplies?: string[];
  initialTopic?: string | null;
  onInitiateCheckout?: (product: { id: string; title: string; price: number }) => void;
  onAddToCart?: (product: Product) => void;
}

const DEFAULT_INTENT_OPTIONS = [
  '💬 Tanya Informasi Layanan',
  '💰 Cek Harga & Paket',
  '📅 Jadwal & Pemesanan',
  '👤 Hubungi Tim Admin',
];

export default function FloatingWebchat({
  tenantSlug,
  storeName,
  displayName,
  category,
  chatCtaLabel,
  dynamicQuickReplies = [],
  initialTopic,
  onInitiateCheckout,
  onAddToCart,
}: FloatingWebchatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeName = storeName || displayName.toUpperCase();
  const effectiveQuickReplies =
    Array.isArray(dynamicQuickReplies) && dynamicQuickReplies.length > 0
      ? dynamicQuickReplies
      : getIndustryQuickReplies(category);

  const availableIntents = React.useMemo(() => {
    const base =
      Array.isArray(dynamicQuickReplies) && dynamicQuickReplies.length > 0
        ? dynamicQuickReplies.slice(0, 4)
        : (effectiveQuickReplies && effectiveQuickReplies.length > 0
          ? effectiveQuickReplies.slice(0, 4)
          : DEFAULT_INTENT_OPTIONS);
    if (initialTopic && !base.some((b) => b.includes(initialTopic))) {
      return [`📌 ${initialTopic}`, ...base.slice(0, 3)];
    }
    return base;
  }, [dynamicQuickReplies, effectiveQuickReplies, initialTopic]);

  // Lead Capture State
  const [isLeadCaptured, setIsLeadCaptured] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [selectedIntent, setSelectedIntent] = useState(() => availableIntents[0] || DEFAULT_INTENT_OPTIONS[0]);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  // Check saved lead from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`boontrack_webchat_lead_${tenantSlug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name && parsed.phone) {
          setParentName(parsed.name);
          setParentPhone(parsed.phone);
          setIsLeadCaptured(true);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [tenantSlug]);

  // If initialTopic is passed from visual grid or external CTA, open chat
  useEffect(() => {
    if (initialTopic) {
      setIsOpen(true);
      setSelectedIntent(`📌 Topik: ${initialTopic}`);
      if (isLeadCaptured) {
        sendChatMessage(`Saya ingin bertanya tentang topik: ${initialTopic}`);
      }
    }
  }, [initialTopic, isLeadCaptured]);

  // Initial Bot Greeting
  useEffect(() => {
    if (!isLeadCaptured) return;

    setMessages((prev) => {
      if (prev.length === 0) {
        const greetingBase = getStoreChatGreeting(category || '', activeName);
        const greetingText = parentName
          ? `Halo ${parentName}! 👋\n\n${greetingBase}\n\nSilakan tanyakan kebutuhan Anda atau pilih opsi cepat di bawah:`
          : `${greetingBase}\n\nSilakan tanyakan kebutuhan Anda atau pilih opsi cepat di bawah:`;
        return [
          {
            id: 'init-floating-1',
            sender: 'bot',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: greetingText,
            type: 'TEXT',
            quick_actions: effectiveQuickReplies,
          },
        ];
      }
      return prev;
    });
  }, [isLeadCaptured, activeName, parentName, effectiveQuickReplies, category]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isBotTyping, isOpen, isLeadCaptured]);

  // Handle Lead Form Submission
  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadError(null);

    if (!parentName.trim()) {
      setLeadError('Nama Orang Tua / Ayah / Bunda wajib diisi.');
      return;
    }

    if (!parentPhone.trim()) {
      setLeadError('Nomor WhatsApp wajib diisi.');
      return;
    }

    const canonical = toE164(parentPhone.trim());
    if (!canonical) {
      setLeadError('Format nomor WhatsApp tidak valid. Gunakan format e.g. 08123456789.');
      return;
    }

    setIsSubmittingLead(true);
    try {
      // 1. Submit lead to CRM API endpoint
      const res = await fetch('/api/v1/crm/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          name: parentName.trim(),
          phone: canonical,
          intent: selectedIntent,
          notes: `Lead Webchat Storefront: Kebutuhan awal "${selectedIntent}"`,
        }),
      });

      // Save to localStorage
      try {
        localStorage.setItem(
          `boontrack_webchat_lead_${tenantSlug}`,
          JSON.stringify({ name: parentName.trim(), phone: canonical })
        );
      } catch {}

      setIsLeadCaptured(true);

      // Add user intent message and bot response
      const firstUserMsg: StoreChatMessage = {
        id: `user-init-${Date.now()}`,
        sender: 'user',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Halo, saya ${parentName.trim()}. Saya ingin bertanya seputar: ${selectedIntent}`,
        type: 'TEXT',
      };

      const isClinic = String(category || '').toUpperCase().includes('KLINIK');
      const botResponseText = isClinic
        ? `Halo Bapak/Ibu ${parentName.trim()}! 🙏 Terima kasih telah menghubungi ${activeName}.\n\nKami telah mencatat ketertarikan Anda pada "${selectedIntent}". Tim kami siap menjawab pertanyaan seputar jadwal, alur konsultasi, atau biaya paket layanan.\n\nAda pertanyaan atau keluhan spesifik yang ingin dikonsultasikan saat ini?`
        : `Halo ${parentName.trim()}! 🙏 Terima kasih telah menghubungi ${activeName}.\n\nKami telah mencatat ketertarikan Anda pada "${selectedIntent}". Tim kami siap menjawab pertanyaan seputar katalog, jadwal layanan, estimasi pengerjaan, atau biaya.\n\nAda yang bisa kami bantu seputar kebutuhan Anda hari ini?`;

      setMessages([
        firstUserMsg,
        {
          id: `bot-init-${Date.now() + 1}`,
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: botResponseText,
          type: 'TEXT',
          quick_actions: effectiveQuickReplies,
        },
      ]);
    } catch (err: any) {
      console.warn('[FloatingWebchat] Lead submission note:', err);
      // Still allow chat even if CRM API has network error
      setIsLeadCaptured(true);
    } finally {
      setIsSubmittingLead(false);
    }
  };

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
        text:
          data.reply ||
          data.response ||
          'Terima kasih atas pesannya. Tim medis & CS kami siap membantu kebutuhan si kecil.',
        action: data.action,
        type: data.type || 'TEXT',
        product: data.product,
        quick_actions: data.quick_actions || effectiveQuickReplies,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Halo Ayah/Bunda! Layanan ${activeName} siap mendampingi. Silakan pilih opsi di bawah atau hubungi WhatsApp pendaftaran langsung jika memerlukan jadwal segera.`,
          type: 'TEXT',
          quick_actions: effectiveQuickReplies,
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
    <div className="fixed bottom-5 right-4 sm:right-6 z-40 flex flex-col items-end">
      {/* Floating Chat Modal Box */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100dvh-6rem)] bg-white rounded-3xl border border-slate-200/90 shadow-2xl flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-3 duration-200 transition-all">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between shadow-xs shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-black tracking-tight truncate">{activeName}</h4>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                </div>
                <p className="text-[10px] text-purple-200 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-300" />
                  <span>Konsultasi &amp; Asisten Resmi 24 Jam</span>
                </p>
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

          {/* VIEW 1: Sapaan Awal & Lead Capture Form (Patient / Customer Intake) */}
          {!isLeadCaptured ? (
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-gradient-to-b from-purple-50/40 via-white to-slate-50 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="p-3.5 bg-white rounded-2xl border border-purple-100 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Selamat Datang di {activeName} 👋</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Sebelum memulai percakapan, mohon isi data singkat Anda agar tim kami dapat memberikan respon dan bantuan yang tepat.
                  </p>
                </div>

                <form onSubmit={handleLeadSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Lengkap *
                    </label>
                    <input
                      type="text"
                      required
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nomor WhatsApp Aktif *
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={parentPhone}
                        onChange={(e) => setParentPhone(e.target.value)}
                        placeholder="Contoh: 081234567890"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-500/20 transition"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Untuk pengiriman resume konsultasi dan konfirmasi jadwal.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                      Kebutuhan / Topik Utama
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {availableIntents.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedIntent(opt)}
                          className={`px-3 py-2 rounded-xl text-left text-xs font-semibold border transition cursor-pointer flex items-center justify-between ${
                            selectedIntent === opt
                              ? 'bg-purple-50 text-purple-900 border-purple-300 ring-1 ring-purple-400/20'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span>{opt}</span>
                          {selectedIntent === opt && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {leadError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-700 font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{leadError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingLead}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md shadow-purple-600/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <span>{isSubmittingLead ? 'Menghubungkan...' : 'Mulai Chat Konsultasi →'}</span>
                  </button>
                </form>
              </div>

              <div className="pt-2 text-center text-[10px] text-slate-400">
                🔒 Data Ayah &amp; Bunda aman dan terlindungi privasinya.
              </div>
            </div>
          ) : (
            /* VIEW 2: Interactive Chat Messages Area */
            <>
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
                        <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                        {/* Rekomendasi Produk / Layanan */}
                        {msg.sender === 'bot' && msg.product && (
                          <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 space-y-2">
                            <div className="flex items-center gap-2.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
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

                            {onInitiateCheckout && (
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
                                className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                              >
                                <QrCode className="w-3 h-3" />
                                <span>Pesan Langsung</span>
                              </button>
                            )}
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
                              className="text-[10px] font-semibold bg-white hover:bg-purple-50 hover:text-purple-700 text-slate-700 border border-slate-200 hover:border-purple-300 px-2.5 py-1 rounded-full transition active:scale-95 shadow-2xs cursor-pointer"
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

              {/* Chat Input Bar */}
              <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ketik pertanyaan atau respon..."
                  disabled={isBotTyping}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-purple-600 outline-hidden transition"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isBotTyping}
                  className="w-8 h-8 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Floating Trigger Button */}
      {(() => {
        const triggerLabel =
          chatCtaLabel ||
          (String(category || '').toUpperCase().includes('KLINIK')
            ? 'Konsultasi Layanan'
            : 'Tanya Layanan');
        return (
          <button
            type="button"
            id="btn-floating-webchat"
            onClick={() => setIsOpen(!isOpen)}
            className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full shadow-xl shadow-purple-600/30 transition-all duration-300 active:scale-95 cursor-pointer whitespace-nowrap shrink-0 border border-white/20 select-none"
            aria-label={triggerLabel}
          >
            <span className="relative flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-purple-600 animate-pulse" />
            </span>
            <span className="font-bold text-xs tracking-tight whitespace-nowrap">{triggerLabel}</span>
          </button>
        );
      })()}
    </div>
  );
}
