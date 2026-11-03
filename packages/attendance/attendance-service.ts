/**
 * packages/attendance/attendance-service.ts
 * Pure Universal Attendance Capability — State Machine & Event Dispatcher
 */

import {
  AttendanceEvent,
  AttendanceEventType,
  AttendanceResult,
  AttendanceState,
  Coordinates,
  GeofenceBoundary,
  AttendanceEvidence,
  ShiftSchedule,
} from './types';
import { evaluateGeofence } from './geofence-service';
import { evaluateShiftCompliance } from './shift-policy';

// Allowed state transitions
const ALLOWED_TRANSITIONS: Record<string, AttendanceEventType[]> = {
  INITIAL: ['CLOCK_IN'],
  CLOCK_OUT: ['CLOCK_IN'],
  CLOCK_IN: ['BREAK_START', 'CLOCK_OUT'],
  BREAK_START: ['BREAK_END'],
  BREAK_END: ['BREAK_START', 'CLOCK_OUT'],
};

export interface ProcessAttendanceParams {
  subjectId: string;
  locationId: string;
  type: AttendanceEventType;
  timestampUtc: string;
  coordinates: Coordinates;
  currentState?: AttendanceEventType | 'INITIAL';
  boundary?: GeofenceBoundary;
  shift?: ShiftSchedule;
  evidence?: AttendanceEvidence;
  options?: {
    enforceGeofence?: boolean;
    rejectMockGps?: boolean;
  };
}

/**
 * Validates transition and processes an attendance event.
 */
export function processAttendanceEvent(params: ProcessAttendanceParams): AttendanceResult {
  const currentState = params.currentState || 'INITIAL';

  // 1. Validate State Transition
  const allowedNext = ALLOWED_TRANSITIONS[currentState] || [];
  if (!allowedNext.includes(params.type)) {
    return {
      success: false,
      error: `Transisi status tidak valid: '${currentState}' tidak dapat berpindah ke '${params.type}'.`,
      errorCode: 'INVALID_STATE_TRANSITION',
    };
  }

  // 2. Validate Mock GPS
  if (params.options?.rejectMockGps && params.evidence?.isMockGpsDetected) {
    return {
      success: false,
      error: 'Sinyal lokasi mock GPS / spoofing terdeteksi. Presensi ditolak.',
      errorCode: 'MOCK_GPS_DETECTED',
    };
  }

  // 3. Evaluate Geofence Boundary if provided and enforced
  let geofenceEval;
  if (params.boundary && params.options?.enforceGeofence !== false) {
    geofenceEval = evaluateGeofence(params.coordinates, params.boundary, {
      rejectMockGps: params.options?.rejectMockGps,
      isMockGpsSignal: params.evidence?.isMockGpsDetected,
    });

    if (!geofenceEval.isWithinBoundary) {
      return {
        success: false,
        geofenceEvaluation: geofenceEval,
        error: `Di luar radius presensi: ${geofenceEval.distanceMeters}m dari pusat lokasi (Maksimal: ${geofenceEval.radiusMeters}m).`,
        errorCode: 'GEOFENCE_BREACH',
      };
    }
  }

  // 4. Evaluate Shift Schedule if provided
  let shiftEval;
  if (params.shift) {
    shiftEval = evaluateShiftCompliance(
      params.timestampUtc,
      params.shift,
      params.type === 'CLOCK_OUT' ? 'CLOCK_OUT' : 'CLOCK_IN'
    );
  }

  // 5. Build Attendance Event Record
  const event: AttendanceEvent = {
    id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    subjectId: params.subjectId,
    locationId: params.locationId,
    type: params.type,
    timestampUtc: params.timestampUtc,
    coordinates: params.coordinates,
    evidence: params.evidence,
    shiftId: params.shift?.shiftId,
    shiftCompliance: shiftEval,
    geofenceEvaluation: geofenceEval,
  };

  return {
    success: true,
    event,
    geofenceEvaluation: geofenceEval,
    shiftCompliance: shiftEval,
  };
}

