import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getSupabase } from '@/lib/supabaseClient';
import { handleDashboardAiChat } from '@/lib/boonpilot/dashboard-ai';

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

    const rawSlug =
      tenant_slug ||
      tenant_id ||
      req.headers.get('X-Tenant-Slug') ||
      req.headers.get('X-Tenant-ID');

    if (!rawSlug) {
      return NextResponse.json(
        { error: 'MISSING_TENANT', message: 'Tenant slug atau ID wajib disertakan.' },
        { status: 400 }
      );
    }

    const slug = normalizeTenantSlug(rawSlug);

    // ── ENTITLEMENT GUARD (ARCHITECTURE.md): Blokir CHECKOUT_LITE dari fitur AI ──
    const supabase = getSupabase();
    if (supabase) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('tier, metadata')
        .eq('slug', slug)
        .maybeSingle();

      if (tenantRow) {
        const rawTier = String(tenantRow.tier || '').toUpperCase();
        const features = tenantRow.metadata?.features || {};
        if (rawTier === 'CHECKOUT_LITE' || features.ai_bot === false) {
          return NextResponse.json(
            {
              error: 'ENTITLEMENT_RESTRICTED',
              message:
                'Paket CHECKOUT_LITE tidak memiliki akses ke fitur BoonPilot AI Copilot. Silakan upgrade ke paket Starter atau Pro Scale.',
            },
            { status: 403 }
          );
        }
      }
    }

    const sessionId = session_id || `copilot_sess_${Date.now()}`;
    const storeName = slug.replace(/[-_]/g, ' ').toUpperCase();
    const activeHistory = conversation_history.length > 0 ? conversation_history : history;

    // Kandidat Backend URLs: mencakup environment variable, localhost (FastAPI dev), dan Railway production
    const backendCandidates = [
      process.env.CORE_BACKEND_URL,
      process.env.NEXT_PUBLIC_CORE_API_URL,
      process.env.NEXT_PUBLIC_API_URL,
      process.env.BACKEND_URL,
      process.env.NEXT_PUBLIC_BACKEND_URL,
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'https://api.boontrack.com',
    ].filter(Boolean) as string[];

    const uniqueBases = Array.from(new Set(backendCandidates.map((u) => u.replace(/\/$/, ''))));

    const candidatePaths = [
      '/api/v1/merchant/copilot',
      '/api/merchant/copilot',
      '/api/v1/boonpilot/chat',
    ];

    let coreRes: Response | null = null;
    let successfulPath = '';

    for (const base of uniqueBases) {
      for (const path of candidatePaths) {
        const targetUrl = `${base}${path}`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant-Slug': slug,
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
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (res.ok) {
            coreRes = res;
            successfulPath = targetUrl;
            break;
          }
        } catch {
          // Lanjut ke kandidat berikutnya
        }
      }
      if (coreRes) break;
    }

    if (coreRes && coreRes.ok) {
      try {
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
      } catch (parseErr) {
        console.warn('[Merchant Copilot] Error parsing core response:', parseErr);
      }
    }

    // ── FALLBACK KE NATIVE BOONPILOT DASHBOARD AI ENGINE SECARA DINAMIS (§0.12, §8.3) ──
    const aiResult = await handleDashboardAiChat({
      tenant_slug: slug,
      message,
      session_id: sessionId,
      conversation_history: activeHistory,
    });

    return NextResponse.json({
      status: 'success',
      type: aiResult.action_proposal ? 'ACTION_PROPOSAL' : 'TEXT',
      reply: aiResult.reply,
      reply_text: aiResult.reply,
      action_proposal: aiResult.action_proposal || null,
      data: {
        tenant_slug: slug,
        target_tab: aiResult.target_tab,
        entitlement_status: aiResult.entitlement_status,
      },
      quick_actions: aiResult.quick_actions || [
        'Buka Tab Products',
        'Cek Status WhatsApp',
        'Lihat Laporan Penjualan',
      ],
      session_id: sessionId,
      tenant_id: slug,
    });

  } catch (error) {
    console.error('[BoonPilot Copilot] Fatal route error:', error);
    return NextResponse.json(
      {
        status: 'error',
        type: 'TEXT',
        reply: 'Halo Kak! Terjadi kendala saat memproses permintaan Kakak. Silakan coba tanyakan kembali ya, Kak.',
        quick_actions: ['Buka Tab Products', 'Panduan Navigasi Dashboard', 'Hubungkan WhatsApp'],
        session_id: `err_${Date.now()}`,
      },
      { status: 500 }
    );
  }
}
