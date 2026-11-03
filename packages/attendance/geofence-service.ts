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
 * Evaluates whether a subject's coordinates fall within a geofence boundary.
 * Also validates GPS mock indicators and accuracy tolerance.
 */
export function evaluateGeofence(
  subjectCoords: Coordinates,
  boundary: GeofenceBoundary,
  options?: {
    rejectMockGps?: boolean;
    isMockGpsSignal?: boolean;
    maxAccuracyMeters?: number;
  }
): GeofenceEvaluation {
  const distanceMeters = calculateDistanceMeters(subjectCoords, boundary.center);
  const maxAccuracy = options?.maxAccuracyMeters ?? 100;
  const accuracy = subjectCoords.accuracyMeters ?? 0;

  const mockDetected = Boolean(options?.isMockGpsSignal);
  const withinRadius = distanceMeters <= boundary.radiusMeters;
  const accuracyAcceptable = accuracy <= maxAccuracy;

  const isWithinBoundary = withinRadius && accuracyAcceptable && (!options?.rejectMockGps || !mockDetected);

  return {
    isWithinBoundary,
    distanceMeters,
    radiusMeters: boundary.radiusMeters,
    accuracyMeters: accuracy,
    mockGpsDetected: mockDetected,
  };
}

