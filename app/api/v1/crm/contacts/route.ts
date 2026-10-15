import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { ContactService } from '@/lib/crm/contact.service';
import { toE164 } from '@/lib/crm/phone-utils';

export const dynamic = 'force-dynamic';

/** Use service-role client for server-side read to bypass RLS on contacts */
function getDbClient() {
  return getSupabaseAdmin() || getSupabase();
}

export interface CrmContactDto {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  productInterest: string;
  leadScore: number;
  quality: 'HOT' | 'WARM' | 'COLD' | 'CUSTOMER';
  utmSource: string;
  totalOrders: number;
  totalSpend: number;
  createdAt: string;
  lastContacted?: string;
}

/**
 * GET /api/v1/crm/contacts
 * Query parameter: tenant_id (or tenant_slug)
 * Single source of truth: Supabase `contacts`, `contact_tags`, `tags`
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTenant =
      searchParams.get('tenant_id') ||
      searchParams.get('tenant_slug') ||
      searchParams.get('tenant') ||
      searchParams.get('slug') ||
      '';

    const tenantQuery = rawTenant.trim().toLowerCase();
    if (!tenantQuery) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant_id wajib diisi' },
        { status: 400 }
      );
    }

    const supabase = getDbClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database client tidak tersedia' },
        { status: 500 }
      );
    }

    // Dynamically resolve both UUID and slug from tenants table (Zero Hardcoding)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantQuery);
    let tenantUuid: string | null = null;
    let tenantSlug: string | null = null;

    let tenantRow: any = null;
    if (isUuid) {
      const { data } = await supabase
        .from('tenants')
        .select('id, slug')
        .eq('id', tenantQuery)
        .maybeSingle();
      tenantRow = data;
    } else {
      const { data } = await supabase
        .from('tenants')
        .select('id, slug')
        .eq('slug', tenantQuery)
        .maybeSingle();
      tenantRow = data;
    }

    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: `Tenant tidak ditemukan untuk: ${tenantQuery}` },
        { status: 404 }
      );
    }

    const resolvedTenantUuid = tenantRow.id;
    if (!resolvedTenantUuid) {
      return NextResponse.json(
        { success: false, error: 'Tenant UUID tidak valid' },
        { status: 400 }
      );
    }
    tenantUuid = resolvedTenantUuid;
    tenantSlug = tenantRow.slug || null;

    // Single contact lookup by phone or contact_id (Console CS / Customer Memory loader)
    const singlePhone = searchParams.get('phone');
    const singleContactId = searchParams.get('contact_id');
    const customerName = searchParams.get('name') || undefined;

    if (singlePhone || singleContactId) {
      let contact: any = null;
      if (singleContactId) {
        contact = await ContactService.getContactWithDetails(resolvedTenantUuid, singleContactId, supabase);
      } else if (singlePhone) {
        const canonicalPhone = toE164(singlePhone);
        const c = await ContactService.getOrCreateContactByPhone(resolvedTenantUuid, canonicalPhone, customerName, undefined, supabase);
        contact = await ContactService.getContactWithDetails(resolvedTenantUuid, c.id, supabase);
      }

      const tenantTags = await ContactService.getTenantTags(resolvedTenantUuid, supabase);

      return NextResponse.json({
        success: true,
        contact: contact || null,
        tags: tenantTags || [],
        tenant_tags: tenantTags || [],
        tenant_id: resolvedTenantUuid,
        tenant_slug: tenantSlug,
      });
    }

    // 1. Fetch all contacts — dual-clause: WHERE tenant_id = UUID OR tenant_slug = slug
    const orTokens: string[] = [];
    if (tenantUuid) orTokens.push(`tenant_id.eq.${tenantUuid}`);
    if (tenantSlug) orTokens.push(`tenant_slug.eq.${tenantSlug}`);

    const orClause = orTokens.join(',');

    const { data: dbContacts, error: contactsErr } = await supabase
      .from('contacts')
      .select('id, tenant_id, tenant_slug, phone_e164, name, email, contact_status, lifecycle_stage, metadata, last_interaction_at, created_at, updated_at')
      .or(orClause)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (contactsErr) {
      console.error('[CRM Contacts API] Error fetching contacts:', contactsErr);
      return NextResponse.json(
        { success: false, error: contactsErr.message },
        { status: 500 }
      );
    }

    // 2. Fetch all tags defined for this tenant in `tags` table
    let dbTags: any[] | null = null;
    if (tenantUuid) {
      const { data } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('tenant_id', tenantUuid);
      dbTags = data;
    }

    const tagMap = new Map<string, string>();
    const allUniqueTagsSet = new Set<string>();
    if (Array.isArray(dbTags)) {
      for (const t of dbTags) {
        if (t.id && t.name) {
          tagMap.set(t.id, t.name);
          allUniqueTagsSet.add(t.name.trim());
        }
      }
    }

    // 3. Fetch tag mappings for this tenant's tags (query by tag_id chunks to prevent massive URL limit errors)
    const tagIds = Array.from(tagMap.keys());
    const contactTagsMap = new Map<string, string[]>();

    if (tagIds.length > 0) {
      for (let i = 0; i < tagIds.length; i += 50) {
        const tagChunk = tagIds.slice(i, i + 50);
        const { data: mappingData } = await supabase
          .from('contact_tags')
          .select('contact_id, tag_id')
          .in('tag_id', tagChunk);

        if (Array.isArray(mappingData)) {
          for (const m of mappingData) {
            const tagName = tagMap.get(m.tag_id);
            if (tagName) {
              const current = contactTagsMap.get(m.contact_id) || [];
              current.push(tagName);
              contactTagsMap.set(m.contact_id, current);
              allUniqueTagsSet.add(tagName);
            }
          }
        }
      }
    }

    // 4. Map DB contacts to CrmContactDto
    const formattedContacts: CrmContactDto[] = (dbContacts || []).map((c: any) => {
      const explicitTags = contactTagsMap.get(c.id) || [];
      const metaTags = Array.isArray(c.metadata?.tags) ? c.metadata.tags : [];
      const combinedTags = Array.from(new Set([...explicitTags, ...metaTags])).filter(Boolean);

      combinedTags.forEach((t) => allUniqueTagsSet.add(t));

      const isCustomer = c.lifecycle_stage === 'CUSTOMER';
      const score = c.metadata?.lead_score || (isCustomer ? 100 : c.lifecycle_stage === 'QUALIFIED' ? 90 : 80);
      const quality = isCustomer ? 'CUSTOMER' : score >= 85 ? 'HOT' : 'WARM';

      const createdAtFormatted = c.created_at
        ? new Date(c.created_at).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : 'Baru Saja';

      const lastContactedFormatted = c.last_interaction_at
        ? new Date(c.last_interaction_at).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : 'Baru Saja Terdata';

      return {
        id: c.id,
        name: c.name || 'Prospek',
        phone: c.phone_e164 || '',
        tags: combinedTags,
        productInterest: c.metadata?.product_interest || c.metadata?.interest || 'Produk Toko',
        leadScore: Number(score),
        quality: quality as any,
        utmSource: c.metadata?.utm_source || c.metadata?.source || 'Direct Web',
        totalOrders: Number(c.metadata?.total_orders || (isCustomer ? 1 : 0)),
        totalSpend: Number(c.metadata?.total_spend || 0),
        createdAt: createdAtFormatted,
        lastContacted: lastContactedFormatted,
      };
    });

    const uniqueTagsList = Array.from(allUniqueTagsSet).filter(Boolean);

    return NextResponse.json({
      success: true,
      contacts: formattedContacts,
      data: formattedContacts,
      total: formattedContacts.length,
      tags: uniqueTagsList,
      unique_tags: uniqueTagsList,
      tenant_id: tenantUuid || tenantQuery,
      tenant_slug: tenantQuery,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[CRM Contacts API] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/crm/contacts
 * Manually add/upsert a contact via ContactService or perform contact sub-actions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant_id,
      tenant_slug,
      name,
      phone,
      email,
      tags,
      initialNotes,
      productInterest,
      action,
      contact_id,
      stage,
      tag_id,
      note_id,
      color,
      author_id,
      author_name,
    } = body;

    const rawTenant = tenant_id || tenant_slug;
    if (!rawTenant) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant_id atau tenant_slug wajib diisi' },
        { status: 400 }
      );
    }

    const tenantUuid = await ContactService.resolveTenantId(rawTenant);
    if (!tenantUuid) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan' },
        { status: 404 }
      );
    }

    const supabase = getDbClient();

    // 1. Sub-actions from UI components (ContactSidebar / Console CS)
    if (action === 'UPDATE_STAGE' && contact_id && stage) {
      const updated = await ContactService.updateLifecycleStage(contact_id, stage, supabase);
      return NextResponse.json({ success: true, contact: updated });
    }

    if (action === 'CREATE_AND_ADD_TAG' && contact_id && name) {
      const tag = await ContactService.createTag(tenantUuid, name.trim(), color || '#4F46E5', supabase);
      await ContactService.addTagToContact(contact_id, tag.id, supabase);
      const updated = await ContactService.getContactWithDetails(tenantUuid, contact_id, supabase);
      return NextResponse.json({ success: true, contact: updated, tag });
    }

    if (action === 'REMOVE_TAG' && contact_id && tag_id) {
      await ContactService.removeTagFromContact(contact_id, tag_id, supabase);
      return NextResponse.json({ success: true });
    }

    if (action === 'ADD_NOTE' && contact_id && body.body) {
      const note = await ContactService.addContactNote(
        contact_id,
        tenantUuid,
        body.body,
        author_id,
        author_name,
        supabase
      );
      return NextResponse.json({ success: true, note });
    }

    if (action === 'DELETE_NOTE' && note_id) {
      await ContactService.deleteContactNote(note_id, supabase);
      return NextResponse.json({ success: true });
    }

    // 2. Default Action: Create or update full contact
    if (!phone || !String(phone).trim()) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp wajib diisi' },
        { status: 400 }
      );
    }

    const contact = await ContactService.createOrUpdateFullContact({
      tenantId: tenantUuid,
      name: name?.trim() || 'Prospek Baru',
      phone: String(phone).trim(),
      email: email?.trim(),
      tags: Array.isArray(tags) ? tags : tags ? [tags] : ['Manual Input'],
      initialNotes: initialNotes?.trim(),
      metadata: {
        product_interest: productInterest || 'Katalog Toko',
        source: 'MANUAL_DASHBOARD',
      },
    }, supabase);

    return NextResponse.json({
      success: true,
      contact,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
