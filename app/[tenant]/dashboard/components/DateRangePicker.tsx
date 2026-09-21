'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, X } from 'lucide-react';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'all'
  | 'custom';

export interface DateRangeState {
  preset: DateRangePreset;
  startDate: string; // ISO string e.g. 2026-09-21T00:00:00.000Z or empty
  endDate: string;   // ISO string e.g. 2026-09-21T23:59:59.999Z or empty
  label: string;
}

export function getDateRangeFromPreset(
  preset: DateRangePreset,
  customStart = '',
  customEnd = ''
): DateRangeState {
  const now = new Date();

  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { preset, startDate: start.toISOString(), endDate: end.toISOString(), label: 'Hari Ini' };
  }

  if (preset === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { preset, startDate: start.toISOString(), endDate: end.toISOString(), label: 'Kemarin' };
  }

  if (preset === '7d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { preset, startDate: start.toISOString(), endDate: end.toISOString(), label: '7 Hari Terakhir' };
  }

  if (preset === '30d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { preset, startDate: start.toISOString(), endDate: end.toISOString(), label: '30 Hari Terakhir' };
  }

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { preset, startDate: start.toISOString(), endDate: end.toISOString(), label: 'Bulan Ini' };
  }

  if (preset === 'custom' && customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00`);
    const end = new Date(`${customEnd}T23:59:59.999`);
    return {
      preset,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: `${customStart} s/d ${customEnd}`,
    };
  }

  return { preset: 'all', startDate: '', endDate: '', label: 'Semua Waktu' };
}

interface DateRangePickerProps {
  value: DateRangeState;
  onChange: (val: DateRangeState) => void;
  className?: string;
}

export default function DateRangePicker({
  value,
  onChange,
  className = '',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState(() => {
    if (value.startDate) return value.startDate.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => {
    if (value.endDate) return value.endDate.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const presets: { id: DateRangePreset; label: string }[] = [
    { id: 'today', label: 'Hari Ini' },
    { id: 'yesterday', label: 'Kemarin' },
    { id: '7d', label: '7 Hari Terakhir' },
    { id: '30d', label: '30 Hari Terakhir' },
    { id: 'this_month', label: 'Bulan Ini' },
    { id: 'all', label: 'Semua Waktu' },
  ];

  const handleSelectPreset = (preset: DateRangePreset) => {
    const nextState = getDateRangeFromPreset(preset);
    onChange(nextState);
    setIsOpen(false);
  };

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) return;
    const nextState = getDateRangeFromPreset('custom', customStart, customEnd);
    onChange(nextState);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
        aria-label="Pilih rentang tanggal"
      >
        <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span className="truncate max-w-[170px]">{value.label || 'Pilih Tanggal'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 sm:w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-black text-slate-900">Rentang Waktu</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => {
              const isSelected = value.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                  }`}
                >
                  <span className="truncate">{p.label}</span>
                  {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>

          {/* Custom Date Range */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">Custom Rentang Tanggal</span>
              {value.preset === 'custom' && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Aktif</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">Mulai</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">Selesai</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!customStart || !customEnd}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
            >
              Terapkan Rentang Kustom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
