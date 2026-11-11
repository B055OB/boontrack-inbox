/**
 * packages/attendance/geofence-service.ts
 * Pure Universal Attendance Capability — Precision Geofence & Anti-Mock Calculator
 *
 * Implements WGS-84 Haversine spherical distance calculation.
 */

import { Coordinates, GeofenceBoundary, GeofenceEvaluation } from './types';

const EARTH_RADIUS_METERS = 6371000; // Mean Earth radius in meters

/**
 * Converts degrees to radians.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates surface distance in meters between two coordinates using Haversine formula.
 */
export function calculateDistanceMeters(coord1: Coordinates, coord2: Coordinates): number {
  const lat1Rad = toRadians(coord1.latitude);
  const lat2Rad = toRadians(coord2.latitude);
  const deltaLat = toRadians(coord2.latitude - coord1.latitude);
  const deltaLon = toRadians(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100; // Rounded to 2 decimal places
}

/**
 * Evaluates whether client-reported coordinates fall within a geofence boundary.
 * Never defaults missing accuracy to 0; omitted accuracy remains undefined and
 * fails closed when requireAccuracyMeters is enabled.
 *
 * NOTE: Client-supplied isMockGpsSignal and accuracyMeters are unverified telemetry,
 * not cryptographic device attestation or physical anti-spoof proof.
 */
export function evaluateGeofence(
  subjectCoords: Coordinates,
  boundary: GeofenceBoundary,
  options?: {
    rejectMockGps?: boolean;
    isMockGpsSignal?: boolean;
    maxAccuracyMeters?: number;
    requireAccuracyMeters?: boolean;
  }
): GeofenceEvaluation {
  const distanceMeters = calculateDistanceMeters(subjectCoords, boundary.center);
  const maxAccuracy = options?.maxAccuracyMeters ?? 100;
  const hasAccuracy =
    typeof subjectCoords.accuracyMeters === 'number' &&
    Number.isFinite(subjectCoords.accuracyMeters) &&
    subjectCoords.accuracyMeters >= 0;
  const accuracy = hasAccuracy ? subjectCoords.accuracyMeters : undefined;

  const mockDetected = Boolean(options?.isMockGpsSignal);
  const withinRadius = distanceMeters <= boundary.radiusMeters;
  const accuracyAcceptable =
    accuracy !== undefined
      ? accuracy <= maxAccuracy
      : options?.requireAccuracyMeters
        ? false
        : true;

  const isWithinBoundary = withinRadius && accuracyAcceptable && (!options?.rejectMockGps || !mockDetected);

  return {
    isWithinBoundary,
    distanceMeters,
    radiusMeters: boundary.radiusMeters,
    accuracyMeters: accuracy,
    accuracyProvided: accuracy !== undefined,
    accuracyAcceptable,
    mockGpsDetected: mockDetected,
  };
}

