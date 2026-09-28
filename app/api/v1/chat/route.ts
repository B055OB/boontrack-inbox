import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { processMultimodalChat, MultimodalChatInput } from '@/lib/ai/multimodal-chat';

export async function POST(req: NextRequest) {
  try {
    const body: MultimodalChatInput = await req.json().catch(() => ({}));
    const result = await processMultimodalChat(body);

    if (result.silent) {
      return NextResponse.json({
        success: true,
        silent: true,
        reply: '',
        tenant_id: result.tenant_id,
        tenant_slug: result.tenant_slug,
        type: 'HUMAN_TAKEOVER_SILENT',
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
