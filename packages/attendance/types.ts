/**
 * packages/attendance/types.ts
 * Pure Universal Attendance Capability — Core Domain Types
 *
 * ARCHITECTURAL DIRECTIVE:
 * This module is 100% domain-agnostic. It MUST NOT import or reference
 * Satya, Security Guard, Toko, Tenant Shop, Pos Jaga, Agency, or any vertical entity.
 */

export type AttendanceEventType =
  | 'CLOCK_IN'
  | 'CLOCK_OUT'
  | 'BREAK_START'
  | 'BREAK_END';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface GeofenceBoundary {
  id: string;
  name?: string;
  center: Coordinates;
  radiusMeters: number;
}

export interface GeofenceEvaluation {
  isWithinBoundary: boolean;
  distanceMeters: number;
  radiusMeters: number;
  accuracyMeters?: number;
  mockGpsDetected?: boolean;
}

export interface AttendanceEvidence {
  photoUrl?: string;
  photoHash?: string;
  capturedAtUtc: string;
  deviceId?: string;
  isMockGpsDetected?: boolean;
}

export interface ShiftSchedule {
  shiftId: string;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  gracePeriodMinutes: number;
}

export interface ShiftCompliance {
  shiftId: string;
  isOnTime: boolean;
  isLate: boolean;
  lateDurationMinutes: number;
  isEarlyClockOut: boolean;
  earlyDurationMinutes: number;
  gracePeriodMinutes: number;
}

export interface AttendanceEvent {
  id: string;
  subjectId: string;
  locationId: string;
  type: AttendanceEventType;
  timestampUtc: string;
  coordinates: Coordinates;
  evidence?: AttendanceEvidence;
  shiftId?: string;
  shiftCompliance?: ShiftCompliance;
  geofenceEvaluation?: GeofenceEvaluation;
}

export interface AttendanceResult {
  success: boolean;
  event?: AttendanceEvent;
  geofenceEvaluation?: GeofenceEvaluation;
  shiftCompliance?: ShiftCompliance;
  error?: string;
  errorCode?:
    | 'GEOFENCE_BREACH'
    | 'INVALID_STATE_TRANSITION'
    | 'MOCK_GPS_DETECTED'
    | 'EVIDENCE_REQUIRED'
    | 'SHIFT_NOT_FOUND'
    | 'INTERNAL_ERROR';
}

export interface AttendanceState {
  subjectId: string;
  locationId: string;
  currentState: AttendanceEventType | 'INITIAL';
  lastEventId?: string;
  lastEventTimestampUtc?: string;
}

