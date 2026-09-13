import { POST as handleChatV1 } from '@/app/api/v1/chat/route';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  return handleChatV1(req);
}
