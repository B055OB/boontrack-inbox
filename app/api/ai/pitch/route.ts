import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GET as handlePitchGet, POST as handlePitchPost } from '@/app/api/v1/boonpilot/generate-product-pitch/route';

export const dynamic = 'force-dynamic';

/**
 * Universal endpoint alias for BoonPilot Pitch Generator (/api/ai/pitch)
 */
export async function GET(req: NextRequest) {
  return handlePitchGet(req);
}

export async function POST(req: NextRequest) {
  return handlePitchPost(req);
}
