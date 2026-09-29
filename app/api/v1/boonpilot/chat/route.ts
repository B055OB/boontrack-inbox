/**
 * app/api/v1/boonpilot/chat/route.ts
 * BoonPilot Dashboard Interactive Copilot API Gateway
 *
 * References Architecture:
 * - §3.1 & §5.1: Tenant Tier Entitlements & Boundaries ('CHECKOUT_LITE' | 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE')
 * - §8.1, §8.3, §8.4: Zero Fake Fallback & Scope Lock
 * - §27.3: 8-Tab UI Navigation Blueprint Grounding
 * - §30.1 & §30.2: Multimodal Vision Pipeline locked to `gemini-3.8-flash`
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';
import {
  handleDashboardAiChat,
  DashboardAiInput,
  DashboardAiResponse,
} from '@/lib/boonpilot/dashboard-ai';

interface ConversationHistoryItem {
  role: 'user' | 'assistant' | 'model';
  content?: string;
  text?: string;
  parts?: string;
  timestamp?: string;
  action_proposal?: any;
  quick_actions?: any;
}

interface ChatRequestPayload {
  tenant_slug?: string;
  tenant_id?: string;
  slug?: string;
  session_id?: string;
  message?: string;
  text?: string;
  conversation_history?: ConversationHistoryItem[];
  history?: ConversationHistoryItem[];
  image?: string;
  image_base64?: string;
  image_url?: string;
  media?: {
    url?: string;
    base64?: string;
    mime_type?: string;
  };
  mime_type?: string;
}

export async function POST(req: NextRequest) {
  try {
    let payload: ChatRequestPayload = {};
    const contentType = req.headers.get('content-type') || '';

    // Handle Multipart Form Data (Direct File Upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const tenant_slug = (formData.get('tenant_slug') as string) || (formData.get('slug') as string) || '';
      const message = (formData.get('message') as string) || (formData.get('text') as string) || '';
      const session_id = (formData.get('session_id') as string) || '';
      const file = formData.get('file') as File | null;
      const image = formData.get('image') as File | null;
      const targetFile = file || image;

      let imageBase64: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (targetFile && typeof targetFile.arrayBuffer === 'function') {
        const buffer = await targetFile.arrayBuffer();
        imageBase64 = Buffer.from(buffer).toString('base64');
        mimeType = targetFile.type || 'image/jpeg';
      }

      payload = {
        tenant_slug,
        message,
        session_id,
        image_base64: imageBase64,
        mime_type: mimeType,
      };
    } else {
      payload = await req.json().catch(() => ({}));
    }

    const rawSlug =
      payload.tenant_slug ||
      payload.tenant_id ||
      payload.slug ||
      req.headers.get('X-Tenant-Slug') ||
      req.headers.get('X-Tenant-ID');

    if (!rawSlug) {
      return NextResponse.json(
        { error: 'MISSING_TENANT', message: 'Tenant slug atau ID wajib disertakan.' },
        { status: 400 }
      );
    }
    const slug = rawSlug.trim().toLowerCase();

    const rawMessage = payload.message ?? payload.text ?? '';
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : String(rawMessage);

    const rawImage =
      payload.image_base64 ||
      payload.image ||
      payload.image_url ||
      payload.media?.base64 ||
      payload.media?.url;

    if (!message && !rawImage) {
      return NextResponse.json(
        { error: 'Pesan atau gambar tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const sessionId = payload.session_id || `bp_${Date.now()}`;
    const conversationHistory = payload.conversation_history || payload.history || [];

    // ── 1. TERUSKAN KE BACKEND CORE JIKA MEMUNGKINKAN (FASTAPI DEV / RAILWAY) ──
    try {
      const coreUrl = getBackendApiUrl('/api/v1/boonpilot/chat');
      const coreRes = await fetch(coreUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': slug,
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify({
          tenant_slug: slug,
          session_id: sessionId,
          message,
          conversation_history: conversationHistory,
          image: payload.image,
          image_base64: payload.image_base64,
          mime_type: payload.mime_type,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData && (coreData.reply || coreData.response || coreData.message)) {
          return NextResponse.json({
            reply: coreData.reply || coreData.response || coreData.message,
            action_proposal: coreData.action_proposal || null,
            quick_actions: coreData.quick_actions || null,
            session_id: sessionId,
            model_used: 'gemini-3.8-flash',
            target_tab: coreData.target_tab || undefined,
          });
        }
      }
    } catch (coreErr) {
      // Backend core unreachable, seamlessly proceed to Next.js native engine
    }

    // ── 2. EXECUTE NATIVE BOONPILOT DASHBOARD ENGINE (MULTIMODAL, 8 TABS, TIER GROUNDING) ──
    const dashboardAiInput: DashboardAiInput = {
      tenant_slug: slug,
      message,
      session_id: sessionId,
      conversation_history: conversationHistory,
      image: payload.image,
      image_base64: payload.image_base64,
      image_url: payload.image_url,
      media: payload.media,
      mime_type: payload.mime_type,
    };

    const aiResult: DashboardAiResponse = await handleDashboardAiChat(dashboardAiInput);

    return NextResponse.json({
      reply: aiResult.reply,
      session_id: aiResult.session_id,
      model_used: aiResult.model_used,
      target_tab: aiResult.target_tab,
      action_proposal: aiResult.action_proposal || null,
      quick_actions: aiResult.quick_actions || [],
      entitlement_status: aiResult.entitlement_status,
      metrics_analyzed: aiResult.metrics_analyzed,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem internal';
    return NextResponse.json(
      {
        error: errorMsg,
        reply: 'Maaf, terjadi kendala saat memproses permintaan Anda. Silakan coba lagi.',
      },
      { status: 500 }
    );
  }
}
