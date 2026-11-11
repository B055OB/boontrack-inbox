import type { NextRequest } from 'next/server';
import {
  processCheckpointScanSubmission,
  type CheckpointScanPayload,
} from '@/workforce-web/lib/workforce/attendance-verification';

export type { CheckpointScanPayload };

// POST: Authenticated & Verified Checkpoint Scan Mutation
export async function POST(req: NextRequest) {
  return processCheckpointScanSubmission(req);
}
