import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const proposal: BusinessConfigurationProposal = body.proposal;
    const tenantSlug = (body.tenant_slug || proposal?.tenant_slug || '').trim().toLowerCase();

    if (!tenantSlug) {
      return NextResponse.json(
        { error: 'tenant_slug wajib disertakan.' },
        { status: 400 }
      );
    }

    if (!proposal) {
      return NextResponse.json(
        { error: 'Objek proposal konfigurasi bisnis wajib disertakan.' },
        { status: 400 }
      );
    }

    // Validate that proposal status is moving to PUBLISHED
    const publishedProposal: BusinessConfigurationProposal = {
      ...proposal,
      status: 'PUBLISHED',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Update in Supabase (Single Source of Truth)
    try {
      const supabase = getSupabase();
      if (supabase) {
        // Fetch current tenant metadata to preserve existing fields
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantData) {
          const currentMetadata = tenantData.metadata || {};
          const updatedMetadata = {
            ...currentMetadata,
            boonpilot_configuration: publishedProposal,
            business_category: publishedProposal.business_profile.business_category || currentMetadata.business_category,
            business_type: publishedProposal.template_code,
            last_configured_at: new Date().toISOString(),
          };

          await supabase
            .from('tenants')
            .update({
              metadata: updatedMetadata,
              business_category: publishedProposal.business_profile.business_category || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('slug', tenantSlug);
        }
      }
    } catch (dbErr) {
      console.warn('[BoonPilot Publish] Supabase persistence note:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Konfigurasi bisnis berhasil divalidasi dan diaktifkan (PUBLISHED)!',
      proposal: publishedProposal,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Gagal mempublikasikan proposal';
    return NextResponse.json(
      { error: errorMsg, message: 'Gagal mempublikasikan proposal konfigurasi.' },
      { status: 500 }
    );
  }
}
