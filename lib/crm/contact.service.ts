/**
 * @file lib/crm/contact.service.ts
 * @description Core service layer for CRM V1 (Customer Memory Layer & Lifecycle Engine).
 */

import { getSupabase } from '@/lib/supabaseClient';
import {
  Contact,
  Tag,
  ContactNote,
  LifecycleStage,
  ContactChannelIdentity,
  CreateContactInput,
} from './types';
import { toE164 } from './phone-utils';


export class ContactService {
  /**
   * Finds or creates a contact by canonical E.164 phone number.
   * Auto-upserts contact details and updates last_interaction_at.
   */
  public static async getOrCreateContactByPhone(
    tenantId: string,
    rawPhone: string,
    defaultName?: string,
    channelIdentity?: { channel: string; identifier: string }
  ): Promise<Contact> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const canonicalPhone = toE164(rawPhone);
    if (!canonicalPhone) {
      throw new Error(`Invalid phone number format: ${rawPhone}`);
    }

    const now = new Date().toISOString();

    // 1. Try to find existing contact
    const { data: existing, error: findErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone_e164', canonicalPhone)
      .maybeSingle();

    if (findErr) {
      console.error('[ContactService] Error finding contact:', findErr);
    }

    let contact: Contact;

    if (existing) {
      // Update last interaction & name if previously null
      const updates: Record<string, any> = {
        last_interaction_at: now,
        updated_at: now,
      };

      if (!existing.name && defaultName) {
        updates.name = defaultName;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateErr) {
        console.warn('[ContactService] Error updating contact interaction:', updateErr);
        contact = existing as Contact;
      } else {
        contact = updated as Contact;
      }
    } else {
      // Insert new contact with default 'LEAD' lifecycle stage
      const newContactPayload = {
        tenant_id: tenantId,
        phone_e164: canonicalPhone,
        name: defaultName || null,
        contact_status: 'ACTIVE',
        lifecycle_stage: 'LEAD',
        metadata: {},
        last_interaction_at: now,
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(newContactPayload)
        .select('*')
        .single();

      if (insertErr) {
        console.error('[ContactService] Error inserting contact:', insertErr);
        throw insertErr;
      }

      contact = inserted as Contact;
    }

    // 2. Link channel identity if provided (e.g. WhatsApp JID)
    if (channelIdentity && contact?.id) {
      try {
        await supabase
          .from('contact_channel_identities')
          .upsert(
            {
              tenant_id: tenantId,
              contact_id: contact.id,
              channel: channelIdentity.channel,
              identifier: channelIdentity.identifier,
              created_at: now,
            },
            { onConflict: 'tenant_id,channel,identifier' }
          );
      } catch (idErr) {
        console.warn('[ContactService] Channel identity link note:', idErr);
      }
    }

    return contact;
  }

  /**
   * Retrieves a contact with populated tags, notes, and channel identities.
   */
  public static async getContactWithDetails(
    tenantId: string,
    phoneOrId: string
  ): Promise<Contact | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phoneOrId);
    let query = supabase.from('contacts').select('*').eq('tenant_id', tenantId);

    if (isUuid) {
      query = query.eq('id', phoneOrId);
    } else {
      query = query.eq('phone_e164', toE164(phoneOrId));
    }

    const { data: contact, error: cErr } = await query.maybeSingle();
    if (cErr || !contact) return null;

    // Fetch tags via contact_tags
    const { data: tagMappings } = await supabase
      .from('contact_tags')
      .select('tag_id, tags:tag_id (*)')
      .eq('contact_id', contact.id);

    const tags: Tag[] = (tagMappings || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => m.tags)
      .filter(Boolean);

