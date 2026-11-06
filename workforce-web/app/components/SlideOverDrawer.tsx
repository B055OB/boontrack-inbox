'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface SlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'emerald' | 'amber' | 'rose' | 'blue' | 'slate';
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}

export default function SlideOverDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  badgeVariant = 'blue',
  children,
  footer,
  widthClass = 'max-w-md',
}: SlideOverDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const badgeStyles = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }[badgeVariant];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          className={`w-screen ${widthClass} bg-white border-l border-slate-200 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out`}
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 id="slide-over-title" className="text-lg font-bold text-slate-900">
                  {title}
                </h3>
                {badge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyles}`}>
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && <p className="text-xs text-slate-500 font-normal">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">{children}</div>

          {/* Optional Footer */}
          {footer && <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

