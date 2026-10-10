-- Migration: Seed 2 Digital Products (Sel A & Sel B) for Tenant onlineboost
-- Date: 2026-10-10
-- Single Source of Truth: public.products and public.tenants.metadata.products

DO $$
DECLARE
    v_tenant_id uuid;
    v_existing_meta jsonb;
    v_products_array jsonb;
    v_filtered_products jsonb := '[]'::jsonb;
    v_elem jsonb;
    v_prod_a jsonb;
    v_prod_b jsonb;
BEGIN
    -- 1. Identify onlineboost tenant ID & metadata
    SELECT id, metadata INTO v_tenant_id, v_existing_meta
    FROM public.tenants
    WHERE slug = 'onlineboost'
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Tenant onlineboost not found, skipping seeding.';
        RETURN;
    END IF;

    -- 2. Upsert Produk 1 (Sel A): ACADEMY_CTWA_BATCH1_A
    INSERT INTO public.products (
        id,
        tenant_id,
        sku,
        name,
        title,
        slug,
        price,
        promo_price,
        category,
        product_type,
        is_digital,
        description,
        image,
        image_url,
        stock,
        is_unlimited_stock,
        is_active,
        is_available,
        requires_shipping,
        link_digital,
        asset_reference,
        fulfillment_metadata
    ) VALUES (
        'a1b00571-c74a-4b01-8901-000000000001',
        v_tenant_id,
        'ACADEMY_CTWA_BATCH1_A',
        'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
        'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
        'kelas-inkubasi-ctwa-batch-1-starter',
        99000,
        99000,
        'digital',
        'URL_LINK',
        true,
        'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 3 Kredit Studio.',
        '/images/products/onlineboost-batch1-starter.png',
        '/images/products/onlineboost-batch1-starter.png',
        999,
        true,
        true,
        true,
        false,
        'https://onlineboost.id',
        'https://onlineboost.id',
        jsonb_build_object(
            'delivery_type', 'DOWNLOAD_LINK',
            'access_url', 'https://onlineboost.id',
            'instructions', 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance + 3 Kredit Studio.',
            'button_text', 'Akses Kelas Inkubasi'
        )
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        price = EXCLUDED.price,
        promo_price = EXCLUDED.promo_price,
        category = EXCLUDED.category,
        product_type = EXCLUDED.product_type,
        is_digital = EXCLUDED.is_digital,
        description = EXCLUDED.description,
        image = EXCLUDED.image,
        image_url = EXCLUDED.image_url,
        stock = EXCLUDED.stock,
        is_unlimited_stock = EXCLUDED.is_unlimited_stock,
        is_active = EXCLUDED.is_active,
        is_available = EXCLUDED.is_available,
        requires_shipping = EXCLUDED.requires_shipping,
        link_digital = EXCLUDED.link_digital,
        asset_reference = EXCLUDED.asset_reference,
        fulfillment_metadata = EXCLUDED.fulfillment_metadata;

    -- 3. Upsert Produk 2 (Sel B): ACADEMY_CTWA_BATCH1_B
    INSERT INTO public.products (
        id,
        tenant_id,
        sku,
        name,
        title,
        slug,
        price,
        promo_price,
        category,
        product_type,
        is_digital,
        description,
        image,
        image_url,
        stock,
        is_unlimited_stock,
        is_active,
        is_available,
        requires_shipping,
        link_digital,
        asset_reference,
        fulfillment_metadata
    ) VALUES (
        'b2c00572-c74a-4b01-8902-000000000002',
        v_tenant_id,
        'ACADEMY_CTWA_BATCH1_B',
        'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
        'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
        'kelas-inkubasi-ctwa-batch-1-scale',
        149000,
        149000,
        'digital',
        'URL_LINK',
        true,
        'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 15 Kredit Studio HD + Status Member Toko Selamanya.',
        '/images/products/onlineboost-batch1-scale.png',
        '/images/products/onlineboost-batch1-scale.png',
        999,
        true,
        true,
        true,
        false,
        'https://onlineboost.id',
        'https://onlineboost.id',
        jsonb_build_object(
            'delivery_type', 'DOWNLOAD_LINK',
            'access_url', 'https://onlineboost.id',
            'instructions', 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance + 15 Kredit Studio HD + Status Member Toko Selamanya.',
            'button_text', 'Akses Kelas Inkubasi'
        )
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        price = EXCLUDED.price,
        promo_price = EXCLUDED.promo_price,
        category = EXCLUDED.category,
        product_type = EXCLUDED.product_type,
        is_digital = EXCLUDED.is_digital,
        description = EXCLUDED.description,
        image = EXCLUDED.image,
        image_url = EXCLUDED.image_url,
        stock = EXCLUDED.stock,
        is_unlimited_stock = EXCLUDED.is_unlimited_stock,
        is_active = EXCLUDED.is_active,
        is_available = EXCLUDED.is_available,
        requires_shipping = EXCLUDED.requires_shipping,
        link_digital = EXCLUDED.link_digital,
        asset_reference = EXCLUDED.asset_reference,
        fulfillment_metadata = EXCLUDED.fulfillment_metadata;

    -- 4. Construct JSON objects for metadata.products
    v_prod_a := jsonb_build_object(
        'id', 'a1b00571-c74a-4b01-8901-000000000001',
        'sku', 'ACADEMY_CTWA_BATCH1_A',
        'name', 'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
        'title', 'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
        'slug', 'kelas-inkubasi-ctwa-batch-1-starter',
        'price', 99000,
        'promo_price', 99000,
        'category', 'digital',
        'product_type', 'DIGITAL',
        'type', 'digital',
        'is_digital', true,
        'description', 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 3 Kredit Studio.',
        'image', '/images/products/onlineboost-batch1-starter.png',
        'image_url', '/images/products/onlineboost-batch1-starter.png',
        'images', jsonb_build_array('/images/products/onlineboost-batch1-starter.png'),
        'status', 'ACTIVE',
        'is_active', true,
        'is_available', true,
        'stock', 999,
        'is_unlimited', true,
        'is_unlimited_stock', true,
        'requires_shipping', false,
        'delivery_url', 'https://onlineboost.id',
        'link_digital', 'https://onlineboost.id',
        'download_url', 'https://onlineboost.id',
        'fulfillment_metadata', jsonb_build_object(
            'delivery_type', 'DOWNLOAD_LINK',
            'access_url', 'https://onlineboost.id',
            'instructions', 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance + 3 Kredit Studio.',
            'button_text', 'Akses Kelas Inkubasi'
        )
    );

    v_prod_b := jsonb_build_object(
        'id', 'b2c00572-c74a-4b01-8902-000000000002',
        'sku', 'ACADEMY_CTWA_BATCH1_B',
        'name', 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
        'title', 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
        'slug', 'kelas-inkubasi-ctwa-batch-1-scale',
        'price', 149000,
        'promo_price', 149000,
        'category', 'digital',
        'product_type', 'DIGITAL',
        'type', 'digital',
        'is_digital', true,
        'description', 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 15 Kredit Studio HD + Status Member Toko Selamanya.',
        'image', '/images/products/onlineboost-batch1-scale.png',
        'image_url', '/images/products/onlineboost-batch1-scale.png',
        'images', jsonb_build_array('/images/products/onlineboost-batch1-scale.png'),
        'status', 'ACTIVE',
        'is_active', true,
        'is_available', true,
        'stock', 999,
        'is_unlimited', true,
        'is_unlimited_stock', true,
        'requires_shipping', false,
        'delivery_url', 'https://onlineboost.id',
        'link_digital', 'https://onlineboost.id',
        'download_url', 'https://onlineboost.id',
        'fulfillment_metadata', jsonb_build_object(
            'delivery_type', 'DOWNLOAD_LINK',
            'access_url', 'https://onlineboost.id',
            'instructions', 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance + 15 Kredit Studio HD + Status Member Toko Selamanya.',
            'button_text', 'Akses Kelas Inkubasi'
        )
    );

    -- 5. Filter out existing matching SKUs from metadata.products and append updated objects
    IF v_existing_meta ? 'products' AND jsonb_typeof(v_existing_meta->'products') = 'array' THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_existing_meta->'products')
        LOOP
            IF NOT (
                v_elem->>'sku' IN ('ACADEMY_CTWA_BATCH1_A', 'ACADEMY_CTWA_BATCH1_B') OR
                v_elem->>'id' IN ('a1b00571-c74a-4b01-8901-000000000001', 'b2c00572-c74a-4b01-8902-000000000002')
            ) THEN
                v_filtered_products := v_filtered_products || jsonb_build_array(v_elem);
            END IF;
        END LOOP;
    END IF;

    -- Append new items
    v_filtered_products := v_filtered_products || jsonb_build_array(v_prod_a) || jsonb_build_array(v_prod_b);

    -- Update tenants table
    UPDATE public.tenants
    SET metadata = jsonb_set(
        COALESCE(v_existing_meta, '{}'::jsonb),
        '{products}',
        v_filtered_products,
        true
    )
    WHERE id = v_tenant_id;

    RAISE NOTICE 'Successfully seeded 2 digital products for tenant onlineboost!';
END $$;
