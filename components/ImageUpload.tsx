'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';

interface ImageUploadProps {
  label?: string;
  value?: string;
  onChange: (url: string, metadata?: { width?: number; height?: number; file_size_kb?: number }) => void;
  className?: string;
  placeholder?: string;
  description?: string;
}

export default function ImageUpload({
  label = "Upload Foto",
  value = "",
  onChange,
  className = "",
  placeholder = "Pilih gambar (JPG, PNG, WebP maks 5 MB)",
  description = "Auto-convert ke WebP & resize max width 1200px"
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const coreApiUrl =
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://boontrack-core-production.up.railway.app';

  const handleUploadFile = async (file: File) => {
    setErrorMsg(null);

    // Client-side MIME validation
    if (!file.type.startsWith('image/')) {
      setErrorMsg('File harus berupa gambar (JPG, PNG, WebP, dll.)');
      return;
    }

    // Client-side Size validation (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(`Ukuran file melebihi 5 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const endpoint = `${coreApiUrl.replace(/\/+$/, '')}/api/v1/media/upload`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload gagal (${res.status})`);
      }

      const data = await res.json();
      if (data && data.url) {
        onChange(data.url, {
          width: data.width,
          height: data.height,
          file_size_kb: data.file_size_kb,
        });
      } else {
        throw new Error('Response upload tidak memiliki URL gambar');
      }
    } catch (err: any) {
      console.error('Error uploading image:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat mengunggah gambar');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    setErrorMsg(null);
    onChange('');
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 block">{label}</label>
          {description && (
            <span className="text-[10px] text-slate-400 font-medium">{description}</span>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {value ? (
        <div className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center p-2.5 gap-3 shadow-xs">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Gambar Siap (WebP)</span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono truncate">{value}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              Ganti
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition cursor-pointer"
              title="Hapus gambar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
            dragActive
              ? 'border-blue-500 bg-blue-50/60'
              : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70 hover:border-slate-300'
          } ${isUploading ? 'opacity-70 pointer-events-none' : ''}`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-1.5 py-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs font-bold text-slate-700">Mengunggah & Mengonversi ke WebP...</span>
              <span className="text-[10px] text-slate-400">Sedang auto-resize & kompresi</span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">{placeholder}</p>
                <p className="text-[11px] text-slate-400">Klik untuk jelajahi atau seret file gambar ke sini</p>
              </div>
            </>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-1.5 text-rose-500 text-[11px] font-medium pt-0.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
