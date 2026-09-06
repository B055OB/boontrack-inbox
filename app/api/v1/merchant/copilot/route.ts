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

    // Forward murni ke Merchant Copilot Backend Railway (FastAPI)
    const backendBaseUrl =
      process.env.CORE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'https://boontrack-core-production.up.railway.app';

    const baseUrlClean = backendBaseUrl.replace(/\/$/, '');
    const candidatePaths = [
      '/api/v1/merchant/copilot',
      '/api/merchant/copilot',
    ];

    let coreRes: Response | null = null;
    let successfulPath = '';

    for (const path of candidatePaths) {
      const targetUrl = `${baseUrlClean}${path}`;
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': slug,
            'X-Session-ID': sessionId,
          },
          body: JSON.stringify({
            tenant_slug: slug,
            tenant_id: slug,
            slug,
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

        // Jika tidak 404, simpan response
        if (res.status !== 404) {
          coreRes = res;
          successfulPath = path;
          break;
        }
      } catch (err) {
        console.warn(`[Merchant Copilot] Failed candidate ${targetUrl}:`, err);
      }
    }

    try {
      if (coreRes && coreRes.ok) {
        const coreData = await coreRes.json();
        let reply = coreData.reply || coreData.reply_text || coreData.text || '';
        let actionProposal = coreData.action_proposal || null;
        let dataPayload = coreData.data || null;
        let quickActions = coreData.quick_actions || [];

        // Parse nested JSON jika reply berupa format JSON string dari AI engine
        if (typeof reply === 'string' && reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
          try {
            const parsed = JSON.parse(reply.trim());
            if (parsed.reply) reply = parsed.reply;
            if (Array.isArray(parsed.quick_actions) && parsed.quick_actions.length > 0) {
              quickActions = parsed.quick_actions;
            }
            if (parsed.action_proposal) {
              actionProposal = parsed.action_proposal;
            }
            if (parsed.data) {
              dataPayload = parsed.data;
            }
          } catch {
            // Keep original string if JSON parsing fails
          }
        }

        return NextResponse.json({
          status: coreData.status || 'success',
          type: coreData.type || (actionProposal ? 'ACTION_PROPOSAL' : 'TEXT'),
          reply,
          reply_text: reply,
          action_proposal: actionProposal,
          data: dataPayload,
          quick_actions: quickActions,
          session_id: coreData.session_id || sessionId,
          tenant_id: slug,
        });
      } else if (coreRes) {
        const errText = await coreRes.text().catch(() => '');
        console.warn(`[Merchant Copilot] Core backend at ${successfulPath} returned ${coreRes.status}:`, errText);
        return NextResponse.json({
          status: 'error',
          type: 'TEXT',
          reply: 'Layanan BoonPilot Copilot mengembalikan respon tidak terduga. Silakan coba beberapa saat lagi.',
          reply_text: 'Layanan BoonPilot Copilot mengembalikan respon tidak terduga. Silakan coba beberapa saat lagi.',
          session_id: sessionId,
          tenant_id: slug,
        });
      } else {
        return NextResponse.json({
          status: 'error',
          type: 'TEXT',
          reply: 'Layanan BoonPilot Copilot tidak ditemukan (404) di server.',
          reply_text: 'Layanan BoonPilot Copilot tidak ditemukan (404) di server.',
          session_id: sessionId,
          tenant_id: slug,
        });
      }
    } catch (fetchErr: any) {
      console.warn('[BoonPilot Copilot] Core backend offline:', fetchErr?.message || fetchErr);
      return NextResponse.json({
        status: 'error',
        type: 'TEXT',
        reply: 'Tidak dapat terhubung ke server BoonPilot Copilot. Pastikan koneksi backend aktif.',
        reply_text: 'Tidak dapat terhubung ke server BoonPilot Copilot. Pastikan koneksi backend aktif.',
        session_id: sessionId,
        tenant_id: slug,
      });
    }
  } catch (error) {
    console.error('[BoonPilot Copilot] API error:', error);
    return NextResponse.json(
      {
        status: 'error',
        type: 'TEXT',
        reply: 'Terjadi kendala internal pada layanan BoonPilot Copilot.',
        reply_text: 'Terjadi kendala internal pada layanan BoonPilot Copilot.',
        session_id: 'err_copilot',
      },
      { status: 500 }
    );
  }
}
