import type { NextRequest } from 'next/server';
import {
  processAttendanceSubmission,
  processAttendanceStatusRead,
  type AttendancePayload,
} from '@/workforce-web/lib/workforce/attendance-verification';

export type { AttendancePayload };

// GET: Authenticated & Authoritative Attendance Status Read
export async function GET(req: NextRequest) {
  return processAttendanceStatusRead(req);
}

// POST: Authenticated & Verified Attendance Mutation
export async function POST(req: NextRequest) {
  return processAttendanceSubmission(req);
}
