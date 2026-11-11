import type { NextRequest } from 'next/server';
import {
  processAttendanceSubmission,
  type AttendancePayload,
} from '@/workforce-web/lib/workforce/attendance-verification';

export type { AttendancePayload };

// POST: Authenticated & Verified Attendance Mutation
export async function POST(req: NextRequest) {
  return processAttendanceSubmission(req);
}
