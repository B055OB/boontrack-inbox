import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';

export interface PlatformSupportResponse {
  status?: string;
  type: 'TEXT' | 'ESCALATE_WA';
  reply: string;
  category?: 'billing' | 'technical' | 'affiliate' | 'general';
  escalation_url?: string;
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
      category = 'general',
      session_id,
    } = body;

    const slug = tenant_slug || tenant_id || 'boontrack-platform';
    const sessionId = session_id || `support_sess_${Date.now()}`;

    // 1. Panggil Langsung Backend AI Gateway (POST /api/v1/platform/support)
    try {
      const coreRes = await fetch(getBackendApiUrl('/api/v1/platform/support'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: slug,
          message,
          category,
          session_id: sessionId,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData && (coreData.reply || coreData.type)) {
          return NextResponse.json(coreData);
        }
      } else {
        console.warn(`[Platform Support] Backend returned status ${coreRes.status}`);
      }
    } catch (backendErr) {
      console.warn('[Platform Support] Backend connection failed, using fallback:', backendErr);
    }

    // 2. Clean Helpdesk Fallback
    const waHelpdesk = 'https://wa.me/6281237450222';
    const encoded = encodeURIComponent(`Halo Tim Support BoonTrack, saya butuh bantuan terkait ${category}: ${message}`);

    return NextResponse.json({
      status: 'success',
      type: 'ESCALATE_WA',
      reply: 'Halo! Customer Support BoonTrack siap membantu kendala setup toko, integrasi WhatsApp, dan pembayaran Anda. Anda juga dapat langsung berdiskusi dengan tim kami di WhatsApp.',
      category: category as any,
      escalation_url: `${waHelpdesk}?text=${encoded}`,
      quick_actions: ['Info Upgrade Paket Toko', 'Bantuan Teknis CAPI', 'Tanya Program Kemitraan Mitra', 'Hubungi Live Support WA'],
      session_id: sessionId,
      tenant_id: slug,
    } as PlatformSupportResponse);

  } catch (error) {
    console.error('Platform support API error:', error);
    return NextResponse.json({
      status: 'error',
      type: 'TEXT',
      reply: 'Halo! Pusat Bantuan BoonTrack siap melayani Anda.',
      session_id: 'err_fallback',
    });
  }
}
