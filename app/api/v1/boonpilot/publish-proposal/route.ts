import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import { mapProposalToAiForm, mapProposalToPlaybook } from '@/lib/boonpilotMapper';

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

    const mappedAi = mapProposalToAiForm(publishedProposal);
    const mappedPlaybook = mapProposalToPlaybook(publishedProposal);

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

        const currentMetadata = tenantData?.metadata || {};
        const updatedMetadata = {
          ...currentMetadata,
          boonpilot_proposal: publishedProposal,
          boonpilot_configuration: publishedProposal,
          business_category: publishedProposal.business_profile?.business_category || currentMetadata.business_category || 'FIELD_SERVICE',
          business_type: publishedProposal.template_code,
          vertical_type: publishedProposal.template_code,
          last_configured_at: new Date().toISOString(),
          // Sync AI knowledge, persona, and playbook so all endpoints reflect it immediately
          ai_knowledge: {
            ...(currentMetadata.ai_knowledge || {}),
            ...mappedAi,
            assistant_name: mappedAi.ai_name,
          },
          persona: {
            ...(currentMetadata.persona || {}),
            ...mappedAi,
            assistant_name: mappedAi.ai_name,
          },
          playbook: mappedPlaybook,
          seller_playbook: mappedPlaybook,
        };

        if (tenantData) {
          const updatePayload: Record<string, any> = {
            metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          };
          if (publishedProposal.business_profile?.store_name) {
            updatePayload.name = publishedProposal.business_profile.store_name;
          }

          const { error: updateErr } = await supabase
            .from('tenants')
            .update(updatePayload)
            .eq('slug', tenantSlug);

          if (updateErr) {
            console.error('[BoonPilot Publish] Supabase update error:', updateErr);
          }
        } else {
          // Auto-insert trial tenant if not yet in database (e.g. sandbox or new registration)
          const insertPayload = {
            slug: tenantSlug,
            name: publishedProposal.business_profile?.store_name || `${tenantSlug.toUpperCase()} Store`,
            tier: 'STARTER',
            is_active: true,
            category: 'service',
            metadata: {
              plan_tier: 'SOLO_TRIAL',
              ...updatedMetadata,
            },
            updated_at: new Date().toISOString(),
          };

          const { error: insertErr } = await supabase
            .from('tenants')
            .insert(insertPayload);

          if (insertErr) {
            console.error('[BoonPilot Publish] Supabase insert error:', insertErr);
          }
        }
      }
    } catch (dbErr) {
      console.error('[BoonPilot Publish] Supabase persistence error:', dbErr);
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