    // Fetch notes
    const { data: notes } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false });

    // Fetch channel identities
    const { data: channels } = await supabase
      .from('contact_channel_identities')
      .select('*')
      .eq('contact_id', contact.id);

    return {
      ...(contact as Contact),
      tags: tags || [],
      notes: (notes as ContactNote[]) || [],
      channels: (channels as ContactChannelIdentity[]) || [],
    };
  }

  /**
   * Updates the lifecycle stage of a contact.
   */
  public static async updateLifecycleStage(
    contactId: string,
    stage: LifecycleStage
  ): Promise<Contact> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('contacts')
      .update({
        lifecycle_stage: stage,
        updated_at: now,
      })
      .eq('id', contactId)
      .select('*')
      .single();

    if (error) {
      console.error('[ContactService] Error updating lifecycle stage:', error);
      throw error;
    }

    return data as Contact;
  }

  /**
   * Fetches all available tags for a tenant.
   */
  public static async getTenantTags(tenantId: string): Promise<Tag[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[ContactService] Error fetching tags:', error);
      return [];
    }

    return (data as Tag[]) || [];
  }

  /**
   * Creates or gets a tag for a tenant.
   */
  public static async createTag(
    tenantId: string,
    name: string,
    color = '#6B7280'
  ): Promise<Tag> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const trimmed = name.trim();
    const { data, error } = await supabase
      .from('tags')
      .upsert(
        {
          tenant_id: tenantId,
          name: trimmed,
          color,
        },
        { onConflict: 'tenant_id,name' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('[ContactService] Error creating tag:', error);
      throw error;
    }

    return data as Tag;
  }

  /**
   * Associates a tag with a contact.
   */
  public static async addTagToContact(contactId: string, tagId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const { error } = await supabase
      .from('contact_tags')
      .insert({
        contact_id: contactId,
        tag_id: tagId,
        created_at: new Date().toISOString(),
      });

    if (error && !error.message.includes('duplicate') && error.code !== '23505') {
      console.error('[ContactService] Error associating tag:', error);
      throw error;
    }
  }

  /**
   * Removes a tag association from a contact.
   */
  public static async removeTagFromContact(contactId: string, tagId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const { error } = await supabase
      .from('contact_tags')
      .delete()
      .eq('contact_id', contactId)
      .eq('tag_id', tagId);

    if (error) {
      console.error('[ContactService] Error removing tag:', error);
      throw error;
    }
  }

  /**
   * Adds an internal staff note to a contact.
   */
  public static async addContactNote(
    contactId: string,
    tenantId: string,
    body: string,
    authorId?: string | null,
    authorName?: string | null
  ): Promise<ContactNote> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const cleanBody = body.trim();
    if (!cleanBody) throw new Error('Catatan tidak boleh kosong');

    const payload = {
      tenant_id: tenantId,
      contact_id: contactId,
      author_id: authorId || null,
      author_name: authorName || 'CS Agent',
      body: cleanBody,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('contact_notes')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('[ContactService] Error adding contact note:', error);
      throw error;
    }

    return data as ContactNote;
  }

  /**
   * Deletes a contact note.
   */
  public static async deleteContactNote(noteId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      console.error('[ContactService] Error deleting contact note:', error);
      throw error;
    }
  }

  /**
   * Resolves a tenant slug or string ID to a canonical UUID from the tenants table.
   */
  public static async resolveTenantId(slugOrId: string | null | undefined): Promise<string | null> {
    if (!slugOrId) return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    if (isUuid) return slugOrId;

    const supabase = getSupabase();
    if (!supabase) return null;

    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slugOrId)
      .maybeSingle();

    return data?.id || null;
  }

  /**
   * Creates or updates a full contact with birth date, lifecycle stage, initial notes, and tags.
   * Auto-upserts into Supabase contacts, tags, and contact_notes.
   */
  public static async createOrUpdateFullContact(
    input: CreateContactInput
  ): Promise<Contact> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Database client not available');

    const canonicalPhone = toE164(input.phone);
    if (!canonicalPhone) {
      throw new Error(`Format nomor WhatsApp tidak valid: ${input.phone}`);
    }

    const tenantUuid = await this.resolveTenantId(input.tenantId);
    if (!tenantUuid) {
      throw new Error(`Tenant tidak ditemukan untuk: ${input.tenantId}`);
    }

    const now = new Date().toISOString();
    const stage = input.lifecycleStage || 'LEAD';

    // 1. Check existing contact by phone & tenant_id
    const { data: existing } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantUuid)
      .eq('phone_e164', canonicalPhone)
      .maybeSingle();

    const existingMeta =
      existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
    const updatedMeta: Record<string, any> = {
      ...existingMeta,
      ...(input.metadata || {}),
      birth_date: input.birthDate !== undefined ? input.birthDate : existingMeta.birth_date,
      tags: input.tags || existingMeta.tags || [],
      initial_complaint: input.initialNotes || existingMeta.initial_complaint || null,
      last_visit_at: input.metadata?.last_visit_at || existingMeta.last_visit_at || now,
    };

    let contact: Contact;

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('contacts')
        .update({
          name: input.name || existing.name,
          email: input.email || existing.email,
          lifecycle_stage: stage,
          metadata: updatedMeta,
          last_interaction_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateErr) throw updateErr;
      contact = updated as Contact;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenantUuid,
          phone_e164: canonicalPhone,
          name: input.name,
          email: input.email || null,
          contact_status: 'ACTIVE',
          lifecycle_stage: stage,
          metadata: updatedMeta,
          last_interaction_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;
      contact = inserted as Contact;
    }

    // 2. Add tags if provided
    if (input.tags && input.tags.length > 0 && contact?.id) {
      for (const tagName of input.tags) {
        if (!tagName.trim()) continue;
        try {
          const tag = await this.createTag(tenantUuid, tagName.trim());
          await this.addTagToContact(contact.id, tag.id);
        } catch (tErr) {
          console.warn('[ContactService] Tag association note:', tErr);
        }
      }
    }

    // 3. Add initial notes if provided
    if (input.initialNotes && input.initialNotes.trim() && contact?.id) {
      try {
        await this.addContactNote(
          contact.id,
          tenantUuid,
          input.initialNotes.trim(),
          null,
          'Admin / Staff'
        );
      } catch (nErr) {
        console.warn('[ContactService] Initial note record note:', nErr);
      }
    }

    return contact;
  }
}

