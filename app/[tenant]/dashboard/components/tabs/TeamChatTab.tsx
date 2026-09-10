'use client';

import React from 'react';
import {
  MessageSquare,
  Lock,
  Users,
  CheckCheck,
  Send,
  Plus,
} from 'lucide-react';

export interface ConversationMessage {
  id: number | string;
  sender: 'customer' | 'agent' | 'bot';
  text: string;
  time: string;
}

export interface ChatConversation {
  id: string;
  customerPhone: string;
  customerName?: string;
  lastMessage: string;
  time: string;
  status: 'online' | 'offline';
  messages: ConversationMessage[];
}

export interface TeamChatTabProps {
  conversations: ChatConversation[];
  activeConversation: ChatConversation | null;
  activeConversationId: string | null;
  setActiveConversationId: (id: string) => void;
  replyText: string;
  setReplyText: (val: string) => void;
  handleSendMessage: (e: React.FormEvent) => void;
  isProScale: boolean;
  isGrowthPlus: boolean;
  isGrowth: boolean;
  isTeamScale: boolean;
  isAdsPerformance: boolean;
  handleUpgradeTier: (tier: any) => void;
}

export default function TeamChatTab({
  conversations,
  activeConversation,
  activeConversationId,
  setActiveConversationId,
  replyText,
  setReplyText,
  handleSendMessage,
  isProScale,
  isGrowthPlus,
  isGrowth,
  isTeamScale,
  isAdsPerformance,
  handleUpgradeTier,
}: TeamChatTabProps) {
  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <span>BoonTrack Inbox Console (Live CS)</span>
            </h2>
            {isProScale ? (
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                PROSCALE UNLOCKED • 5+ SEATS
              </span>
            ) : isGrowthPlus ? (
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                GROWTH+ TRACKING • 2 SEATS
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" /> TIER GROWTH • MAKS 1 SEAT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola pesan masuk WhatsApp toko dan intervensi chat pelanggan secara real-time bersama tim CS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>BoonTrack Inbox Live Connected</span>
          </span>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[550px]">
        {/* Left column: Conversation list */}
        <div className="md:col-span-4 border-r border-slate-100 p-4 flex flex-col justify-between bg-slate-50/50">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 flex items-center justify-between">
              <span>Percakapan Aktif</span>
              <Users className="w-3.5 h-3.5" />
            </div>

            {conversations.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 border border-dashed border-slate-200 rounded-2xl bg-white/60">
                <MessageSquare className="w-5 h-5 text-slate-300" />
                <span>Tidak ada percakapan aktif</span>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = activeConversation?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveConversationId(c.id)}
                    className={`p-3.5 bg-white rounded-2xl border ${
                      isSelected
                        ? 'border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    } flex items-start gap-3 cursor-pointer transition`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                      {c.customerPhone.replace(/[^0-9]/g, '').slice(0, 2) || 'WA'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {c.customerName || `Customer ${c.customerPhone}`}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            c.status === 'online' ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {c.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {c.lastMessage}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-2xl text-[11px] space-y-2 shadow-xs mt-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">
                Kuota CS: {isTeamScale ? '1 / 5+ Kursi' : isAdsPerformance ? '1 / 2 Kursi' : '1 / 1 Kursi'}
              </span>
              <span className="font-bold text-blue-600">
                {isTeamScale ? 'Team Scale' : isAdsPerformance ? 'Ads Performance' : 'Solo'}
              </span>
            </div>

            {isGrowth ? (
              <button
                type="button"
                onClick={() => handleUpgradeTier('ads_performance')}
                className="w-full py-1.5 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Lock className="w-3 h-3 text-amber-600" />
                <span>Tambah CS Baru (Upgrade Ads Performance)</span>
              </button>
            ) : isAdsPerformance ? (
              <button
                type="button"
                onClick={() => handleUpgradeTier('team_scale')}
                className="w-full py-1.5 px-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3 h-3 text-blue-600" />
                <span>Tambah CS Baru (Maks 2)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => alert('Menambahkan kursi Agent CS baru ke tim Omnichannel...')}
                className="w-full py-1.5 px-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3 h-3 text-purple-600" />
                <span>Tambah CS Baru (Unlimited)</span>
              </button>
            )}
          </div>
        </div>

        {/* Right column: Chat detail */}
        {!activeConversation ? (
          <div className="md:col-span-8 p-8 md:p-12 flex flex-col items-center justify-center text-center bg-white min-h-[480px]">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 border border-blue-100 shadow-xs">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Belum Ada Percakapan Aktif</h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              Belum ada percakapan aktif untuk toko ini. Pesan masuk dari WhatsApp akan otomatis muncul di sini.
            </p>
            <div className="mt-5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>BoonTrack Inbox Siap Menerima Pesan Masuk</span>
            </div>
          </div>
        ) : (
          <div className="md:col-span-8 p-6 flex flex-col justify-between bg-white">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-xs font-black text-slate-900">
                    {activeConversation.customerName
                      ? `${activeConversation.customerName} (${activeConversation.customerPhone})`
                      : activeConversation.customerPhone}
                  </h3>
                  <p className="text-[10px] text-emerald-600 font-bold">
                    ● Terhubung ke AI Assistant & Live CS Agent
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-600">
                  Direct Session
                </span>
              </div>

              <div className="space-y-3 py-2 text-xs max-h-[350px] overflow-y-auto">
                {activeConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.sender === 'customer' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`p-3.5 rounded-2xl max-w-sm ${
                        msg.sender === 'customer'
                          ? 'bg-slate-100 text-slate-800 rounded-tl-xs'
                          : 'bg-blue-600 text-white rounded-tr-xs'
                      }`}
                    >
                      <p className="leading-relaxed">{msg.text}</p>
                      <div
                        className={`text-[9px] mt-1 flex items-center gap-1 ${
                          msg.sender === 'customer'
                            ? 'text-slate-400'
                            : 'text-blue-200 justify-end'
                        }`}
                      >
                        <span>{msg.time}</span>
                        {msg.sender !== 'customer' && <CheckCheck className="w-3 h-3" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSendMessage} className="pt-4 border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Ketik pesan live CS untuk membalas pembeli langsung..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
