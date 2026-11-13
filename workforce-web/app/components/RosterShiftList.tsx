'use client';

import React from 'react';
import {
  Users,
  Clock,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ChevronRight,
  Building,
  UserCheck,
} from 'lucide-react';
import EmptyState from './EmptyState';
import { RosterCardSkeleton } from './LoadingSkeleton';

export interface PersonnelShiftItem {
  id: string;
  name: string;
  nip: string;
  post: string;
  shift: string;
  status: 'ON_DUTY' | 'LATE' | 'LEAVE_REVIEW' | 'OFF';
  lateMinutes?: number;
  checkInTime?: string;
  completedPoints?: number;
  totalPoints?: number;
  photoUrl?: string | null;
}

export interface RosterShiftListProps {
  personnel: PersonnelShiftItem[];
  loading?: boolean;
  isDemoData?: boolean;
  filterFacility?: string;
  filterShift?: string;
  filterStatus?: string;
  onFilterChange?: (filters: { facility?: string; shift?: string; status?: string }) => void;
  onSelectPersonnel?: (officer: PersonnelShiftItem) => void;
}

export default function RosterShiftList({
  personnel,
  loading = false,
  isDemoData = false,
  filterFacility = 'all',
  filterShift = 'all',
  filterStatus = 'all',
  onFilterChange,
  onSelectPersonnel,
}: RosterShiftListProps) {
  // Filter logic
  const filteredList = React.useMemo(() => {
    return personnel.filter((p) => {
      if (filterShift !== 'all' && p.shift.toLowerCase() !== filterShift.toLowerCase()) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      return true;
    });
  }, [personnel, filterShift, filterStatus]);

  function getStatusBadge(status: PersonnelShiftItem['status'], lateMinutes?: number) {
    switch (status) {
      case 'ON_DUTY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            <span>Aktif Bertugas</span>
          </span>
        );
      case 'LATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span>Terlambat {lateMinutes ? `(${lateMinutes}m)` : ''}</span>
          </span>
        );
      case 'LEAVE_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <FileText className="w-3 h-3" aria-hidden="true" />
            <span>Izin Sakit</span>
          </span>
        );
      case 'OFF':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span>Lepas Dinas</span>
          </span>
        );
    }
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Users className="w-6 h-6 stroke-[2.2]" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 leading-tight">Roster & Alokasi Shift</h2>
              {isDemoData && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider">
                  DEMO / SIMULATED TELEMETRY
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {filteredList.length} personel terdaftar pada filter aktif
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs">
          <select
            value={filterShift}
            onChange={(e) => onFilterChange && onFilterChange({ shift: e.target.value })}
            aria-label="Filter Shift"
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
          >
            <option value="all">Semua Shift</option>
            <option value="pagi">Shift Pagi</option>
            <option value="siang">Shift Siang</option>
            <option value="malam">Shift Malam</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => onFilterChange && onFilterChange({ status: e.target.value })}
            aria-label="Filter Status"
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
          >
            <option value="all">Semua Status</option>
            <option value="ON_DUTY">Aktif Bertugas</option>
            <option value="LATE">Terlambat</option>
            <option value="LEAVE_REVIEW">Izin Sakit</option>
            <option value="OFF">Lepas Dinas</option>
          </select>
        </div>
      </div>

      {/* Roster Cards List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="space-y-2">
            <RosterCardSkeleton />
            <RosterCardSkeleton />
            <RosterCardSkeleton />
          </div>
        ) : filteredList.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Tidak Ada Personel Terdaftar"
            description="Tidak ada data jadwal shift atau personel yang cocok dengan kriteria filter saat ini."
          />
        ) : (
          filteredList.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => onSelectPersonnel && onSelectPersonnel(person)}
              aria-label={`Detail personel ${person.name}`}
              className="w-full min-h-[48px] p-4 bg-slate-50 hover:bg-blue-50/50 active:scale-[0.99] border border-slate-200/70 hover:border-blue-200 rounded-2xl flex items-center justify-between text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {person.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs sm:text-sm">{person.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium">({person.nip})</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      {person.shift}
                    </span>
                    <span>•</span>
                    <span className="truncate max-w-[120px] sm:max-w-xs">{person.post}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  {getStatusBadge(person.status, person.lateMinutes)}
                  {person.totalPoints !== undefined && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {person.completedPoints}/{person.totalPoints} Pos
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

