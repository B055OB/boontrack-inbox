-- Migration: Add quantity and unit_price to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unit_price NUMERIC;

COMMENT ON COLUMN public.orders.quantity IS 'Total item quantity ordered by customer';
COMMENT ON COLUMN public.orders.unit_price IS 'Unit price per product item before multiplication';
