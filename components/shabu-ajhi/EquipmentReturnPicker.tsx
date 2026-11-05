'use client';

import React from 'react';
import { HeartHandshake, Check, Clock } from 'lucide-react';
import { calculatePickupDate } from '@/lib/checkout/cateringCheckoutRouting';

export type EquipmentReturnWindow = 'SAME_DAY' | 'NEXT_DAY_MORNING';

export const EQUIPMENT_RETURN_LABELS: Readonly<Record<EquipmentReturnWindow, string>> = {
  SAME_DAY: 'Same Day (Malam)',
  NEXT_DAY_MORNING: 'Next Day Morning (H+1 Pagi)',
};

export const EQUIPMENT_RETURN_GUARANTEE =
  'Peralatan tidak perlu dicuci. Tim Shabu Ajhi yang akan membersihkan seluruh perlengkapan saat penjemputan.';

/**
 * Resolves default equipment return window based on delivery time slot:
 * Defaults to 'Next Day Morning (H+1 Pagi)' if delivery starts at or after 16:00 WIB.
 * Otherwise defaults to 'Same Day (Malam)'.
 */
export function resolveDefaultEquipmentReturnWindow(timeSlot?: string): EquipmentReturnWindow {
  if (!timeSlot) return 'SAME_DAY';

  const match = timeSlot.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    const startHour = parseInt(match[1], 10);
    if (startHour >= 16) {
      return 'NEXT_DAY_MORNING';
    }
  }

  return 'SAME_DAY';
}

export interface EquipmentReturnMetadata {
  preference: EquipmentReturnWindow;
  label: string;
  pickup_date: string;
  pickup_window: EquipmentReturnWindow;
  time_slot: string;
  cleaning_guarantee: string;
  notes?: string;
}

/**
 * Builds structured equipment return metadata for order payload.
 */
export function buildEquipmentReturnMetadata(
  pickupWindow: EquipmentReturnWindow,
  deliveryDate?: string,
  deliveryTimeSlot?: string
): EquipmentReturnMetadata {
  const isNextDay = pickupWindow === 'NEXT_DAY_MORNING';
  const pickup_date = calculatePickupDate(deliveryDate || '', pickupWindow);
  return {
    preference: pickupWindow,
    label: isNextDay ? 'Next Day Morning (H+1 Pagi)' : 'Same Day (Malam)',
    pickup_date,
    pickup_window: pickupWindow,
    time_slot: isNextDay ? '08.00 – 11.00 WIB' : 'Malam (Setelah Acara)',
    cleaning_guarantee: EQUIPMENT_RETURN_GUARANTEE,
  };
}

export interface EquipmentReturnPickerProps {
  value: EquipmentReturnWindow;
  onChange: (value: EquipmentReturnWindow) => void;
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  formattedPickupDate?: string;
}

export const EquipmentReturnPicker: React.FC<EquipmentReturnPickerProps> = ({
  value,
  onChange,
  deliveryDate,
  deliveryTimeSlot,
  formattedPickupDate,
}) => {
  return (
    <div className="space-y-2.5 pt-3 border-t border-amber-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
          <span>Jadwal Pengembalian &amp; Penjemputan Alat Masak:</span>
        </label>
        <span className="text-[10px] text-emerald-700 font-mono font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          Bebas Cuci 100%
        </span>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
        {EQUIPMENT_RETURN_GUARANTEE}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        {/* Opsi 1: Same Day (Malam) */}
        <label
          data-testid="equipment-return-same-day"
          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
            value === 'SAME_DAY'
              ? 'bg-rose-50 border-rose-500 shadow-xs ring-2 ring-rose-500/30 text-rose-950'
              : 'bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/50 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <input
              type="radio"
              name="equipment_return_picker"
              value="SAME_DAY"
              checked={value === 'SAME_DAY'}
              onChange={() => onChange('SAME_DAY')}
              className="text-rose-600 focus:ring-rose-500 h-4 w-4 border-slate-300 cursor-pointer"
            />
            <div>
              <span className="block font-black">Same Day (Malam)</span>
              <span className="block text-[10px] text-slate-500 font-normal">
                Untuk pengantaran siang yang ingin langsung diambil malam hari
              </span>
            </div>
          </div>
          {value === 'SAME_DAY' && <Check className="w-4 h-4 text-rose-600 shrink-0" />}
        </label>

        {/* Opsi 2: Next Day Morning (H+1 Pagi) */}
        <label
          data-testid="equipment-return-next-day"
          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
            value === 'NEXT_DAY_MORNING'
              ? 'bg-rose-50 border-rose-500 shadow-xs ring-2 ring-rose-500/30 text-rose-950'
              : 'bg-white border-amber-200 hover:border-amber-300 hover:bg-amber-50/50 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <input
              type="radio"
              name="equipment_return_picker"
              value="NEXT_DAY_MORNING"
              checked={value === 'NEXT_DAY_MORNING'}
              onChange={() => onChange('NEXT_DAY_MORNING')}
              className="text-rose-600 focus:ring-rose-500 h-4 w-4 border-slate-300 cursor-pointer"
            />
            <div>
              <span className="block font-black">Next Day Morning (H+1 Pagi)</span>
              <span className="block text-[10px] text-slate-500 font-normal">
                Penjemputan keesokan harinya pukul 08.00 – 11.00 WIB
                {formattedPickupDate ? ` (${formattedPickupDate})` : ''}
              </span>
            </div>
          </div>
          {value === 'NEXT_DAY_MORNING' && <Check className="w-4 h-4 text-rose-600 shrink-0" />}
        </label>
      </div>
    </div>
  );
};

export default EquipmentReturnPicker;

