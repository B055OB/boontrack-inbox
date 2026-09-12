'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { sanitizeImageUrl } from '@/lib/image-utils';

interface ImageUploadProps {
  label?: string;
  value?: string;
  onChange: (url: string, metadata?: { width?: number; height?: number; file_size_kb?: number }) => void;
  className?: string;
  placeholder?: string;
  description?: string;
  tenantSlug?: string;
}

export async function optimizeImageToWebP(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.FileReader) {
      return resolve(file);
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
                const webpFile = new File([blob], cleanName, { type: 'image/webp' });
                resolve(webpFile);
              } else {
                resolve(file);
              }
            },
            'image/webp',
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export default function ImageUpload({
  label = 'Upload Foto',
  value = '',
  onChange,
  className = '',
  placeholder = 'Pilih gambar (JPG, PNG, WebP maks 5 MB)',
  description = 'Auto-convert ke WebP & resize max width 1200px',
  tenantSlug,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setImgError(false);
    if (value) {
      const sanitized = sanitizeImageUrl(value);
      if (sanitized && sanitized !== value) {
        onChange(sanitized);
      }
    }
  }, [value, onChange]);

  const getResolvedTenantSlug = (): string => {
    if (tenantSlug) return tenantSlug;
    if (typeof window !== 'undefined') {
      const segments = window.location.pathname.split('/').filter(Boolean);
      if (segments.length > 0 && !['dashboard', 'api', 'login', 'admin'].includes(segments[0])) {
        return segments[0];
      }
      const hostParts = window.location.hostname.split('.');
      if (hostParts.length > 2 && !['shop', 'www'].includes(hostParts[0])) {
        return hostParts[0];
      }
    }
    return 'sandbox';
  };

  const getApiBaseUrl = (): string => {
    if (typeof window !== 'undefined') {
      return '';
    }
    return (
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      'https://boontrack-core-production.up.railway.app'
    ).replace(/\/+$/, '');
  };

  const handleUploadFile = async (rawFile: File) => {
    setErrorMsg(null);

    if (!rawFile.type.startsWith('image/')) {
      setErrorMsg('File harus berupa gambar (JPG, PNG, WebP, dll.)');
      return;
    }

    if (rawFile.size > 5 * 1024 * 1024) {
      setErrorMsg(`Ukuran file melebihi 5 MB (${(rawFile.size / (1024 * 1024)).toFixed(2)} MB)`);
      return;
    }

    setIsUploading(true);

    try {
      const processedFile = await optimizeImageToWebP(rawFile);
      const activeTenant = getResolvedTenantSlug();

      const formData = new FormData();
      formData.append('file', processedFile, processedFile.name);
      formData.append('image', processedFile, processedFile.name);
      formData.append('tenant_slug', activeTenant);
      formData.append('tenant_id', activeTenant);
      formData.append('folder', 'products');

      let authToken: string | null = null;
      if (typeof window !== 'undefined') {
        authToken =
          localStorage.getItem('sb-access-token') ||
          localStorage.getItem('merchant_token') ||
          localStorage.getItem('token') ||
          null;
      }

      const headers: Record<string, string> = {
        'X-Tenant-Slug': activeTenant,
        'X-Tenant-ID': activeTenant,
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Selalu tembak langsung internal Next.js API route: POST /api/v1/upload (Direct ke R2)
      const res = await fetch('/api/v1/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        let serverError = `Upload gagal (${res.status})`;
        try {
          const resText = await res.text();
          const errJson = JSON.parse(resText);
          if (typeof errJson.detail === 'string') {
            serverError = errJson.detail;
          } else if (Array.isArray(errJson.detail)) {
            serverError = errJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
          } else if (errJson.message) {
            serverError = errJson.message;
          }
        } catch {}
        throw new Error(serverError);
      }

      const data = await res.json();
      const rawFinalUrl =
        data?.public_url ||
        data?.r2_url ||
        data?.url ||
        data?.image_url ||
        data?.file_url ||
        (typeof data === 'string' ? data : '');
      const finalUrl = sanitizeImageUrl(rawFinalUrl);

      if (finalUrl) {
        onChange(finalUrl, {
          width: data?.width,
          height: data?.height,
          file_size_kb: data?.file_size_kb || Math.round(processedFile.size / 1024),
        });
      } else {
        throw new Error('Server tidak mengembalikan URL gambar yang valid.');
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {value ? (
        (() => {
          const safeValue = sanitizeImageUrl(value);
          return (
            <div className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center p-2.5 gap-3 shadow-xs">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 flex items-center justify-center">
                {!imgError && safeValue ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeValue}
                    alt="Preview"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-400 p-1">
                    <ImageIcon className="w-5 h-5 text-slate-400 mb-0.5" />
                    <span className="text-[8px] font-bold text-slate-400 leading-none text-center">Gagal Muat</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {!imgError ? (
                  <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Gambar Siap (WebP)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-600 font-bold text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Gambar Tidak Dapat Dimuat</span>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 font-mono truncate">{safeValue || value}</p>
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
          );
        })()
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
              <span className="text-xs font-bold text-slate-700">Mengunggah &amp; Mengonversi ke WebP...</span>
              <span className="text-[10px] text-slate-400">Sedang auto-resize 1200px &amp; optimasi</span>
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