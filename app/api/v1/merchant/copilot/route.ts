import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBackendApiUrl } from '@/lib/api-config';
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
      message,
      session_id,
      conversation_history = [],
    } = body;

    const slug = normalizeTenantSlug(tenant_slug || 'onlineboost');
    const sessionId = session_id || `copilot_sess_${Date.now()}`;
    const storeName = slug.replace(/[-_]/g, ' ').toUpperCase();

    // 1. Panggil Langsung Backend AI Gateway (POST /api/v1/merchant/copilot)
    try {
      const coreRes = await fetch(getBackendApiUrl('/api/v1/merchant/copilot'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': slug,
        },
        body: JSON.stringify({
          tenant_slug: slug,
          message,
          session_id: sessionId,
          conversation_history,
        }),
        cache: 'no-store',
      });

      if (coreRes.ok) {
        const coreData = await coreRes.json();
        if (coreData && (coreData.reply || coreData.type)) {
          return NextResponse.json(coreData);
        }
      } else {
        console.warn(`[Merchant Copilot] Backend returned status ${coreRes.status}`);
      }
    } catch (backendErr) {
      console.warn('[Merchant Copilot] Backend connection failed, using fallback:', backendErr);
    }

    // 2. Clean Fallback Tanpa Mock Echo Fiktif
    return NextResponse.json({
      status: 'success',
      type: 'TEXT',
      reply: `Halo! Saya **BoonPilot**, copilot operasional toko **${storeName}**. Saya dapat membantu memantau omset penjualan, memeriksa stok menipis, dan mengatur otomatisasi WhatsApp. Silakan tanyakan hal yang ingin Anda ketahui.`,
      quick_actions: [
        'Bagaimana performa penjualan toko saya minggu ini?',
        'Cek stok produk yang hampir habis',
        'Bantu atur titik penjemputan gudang kurir',
      ],
      session_id: sessionId,
      tenant_id: slug,
    } as MerchantCopilotResponse);

  } catch (error) {
    console.error('Merchant copilot API error:', error);
    return NextResponse.json({
      status: 'error',
      type: 'TEXT',
      reply: 'Halo! BoonPilot siap membantu operasional toko Anda. Silakan pilih salah satu menu tindakan cepat.',
      quick_actions: ['Performa penjualan minggu ini', 'Cek stok produk', 'Bantuan CS'],
      session_id: 'err_fallback',
    });
  }
}
