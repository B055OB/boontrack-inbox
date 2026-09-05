'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Check,
  RotateCcw,
  Zap,
  TrendingUp,
  Package,
  MapPin,
  Bot,
  CheckCircle2,
  AlertCircle,
  MessageSquare
} from 'lucide-react';

export interface ActionProposal {
  id: string;
  type: string;
  title: string;
  description: string;
  summary?: string;
  details?: Record<string, any>;
  status?: 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
  result_message?: string;
}

export interface QuickActionItem {
  label: string;
  action?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  action_proposal?: ActionProposal | null;
  quick_actions?: Array<string | QuickActionItem> | null;
}

interface BoonPilotWidgetProps {
  tenantSlug?: string | string[];
}

const STARTER_CHIPS = [
  {
    label: 'Bagaimana performa penjualan toko saya minggu ini?',
    icon: TrendingUp,
  },
  {
    label: 'Cek stok produk yang hampir habis',
    icon: Package,
  },
  {
    label: 'Bantu atur titik penjemputan gudang kurir',
    icon: MapPin,
  },
  {
    label: 'Jelaskan strategi bot WhatsApp & fitur otomasi',
    icon: MessageSquare,
  },
];

// Helper to parse bold, italics, and inline code
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold border border-indigo-200/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-bold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-slate-700">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

