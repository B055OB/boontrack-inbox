'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Zap,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Info,
  RefreshCw,
} from 'lucide-react';
import { QuickReplyItem } from '@/lib/inbox/quick-replies';

interface QuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  tenantId?: string;
  quickReplies: QuickReplyItem[];
  onQuickRepliesChange: (items: QuickReplyItem[]) => void;
}

export default function QuickRepliesModal({
  isOpen,
  onClose,
  tenantSlug,
  tenantId,
  quickReplies,
  onQuickRepliesChange,
}: QuickRepliesModalProps) {
  const [editingItem, setEditingItem] = useState<QuickReplyItem | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formShortcut, setFormShortcut] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setEditingItem(null);
    setFormShortcut('/');
    setFormTitle('');
    setFormContent('');
    setErrorMsg(null);
    setIsAddingNew(true);
  };

  const handleStartEdit = (item: QuickReplyItem) => {
    setIsAddingNew(false);
    setEditingItem(item);
    setFormShortcut(item.shortcut);
    setFormTitle(item.title);
    setFormContent(item.content);
    setErrorMsg(null);
  };

  const handleCancelForm = () => {
    setIsAddingNew(false);
    setEditingItem(null);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formShortcut.trim() || !formTitle.trim() || !formContent.trim()) {
      setErrorMsg('Semua kolom (Shortcut, Judul, dan Teks Balasan) wajib diisi.');
      return;
    }

    let cleanShortcut = formShortcut.trim().toLowerCase();
    if (!cleanShortcut.startsWith('/')) cleanShortcut = `/${cleanShortcut}`;
    cleanShortcut = cleanShortcut.replace(/[^\/a-z0-9_-]/g, '');

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (editingItem && editingItem.id) {
        // Edit existing
        const res = await fetch('/api/inbox/quick-replies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingItem.id,
            shortcut: cleanShortcut,
            title: formTitle.trim(),
            content: formContent.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Gagal menyimpan template');
        }

        const updated = quickReplies.map((q) => (q.id === editingItem.id ? data.quick_reply : q));
        onQuickRepliesChange(updated);
        setSuccessMsg(`✅ Shortcut "${cleanShortcut}" berhasil diperbarui!`);
      } else {
        // Add new
        const res = await fetch('/api/inbox/quick-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: tenantId || tenantSlug,
            shortcut: cleanShortcut,
            title: formTitle.trim(),
            content: formContent.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Gagal menambahkan shortcut baru');
        }

        const updated = [...quickReplies, data.quick_reply];
        onQuickRepliesChange(updated);
        setSuccessMsg(`✅ Shortcut "${cleanShortcut}" berhasil ditambahkan!`);
      }

      setIsAddingNew(false);
      setEditingItem(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: QuickReplyItem) => {
    if (!item.id) return;
    if (!confirm(`Yakin ingin menghapus shortcut "${item.shortcut}"?`)) return;

    try {
      const res = await fetch(`/api/inbox/quick-replies?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menghapus');
      }

      const updated = quickReplies.filter((q) => q.id !== item.id);
      onQuickRepliesChange(updated);
      setSuccessMsg(`🗑️ Shortcut "${item.shortcut}" telah dihapus.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-700 flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 fill-amber-500 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Pengaturan Quick Reply (Canned Responses)</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Trigger Slash `/`
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ketik <code className="bg-slate-200/80 px-1 py-0.2 rounded text-slate-800 font-mono font-bold">/</code> di kotak pesan chat untuk memanggil template kilat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Edukasi Banner: Pembayaran & CAPI */}
        <div className="p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b border-indigo-100 text-slate-800 flex items-start gap-2.5 text-xs">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px] sm:text-xs">
            <strong className="text-indigo-950 font-bold">💡 Tips Transaksi &amp; Pelacakan Iklan:</strong>{' '}
            Untuk mengirim nomor rekening atau konfirmasi bayar, gunakan fitur{' '}
            <strong className="text-indigo-700 font-extrabold">&quot;Quick POS / Buat Tagihan&quot;</strong>{' '}
            di panel kanan agar event <span className="font-mono font-bold text-indigo-900">Purchase</span> otomatis tertembak ke Meta CAPI.
          </p>
        </div>

        {/* Feedback Messages */}
        {successMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body: List or Form */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isAddingNew || editingItem ? (
            /* Form Tambah / Edit */
            <form onSubmit={handleSave} className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black text-slate-900">
                  {isAddingNew ? '+ Tambah Shortcut Baru' : `Edit Shortcut ${editingItem?.shortcut}`}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Format diawali karakter /</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Shortcut (Pemicu Ketik)
                  </label>
                  <input
                    type="text"
                    value={formShortcut}
                    onChange={(e) => setFormShortcut(e.target.value)}
                    placeholder="/katalog, /jam, /ongkir"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-indigo-700 focus:outline-none focus:border-indigo-600 transition"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Hanya huruf kecil, angka, dan dash</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Judul Ringkas
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Contoh: Info Jam Kerja CS"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-600 transition"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Ditampilkan di menu autocomplete</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Isi Teks Balasan Panjang
                </label>
                <textarea
                  rows={5}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Ketik teks lengkap yang akan otomatis diisi saat shortcut dipilih..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-600 transition leading-relaxed"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>{isAddingNew ? 'Tambahkan Shortcut' : 'Simpan Perubahan'}</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Button Tambah */
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700">
                Daftar Template Aktif ({quickReplies.length})
              </span>
              <button
                type="button"
                onClick={handleStartAdd}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Shortcut Baru</span>
              </button>
            </div>
          )}

          {/* List Table / Card */}
          <div className="space-y-2.5">
            {quickReplies.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs rounded-2xl border border-dashed border-slate-200">
                Belum ada shortcut. Klik &quot;+ Tambah Shortcut Baru&quot; untuk membuat.
              </div>
            ) : (
              quickReplies.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 transition shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-black text-xs">
                        {item.shortcut}
                      </span>
                      <span className="font-extrabold text-xs text-slate-900 truncate">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                        title="Edit Shortcut"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Hapus Shortcut"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-24 overflow-y-auto">
                    {item.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Tekan <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">Esc</kbd> untuk menutup</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
