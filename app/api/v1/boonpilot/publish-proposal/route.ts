import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { updateTenantWithOccCas } from '@/lib/tenants/atomic-tenant-metadata-writer';
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
      const supabase = getSupabaseAdmin() || getSupabase();
      if (supabase) {
        // Fetch current tenant metadata to preserve existing fields
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        const currentMetadata = tenantData?.metadata || {};
        const faqKnowledge = (publishedProposal.knowledge || [])
          .filter(k => k.category === 'FAQ')
          .map((k, idx) => ({
            id: k.id || `faq_${Date.now()}_${idx}`,
            question: k.title,
            answer: k.content,
          }));

        const proposalMetadata = {
          boonpilot_proposal: publishedProposal,
          boonpilot_configuration: publishedProposal,
          faqs: faqKnowledge.length > 0 ? faqKnowledge : [],
          business_category: publishedProposal.business_profile?.business_category || 'FIELD_SERVICE',
          business_type: publishedProposal.template_code,
          vertical_type: publishedProposal.template_code,
          last_configured_at: new Date().toISOString(),
          onboarding_completed: true,
          proposal: publishedProposal,
          ai_knowledge: {
            ...mappedAi,
            assistant_name: mappedAi.ai_name,
          },
          persona: {
            ...mappedAi,
            assistant_name: mappedAi.ai_name,
          },
          playbook: mappedPlaybook,
          seller_playbook: mappedPlaybook,
        };

        if (tenantData) {
          const occResult = await updateTenantWithOccCas(
            supabase,
            tenantSlug,
            (freshTenant) => {
              const freshMeta = { ...(freshTenant.metadata || {}) };
              Object.assign(freshMeta, proposalMetadata);
              freshMeta.faqs = faqKnowledge.length > 0 ? faqKnowledge : (freshMeta.faqs || []);
              freshMeta.ai_knowledge = {
                ...(freshMeta.ai_knowledge || {}),
                ...mappedAi,
                assistant_name: mappedAi.ai_name,
              };
              freshMeta.persona = {
                ...(freshMeta.persona || {}),
                ...mappedAi,
                assistant_name: mappedAi.ai_name,
              };
              if (freshMeta.is_bot_active === undefined) {
                freshMeta.is_bot_active = true;
              }
              if (freshMeta.bot_paused === undefined) {
                freshMeta.bot_paused = false;
              }

              const updatePayload: Record<string, any> = {
                metadata: freshMeta,
              };
              if (publishedProposal.business_profile?.store_name) {
                updatePayload.name = publishedProposal.business_profile.store_name;
              }
              return updatePayload;
            }
          );

          if (!occResult.success) {
            console.error('[BoonPilot Publish] Supabase update error:', occResult.error);
            const isConflict = occResult.error === 'OCC_CONFLICT' || occResult.error?.includes('OCC_CONFLICT');
            return NextResponse.json(
              {
                success: false,
                error: isConflict ? 'OCC_CONFLICT' : 'UPDATE_FAILED',
                message: isConflict
                  ? 'Gagal mempublikasikan proposal karena terjadi konflik konkurensi (OCC_CONFLICT).'
                  : (occResult.message || occResult.error || 'Gagal memperbarui konfigurasi toko.'),
              },
              { status: isConflict ? 409 : 500 }
            );
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
              is_bot_active: true,
              bot_paused: false,
              ...proposalMetadata,
            },
            updated_at: new Date().toISOString(),
          };

          const { error: insertErr } = await supabase
            .from('tenants')
            .insert(insertPayload);

          if (insertErr) {
            console.error('[BoonPilot Publish] Supabase insert error:', insertErr);
            return NextResponse.json(
              {
                success: false,
                error: 'INSERT_FAILED',
                message: insertErr.message || 'Gagal membuat toko baru.',
              },
              { status: 500 }
            );
          }
        }
      }
    } catch (dbErr: any) {
      console.error('[BoonPilot Publish] Supabase persistence error:', dbErr);
      return NextResponse.json(
        {
          success: false,
          error: 'DATABASE_ERROR',
          message: dbErr?.message || 'Gagal menyimpan konfigurasi proposal.',
        },
        { status: 500 }
      );
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