// Markdown Renderer supporting code blocks, bold, italics, and bullet/numbered lists
function MarkdownContent({ content }: { content: string }) {
  const blockRegex = /```([\s\S]*?)```/g;
  const blocks: Array<{ type: 'code' | 'text'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: content.substring(lastIndex, match.index) });
    }
    blocks.push({ type: 'code', content: match[1] });
    lastIndex = blockRegex.lastIndex;
  }
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.substring(lastIndex) });
  }

  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-800">
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <pre
              key={bIdx}
              className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs overflow-x-auto my-2 border border-slate-800"
            >
              <code>{block.content.trim()}</code>
            </pre>
          );
        }

        const lines = block.content.split('\n');
        return (
          <div key={bIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lIdx} className="h-1" />;
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                    <span>{parseInlineMarkdown(trimmed.slice(2))}</span>
                  </div>
                );
              }
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-[11px] font-bold text-blue-600 shrink-0 min-w-4">
                      {numMatch[1]}.
                    </span>
                    <span>{parseInlineMarkdown(numMatch[2])}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{parseInlineMarkdown(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function BoonPilotWidget({ tenantSlug }: BoonPilotWidgetProps) {
  const normalizedSlug = Array.isArray(tenantSlug)
    ? tenantSlug[0]
    : tenantSlug || 'onlineboost';

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  const storageKey = `boonpilot_history_${normalizedSlug}`;
  const sessionKey = `boonpilot_session_id_${normalizedSlug}`;

  // Default welcome message
  const initialWelcome: ChatMessage = {
    id: 'welcome-1',
    sender: 'assistant',
    text: `Halo! Saya **BoonPilot**, AI Copilot & Asisten Toko Anda. 🚀\n\nSaya siap membantu Anda memantau performa penjualan, memeriksa ketersediaan stok, konfigurasi kurir gudang, hingga mengelola otomasi WhatsApp toko Anda.`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    quick_actions: [
      'Bagaimana performa penjualan toko saya minggu ini?',
      'Cek stok produk yang hampir habis',
      'Bantu atur titik penjemputan gudang kurir',
      'Jelaskan strategi bot WhatsApp & fitur otomasi'
    ]
  };

  // Persistent session ID
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const existing = sessionStorage.getItem(sessionKey);
        if (existing) return existing;
        const newId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        sessionStorage.setItem(sessionKey, newId);
        return newId;
      } catch {
        // Ignore
      }
    }
    return `bp_${Date.now()}`;
  });

  // Lazy-initialize messages state directly from sessionStorage to prevent state overwrite on mount
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // Ignore parse error
      }
    }
    return [initialWelcome];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync to sessionStorage whenever messages change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // Ignore quota error
    }
  }, [messages, storageKey]);

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, scrollToBottom]);

  // Send message handler - guarantees previous messages are preserved
  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend || inputText).trim();
    if (!userText || loading) return;

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    // Calculate updated messages list snapshot without resetting state
    let historySnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      const next = [...prev, userMessage];
      historySnapshot = next;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch (err) {
        console.warn('[BoonPilot] sessionStorage write note:', err);
      }
      return next;
    });

    setInputText('');
    setLoading(true);

    // Format conversation_history including all previous messages + current user message
    const conversation_history = historySnapshot.map((m) => ({
      role: m.sender,
      content: m.text,
      timestamp: m.timestamp,
      action_proposal: m.action_proposal || undefined,
      quick_actions: m.quick_actions || undefined,
    }));

    try {
      const res = await fetch('/api/v1/boonpilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: normalizedSlug,
          session_id: sessionId,
          message: userText,
          conversation_history,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: ChatMessage = {
          id: `ast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sender: 'assistant',
          text: data.reply || 'Saya telah memproses permintaan Anda.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          action_proposal: data.action_proposal
            ? {
                ...data.action_proposal,
                status: 'pending',
              }
            : null,
          quick_actions: Array.isArray(data.quick_actions) ? data.quick_actions : null,
        };

        setMessages((prev) => {
          const next = [...prev, assistantMessage];
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      } else {
        const errMessage: ChatMessage = {
          id: `ast_${Date.now()}`,
          sender: 'assistant',
          text: 'Maaf, terjadi kendala saat menghubungkan ke asisten BoonPilot. Silakan coba sesaat lagi.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errMessage]);
      }
    } catch {
      const errMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: 'assistant',
        text: 'Maaf, jaringan sedang tidak stabil. Silakan periksa koneksi Anda.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Action Proposal Approval/Rejection
  const handleActionDecision = async (
    messageId: string,
    proposal: ActionProposal,
    approved: boolean
  ) => {
    setExecutingActionId(proposal.id);

    // Optimistically set executing status
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId && m.action_proposal) {
          return {
            ...m,
            action_proposal: {
              ...m.action_proposal,
              status: approved ? 'executing' : 'rejected',
            },
          };
        }
        return m;
      })
    );

    try {
      const res = await fetch('/api/v1/boonpilot/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: normalizedSlug,
          action_id: proposal.id,
          action_type: proposal.type,
          approved,
          details: proposal.details,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && m.action_proposal) {
              return {
                ...m,
                action_proposal: {
                  ...m.action_proposal,
                  status: approved ? 'executed' : 'rejected',
                  result_message: data.message,
                },
              };
            }
            return m;
          })
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && m.action_proposal) {
              return {
                ...m,
                action_proposal: {
                  ...m.action_proposal,
                  status: 'failed',
                  result_message: 'Gagal mengeksekusi aksi. Silakan ulangi.',
                },
              };
            }
            return m;
          })
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId && m.action_proposal) {
            return {
              ...m,
              action_proposal: {
                ...m.action_proposal,
                status: 'failed',
                result_message: 'Koneksi terputus saat mengeksekusi aksi.',
              },
            };
          }
          return m;
        })
      );
    } finally {
      setExecutingActionId(null);
    }
  };

  // Reset conversation - creates a fresh session
  const handleResetChat = () => {
    const newSessionId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setSessionId(newSessionId);
    setMessages([initialWelcome]);
    try {
      sessionStorage.setItem(sessionKey, newSessionId);
      sessionStorage.setItem(storageKey, JSON.stringify([initialWelcome]));
    } catch {
      // Ignore
    }
  };

  const hasUserMessages = messages.some((m) => m.sender === 'user');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* ── CHAT WINDOW ── */}
      {isOpen && (
        <div className="mb-3.5 w-[calc(100vw-32px)] sm:w-[420px] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 isolate">
          
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                {/* Green Online Indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900" />
                </span>
              </div>
              <div>
                <h3 className="font-black text-sm text-white tracking-tight flex items-center gap-1.5">
                  <span>BoonPilot</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    AI PRO
                  </span>
                </h3>
                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <span>Copilot &amp; Asisten Toko Anda • Online</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetChat}
                title="Mulai Sesi Baru"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Tutup BoonPilot"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-end gap-2 max-w-[90%]">
                  {m.sender === 'assistant' && (
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 shadow-xs text-[10px]">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 shadow-xs ${
                      m.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {m.sender === 'user' ? (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <MarkdownContent content={m.text} />
                    )}
                  </div>
                </div>

                {/* Interactive Action Approval Card */}
                {m.action_proposal && (
                  <div className="mt-2.5 ml-8 max-w-[85%] w-full bg-white border border-indigo-200 rounded-2xl p-3.5 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                          <Zap className="w-4 h-4" />
                        </span>
                        <h4 className="font-black text-xs text-indigo-950">
                          {m.action_proposal.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                        Proposal
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-800 leading-snug">
                      {m.action_proposal.description}
                    </div>

                    {m.action_proposal.details && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-[11px]">
                        {Object.entries(m.action_proposal.details).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span className="text-slate-500 font-medium">{k}:</span>
                            <span className="text-slate-900 font-bold truncate">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Execution Buttons / Status State */}
                    {m.action_proposal.status === 'pending' && (
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleActionDecision(m.id, m.action_proposal!, true)}
                          disabled={executingActionId === m.action_proposal.id}
                          className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          {executingActionId === m.action_proposal.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Mengeksekusi...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Eksekusi Sekarang</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleActionDecision(m.id, m.action_proposal!, false)}
                          disabled={executingActionId === m.action_proposal.id}
                          className="py-2 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          ✕ Batalkan
                        </button>
                      </div>
                    )}

                    {m.action_proposal.status === 'executing' && (
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Menerapkan perubahan ke sistem toko...</span>
                      </div>
                    )}

                    {m.action_proposal.status === 'executed' && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          {m.action_proposal.result_message || 'Aksi berhasil dieksekusi secara instan!'}
                        </span>
                      </div>
                    )}

                    {m.action_proposal.status === 'rejected' && (
                      <div className="p-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold flex items-center gap-2">
                        <X className="w-3.5 h-3.5 text-slate-400" />
                        <span>Aksi dibatalkan. Tidak ada perubahan data.</span>
                      </div>
                    )}

                    {m.action_proposal.status === 'failed' && (
                      <div className="p-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span>{m.action_proposal.result_message || 'Gagal mengeksekusi aksi.'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Action Chips from Assistant Response */}
                {m.sender === 'assistant' && m.quick_actions && m.quick_actions.length > 0 && (
                  <div className="mt-2.5 ml-8 flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1">
                    {m.quick_actions.map((item, aIdx) => {
                      const label = typeof item === 'string' ? item : item.label;
                      return (
                        <button
                          key={aIdx}
                          type="button"
                          disabled={loading}
                          onClick={() => handleSendMessage(label)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50/90 hover:bg-blue-100 text-blue-700 border border-blue-200/90 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-left"
                        >
                          <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex items-end gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 text-[10px]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>BoonPilot sedang menganalisis...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Starter Chips (Shown at start of session before user sends messages) */}
          {!hasUserMessages && (
            <div className="p-3 bg-slate-100/70 border-t border-slate-200/80 space-y-1.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block px-1">
                Saran Pertanyaan Cepat:
              </span>
              <div className="flex flex-col gap-1.5">
                {STARTER_CHIPS.map((chip, idx) => {
                  const Icon = chip.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={loading}
                      onClick={() => handleSendMessage(chip.label)}
                      className="w-full text-left p-2 rounded-xl bg-white hover:bg-blue-50/80 hover:text-blue-700 border border-slate-200/80 text-slate-700 text-xs font-semibold transition flex items-center gap-2 shadow-2xs group cursor-pointer disabled:opacity-50"
                    >
                      <span className="p-1 rounded-lg bg-slate-50 group-hover:bg-blue-100 text-slate-500 group-hover:text-blue-600 shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="truncate">{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ketik instruksi atau pertanyaan ke BoonPilot..."
              disabled={loading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || loading}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl transition cursor-pointer shadow-sm disabled:cursor-not-allowed"
              title="Kirim Pesan"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      )}

      {/* ── FLOATING TOGGLE BUBBLE ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex items-center gap-2.5 p-3 sm:px-4 sm:py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer isolate"
        aria-label="Toggle BoonPilot Copilot"
      >
        {/* Green Online Status Indicator */}
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
        </span>

        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        )}

        <div className="hidden sm:flex flex-col text-left pr-1">
          <span className="text-xs font-black tracking-tight leading-none text-white">
            BoonPilot
          </span>
          <span className="text-[10px] text-blue-100 font-semibold leading-none mt-0.5">
            Store Copilot
          </span>
        </div>
      </button>

    </div>
  );
}
