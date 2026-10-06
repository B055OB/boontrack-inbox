'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
  Phone,
  Mail,
  Tag as TagIcon,
  Plus,
  X,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Trash2,
  Send,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import { Contact, Tag, ContactNote, LifecycleStage, LIFECYCLE_STAGES } from '@/lib/crm/types';
import { ContactService } from '@/lib/crm/contact.service';
import { toE164, formatDisplayPhone } from '@/lib/crm/phone-utils';

export interface ContactSidebarProps {
  tenantId: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  authorId?: string;
  authorName?: string;
  className?: string;
  onLifecycleStageChange?: (newStage: LifecycleStage) => void;
}

export default function ContactSidebar({
  tenantId,
  customerPhone,
  customerName,
  customerEmail,
  authorId,
  authorName = 'CS Agent',
  className = '',
  onLifecycleStageChange,
}: ContactSidebarProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [tenantTags, setTenantTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canonicalPhone = useMemo(() => toE164(customerPhone), [customerPhone]);

  // Load Contact and Tenant Tags
  const loadContactData = useCallback(async () => {
    if (!tenantId || !canonicalPhone) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Get or create contact record
      const c = await ContactService.getOrCreateContactByPhone(
        tenantId,
        canonicalPhone,
        customerName
      );

      // 2. Fetch full details (tags + notes)
      const full = await ContactService.getContactWithDetails(tenantId, c.id);
      setContact(full || c);

      // 3. Fetch all tenant tags for autocomplete
      const tags = await ContactService.getTenantTags(tenantId);
      setTenantTags(tags);
    } catch (err: any) {
      console.error('[ContactSidebar] Error loading contact:', err);
      setErrorMsg(err?.message || 'Gagal memuat profil kontak');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, canonicalPhone, customerName]);

  useEffect(() => {
    loadContactData();
  }, [loadContactData]);

  // Handle Lifecycle Stage Change
  const handleStageSelect = async (newStage: LifecycleStage) => {
    if (!contact || contact.lifecycle_stage === newStage || isUpdatingStage) return;
    setIsUpdatingStage(true);
    try {
      const updated = await ContactService.updateLifecycleStage(contact.id, newStage);
      setContact((prev) => (prev ? { ...prev, lifecycle_stage: updated.lifecycle_stage } : prev));
      if (onLifecycleStageChange) {
        onLifecycleStageChange(newStage);
      }
    } catch (err: any) {
      console.error('[ContactSidebar] Failed to update stage:', err);
      alert('Gagal memperbarui status tahapan pelanggan.');
    } finally {
      setIsUpdatingStage(false);
    }
  };

  // Handle Add Tag
  const handleAddTag = async (tagName: string) => {
    if (!contact || !tagName.trim()) return;
    setIsAddingTag(true);
    const cleanName = tagName.trim();

    try {
      // Create tag if not existing
      const tag = await ContactService.createTag(tenantId, cleanName, '#4F46E5');

      // Associate with contact
      await ContactService.addTagToContact(contact.id, tag.id);

      // Refresh contact details
      const updated = await ContactService.getContactWithDetails(tenantId, contact.id);
      if (updated) {
        setContact(updated);
      }

      // Update tenant tag list
      setTenantTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      setNewTagInput('');
    } catch (err: any) {
      console.error('[ContactSidebar] Failed to add tag:', err);
      alert('Gagal menambahkan tag ke kontak.');
    } finally {
      setIsAddingTag(false);
    }
  };

  // Handle Remove Tag
  const handleRemoveTag = async (tagId: string) => {
    if (!contact) return;
    try {
      await ContactService.removeTagFromContact(contact.id, tagId);
      setContact((prev) =>
        prev
          ? {
              ...prev,
              tags: (prev.tags || []).filter((t) => t.id !== tagId),
            }
          : prev
      );
    } catch (err: any) {
      console.error('[ContactSidebar] Failed to remove tag:', err);
    }
  };

  // Handle Add Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !newNoteBody.trim() || isSubmittingNote) return;
    setIsSubmittingNote(true);

    try {
      const note = await ContactService.addContactNote(
        contact.id,
        tenantId,
        newNoteBody.trim(),
        authorId,
        authorName
      );

      setContact((prev) =>
        prev
          ? {
              ...prev,
              notes: [note, ...(prev.notes || [])],
            }
          : prev
      );
      setNewNoteBody('');
    } catch (err: any) {
      console.error('[ContactSidebar] Failed to add note:', err);
      alert('Gagal menyimpan catatan internal.');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Handle Delete Note
  const handleDeleteNote = async (noteId: string) => {
    if (!contact) return;
    try {
      await ContactService.deleteContactNote(noteId);
      setContact((prev) =>
        prev
          ? {
              ...prev,
              notes: (prev.notes || []).filter((n) => n.id !== noteId),
            }
          : prev
      );
    } catch (err: any) {
      console.error('[ContactSidebar] Failed to delete note:', err);
    }
  };

  // Copy Phone Number
  const copyPhone = () => {
    if (!canonicalPhone) return;
    navigator.clipboard.writeText(canonicalPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentStageInfo = LIFECYCLE_STAGES.find((s) => s.stage === contact?.lifecycle_stage) || LIFECYCLE_STAGES[0];

  return (
    <div className={`flex flex-col bg-white border-l border-slate-200 h-full overflow-y-auto text-xs ${className}`}>
      {/* 1. Header Bar */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-1.5 font-black text-slate-900">
          <User className="w-4 h-4 text-indigo-600" />
          <span>Customer Memory (CRM)</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" /> V1 Engine
        </span>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200" />
            <div className="space-y-2 flex-1">
              <div className="h-3.5 bg-slate-200 rounded-md w-3/4" />
              <div className="h-2.5 bg-slate-200 rounded-md w-1/2" />
            </div>
          </div>
          <div className="h-10 bg-slate-100 rounded-xl" />
          <div className="h-24 bg-slate-100 rounded-xl" />
        </div>
      ) : errorMsg ? (
        <div className="p-4 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="text-xs text-slate-600 font-medium">{errorMsg}</p>
          <button
            type="button"
            onClick={loadContactData}
            className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-lg text-[11px]"
          >
            Coba Lagi
          </button>
        </div>
      ) : !contact ? (
        <div className="p-6 text-center text-slate-400">Pilih obrolan untuk melihat CRM pelanggan.</div>
      ) : (
        <div className="p-3.5 space-y-4 flex-1">
          {/* 2. Profile Card */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                {(contact.name || customerName || 'P').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-slate-900 text-sm truncate">
                  {contact.name || customerName || 'Pelanggan'}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-slate-600 text-[11px]">
                    {formatDisplayPhone(contact.phone_e164)}
                  </span>
                  <button
                    type="button"
                    onClick={copyPhone}
                    title="Salin nomor"
                    className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                {contact.email && (
                  <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{contact.email}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
              <a
                href={`https://wa.me/${contact.phone_e164.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition"
              >
                <Phone className="w-3 h-3 text-emerald-600" />
                <span>Buka WhatsApp</span>
                <ExternalLink className="w-2.5 h-2.5 ml-0.5 text-emerald-600" />
              </a>
              <div className="py-1.5 px-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-[10px] font-bold flex items-center justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-700 font-extrabold uppercase">{contact.contact_status}</span>
              </div>
            </div>
          </div>

          {/* 3. Lifecycle Stage Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Tahapan Lifecycle
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${currentStageInfo.badgeClass}`}>
                {currentStageInfo.label}
              </span>
            </div>

            {/* Interactive Pills */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
              {LIFECYCLE_STAGES.map((s) => {
                const isSelected = contact.lifecycle_stage === s.stage;
                return (
                  <button
                    key={s.stage}
                    type="button"
                    disabled={isUpdatingStage}
                    onClick={() => handleStageSelect(s.stage)}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200 font-black'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span>{s.label}</span>
                    {isSelected && <CheckCircle2 className="w-3 h-3 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Tags Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide flex items-center gap-1">
                <TagIcon className="w-3.5 h-3.5 text-indigo-600" /> Tag Relasional
              </span>
              <span className="text-[10px] text-slate-400 font-bold">
                {contact.tags?.length || 0} Terpasang
              </span>
            </div>

            {/* Tag Badges */}
            <div className="flex flex-wrap gap-1.5 min-h-[30px] p-2 bg-slate-50 border border-slate-200/80 rounded-xl">
              {contact.tags && contact.tags.length > 0 ? (
                contact.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 text-[10px] font-bold shadow-2xs"
                  >
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.id)}
                      className="text-slate-400 hover:text-rose-600 transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-slate-400 italic">Belum ada tag untuk kontak ini.</span>
              )}
            </div>

            {/* Quick Add Tag */}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(newTagInput);
                  }
                }}
                placeholder="Tambah tag baru (e.g. VIP, GTM, Diet)..."
                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600"
              />
              <button
                type="button"
                disabled={!newTagInput.trim() || isAddingTag}
                onClick={() => handleAddTag(newTagInput)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[11px] rounded-xl flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>

            {/* Autocomplete / Suggested Tags */}
            {tenantTags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tenantTags
                  .filter((t) => !(contact.tags || []).some((ct) => ct.id === t.id))
                  .slice(0, 5)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleAddTag(t.name)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded-md text-[9px] font-bold border border-slate-200 transition"
                    >
                      + {t.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* 5. Internal Notes */}
          <div className="space-y-2 pt-2 border-t border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-indigo-600" /> Catatan Internal CS
              </span>
              <span className="text-[10px] text-slate-400 font-bold">
                {contact.notes?.length || 0} Catatan
              </span>
            </div>

            {/* Note Input */}
            <form onSubmit={handleAddNote} className="space-y-1.5">
              <textarea
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
                placeholder="Tulis catatan medis/preferensi (hanya terlihat oleh tim CS)..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newNoteBody.trim() || isSubmittingNote}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[11px] rounded-xl flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                >
                  <Send className="w-3 h-3" />
                  <span>Simpan Catatan</span>
                </button>
              </div>
            </form>

            {/* Note List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pt-1">
              {contact.notes && contact.notes.length > 0 ? (
                contact.notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] space-y-1 relative group hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-slate-700">{note.author_name || 'CS Agent'}</span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{new Date(note.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          title="Hapus catatan"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {note.body}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-slate-400 text-[10px] bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  Belum ada catatan internal untuk kontak ini.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
