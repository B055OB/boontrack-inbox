/**
 * packages/attendance/shift-policy.ts
 * Pure Universal Attendance Capability — Shift Schedule & Grace Policy Evaluator
 */

import { ShiftSchedule, ShiftCompliance } from './types';

/**
 * Evaluates shift compliance for an attendance event timestamp against a schedule.
 */
export function evaluateShiftCompliance(
  eventTimeUtc: string,
  shift: ShiftSchedule,
  eventType: 'CLOCK_IN' | 'CLOCK_OUT' = 'CLOCK_IN'
): ShiftCompliance {
  const eventEpochMs = new Date(eventTimeUtc).getTime();
  const startEpochMs = new Date(shift.scheduledStartUtc).getTime();
  const endEpochMs = new Date(shift.scheduledEndUtc).getTime();
  const gracePeriodMs = shift.gracePeriodMinutes * 60 * 1000;

  if (eventType === 'CLOCK_IN') {
    // If event is after scheduled start + grace period -> Late
    const allowedLatestMs = startEpochMs + gracePeriodMs;
    const isLate = eventEpochMs > allowedLatestMs;
    const lateDurationMinutes = isLate ? Math.floor((eventEpochMs - startEpochMs) / (60 * 1000)) : 0;
    const isOnTime = !isLate;

    return {
      shiftId: shift.shiftId,
      isOnTime,
      isLate,
      lateDurationMinutes,
      isEarlyClockOut: false,
      earlyDurationMinutes: 0,
      gracePeriodMinutes: shift.gracePeriodMinutes,
    };
  } else {
    // CLOCK_OUT evaluation: If event is before scheduled end -> Early departure
    const isEarly = eventEpochMs < endEpochMs;
    const earlyDurationMinutes = isEarly ? Math.floor((endEpochMs - eventEpochMs) / (60 * 1000)) : 0;

    return {
      shiftId: shift.shiftId,
      isOnTime: !isEarly,
      isLate: false,
      lateDurationMinutes: 0,
      isEarlyClockOut: isEarly,
      earlyDurationMinutes,
      gracePeriodMinutes: shift.gracePeriodMinutes,
    };
  }
}

