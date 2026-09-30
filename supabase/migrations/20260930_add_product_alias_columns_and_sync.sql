-- Migration: Add alias columns (name, is_active, image_url) to products table
-- and configure bidirectional sync trigger between title/name, is_available/is_active, image/image_url

-- 1. Add alias columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name VARCHAR,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Backfill existing rows
UPDATE public.products SET 
  name = COALESCE(name, title),
  is_active = COALESCE(is_active, is_available, true),
  image_url = COALESCE(image_url, image);

-- 3. Create bidirectional sync trigger
CREATE OR REPLACE FUNCTION public.sync_products_fields()
RETURNS TRIGGER AS $func$
BEGIN
  -- Sync title <-> name
  IF NEW.title IS NULL AND NEW.name IS NOT NULL THEN
    NEW.title := NEW.name;
  ELSIF NEW.name IS NULL AND NEW.title IS NOT NULL THEN
    NEW.name := NEW.title;
  END IF;

  -- Sync is_available <-> is_active
  IF NEW.is_available IS NULL AND NEW.is_active IS NOT NULL THEN
    NEW.is_available := NEW.is_active;
  ELSIF NEW.is_active IS NULL AND NEW.is_available IS NOT NULL THEN
    NEW.is_active := NEW.is_available;
  END IF;

  -- Sync image <-> image_url
  IF NEW.image IS NULL AND NEW.image_url IS NOT NULL THEN
    NEW.image := NEW.image_url;
  ELSIF NEW.image_url IS NULL AND NEW.image IS NOT NULL THEN
    NEW.image_url := NEW.image;
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_products_fields ON public.products;
CREATE TRIGGER trg_sync_products_fields
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_products_fields();
