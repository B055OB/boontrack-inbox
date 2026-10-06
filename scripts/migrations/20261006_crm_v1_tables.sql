-- ==============================================================================
-- MIGRATION: CRM V1 Core Foundation (Customer Memory Layer & Lifecycle Engine)
-- Author: BoonTrack Core Architecture
-- Date: 2026-10-06
-- ==============================================================================

-- 1. Table: contacts
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone_e164 VARCHAR(32) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    contact_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    lifecycle_stage VARCHAR(32) NOT NULL DEFAULT 'LEAD',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contacts_tenant_phone UNIQUE (tenant_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_lookup ON public.contacts(tenant_id, phone_e164);
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle ON public.contacts(tenant_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_last_interaction ON public.contacts(tenant_id, last_interaction_at DESC);

-- 2. Table: contact_channel_identities
CREATE TABLE IF NOT EXISTS public.contact_channel_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL,
    identifier VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_channel_identities UNIQUE (tenant_id, channel, identifier)
);

CREATE INDEX IF NOT EXISTS idx_channel_identities_lookup ON public.contact_channel_identities(tenant_id, channel, identifier);

-- 3. Table: tags
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(32) NOT NULL DEFAULT '#6B7280',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tags_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_tenant ON public.tags(tenant_id);

-- 4. Table: contact_tags
CREATE TABLE IF NOT EXISTS public.contact_tags (
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON public.contact_tags(tag_id);

-- 5. Table: contact_notes
CREATE TABLE IF NOT EXISTS public.contact_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    author_id UUID,
    author_name VARCHAR(255),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON public.contact_notes(contact_id, created_at DESC);
