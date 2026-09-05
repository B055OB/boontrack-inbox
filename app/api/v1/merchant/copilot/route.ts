import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export interface ActionProposal {
  id: string;
  action_type: string;
  title: string;
  summary: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED';
}

export interface MerchantCopilotResponse {
  status?: string;
  type: 'TEXT' | 'ACTION_PROPOSAL';
  reply: string;
  reply_text?: string;
  action_proposal?: ActionProposal | null;
  data?: Record<string, any> | null;
  quick_actions?: string[];
  session_id: string;
  tenant_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_slug,
      tenant_id,
      message,
      session_id,
      conversation_history = [],
      history = [],
      context,
    } = body;

    const slug = normalizeTenantSlug(tenant_slug || tenant_id || 'onlineboost');
    const sessionId = session_id || `copilot_sess_${Date.now()}`;
    const storeName = slug.replace(/[-_]/g, ' ').toUpperCase();
    const activeHistory = conversation_history.length > 0 ? conversation_history : history;

    // 1. Forward Langsung ke Core Backend AI Gateway
    const backendBaseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const targetUrl = `${backendBaseUrl.replace(/\/$/, '')}/api/v1/merchant/copilot`;

    try {
      const coreRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': slug,
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify({
          tenant_slug: slug,
          message,
          session_id: sessionId,
          conversation_history: activeHistory,
          history: activeHistory,
          context: context || {
            tenant_slug: slug,
            store_name: storeName,
          },
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        const reply = coreData.reply || coreData.reply_text || coreData.text || '';
        return NextResponse.json({
          status: coreData.status || 'success',
          type: coreData.type || (coreData.action_proposal ? 'ACTION_PROPOSAL' : 'TEXT'),
          reply,
          reply_text: reply,
          action_proposal: coreData.action_proposal || null,
          data: coreData.data || null,
          quick_actions: coreData.quick_actions || [],
          session_id: coreData.session_id || sessionId,
          tenant_id: slug,
        });
      } else {
        const errText = await coreRes.text().catch(() => '');
        console.warn(`[Merchant Copilot] Core backend returned status ${coreRes.status}:`, errText);
        return NextResponse.json({
          status: 'error',
          type: 'TEXT',
          reply: `Layanan AI Gateway mengembalikan respon ${coreRes.status}. Silakan coba beberapa saat lagi.`,
          reply_text: `Layanan AI Gateway mengembalikan respon ${coreRes.status}. Silakan coba beberapa saat lagi.`,
          session_id: sessionId,
          tenant_id: slug,
        });
      }
    } catch (fetchErr: any) {
      console.warn(`[Merchant Copilot] Core backend offline at ${targetUrl}:`, fetchErr?.message || fetchErr);
      return NextResponse.json({
        status: 'error',
        type: 'TEXT',
        reply: 'Tidak dapat terhubung ke AI Gateway (Core Backend). Pastikan server backend aktif di port 8000.',
        reply_text: 'Tidak dapat terhubung ke AI Gateway (Core Backend). Pastikan server backend aktif di port 8000.',
        session_id: sessionId,
        tenant_id: slug,
      });
    }
  } catch (error) {
    console.error('[Merchant Copilot] API error:', error);
    return NextResponse.json(
      {
        status: 'error',
        type: 'TEXT',
        reply: 'Terjadi kesalahan sistem internal pada rute merchant copilot.',
        reply_text: 'Terjadi kesalahan sistem internal pada rute merchant copilot.',
        session_id: 'err_copilot',
      },
      { status: 500 }
    );
  }
}
