import { NextRequest } from 'next/server';
import { POST as handleV1Upload } from '../v1/upload/route';

export async function POST(req: NextRequest) {
  return handleV1Upload(req);
}
