import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, conversation_id, text, agent_id, phone_number, idempotency_key } = body;

    const idempHeader = req.headers.get('Idempotency-Key') || req.headers.get('X-Idempotency-Key') || idempotency_key;

    if (!tenant_id || !conversation_id || !text) {
      return NextResponse.json(
        { success: false, detail: 'tenant_id, conversation_id, and text are required.' },
        { status: 400 }
      );
    }

    const coreUrl =
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://127.0.0.1:8000';

    const targetEndpoint = `${coreUrl.replace(/\/$/, '')}/api/v1/inbox/messages/send`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idempHeader) {
      headers['Idempotency-Key'] = idempHeader;
    }

    const coreRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenant_id,
        conversation_id,
        text,
        agent_id,
        phone_number,
        idempotency_key: idempHeader,
      }),
    });

    const data = await coreRes.json();
    return NextResponse.json(data, { status: coreRes.status });
  } catch (err: any) {
    console.error('[API /api/inbox/messages/send] Proxy error:', err);
    return NextResponse.json(
      { success: false, detail: err?.message || 'Gagal menghubungi service pengiriman pesan core.' },
      { status: 500 }
    );
  }
}
