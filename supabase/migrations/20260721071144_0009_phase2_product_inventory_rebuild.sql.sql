/*
# Phase 2: Product/Barcode/Inventory Rebuild — Schema Hardening

## What this migration does

1. **Sequential barcode generation** — replaces random barcodes with a monotonic sequence starting at 890100000001, guaranteed unique and never reused.
2. **Sequential SKU generation** — a PL/pgSQL function that generates SKUs from a product name prefix + zero-padded sequence (e.g. SHU-000001).
3. **Unique constraint on product_variants.sku** — prevents duplicate SKUs at the database level.
4. **updated_at column on products** — tracks last modification timestamp with an auto-update trigger.
5. **Purchase returns tables** — `purchase_returns` + `purchase_return_items` to support returning goods to suppliers (decreases stock).
6. **Performance indexes** — on sku, barcode, name for sub-100ms lookups.
7. **CHECK constraints** — prevent negative prices and blank product names.

## New Tables
- `purchase_returns` — header for a return-to-supplier transaction
- `purchase_return_items` — line items within a purchase return
- `barcode_seq` — durable sequence table for barcode generation
- `sku_seq` — durable sequence table for SKU generation

## Modified Tables
- `products` — added `updated_at timestamptz`
- `product_variants` — unique index on `sku` (partial, non-null only)

## Security
- RLS enabled on purchase_returns + purchase_return_items with anon+authenticated CRUD.

## Idempotency
- All statements use IF NOT EXISTS / DO blocks. Safe to re-run.
*/

-- 1. Auto-update trigger function (must exist before trigger creation)
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. updated_at on products
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='updated_at') THEN
    ALTER TABLE products ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Unique partial index on product_variants.sku (only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_sku_unique
  ON product_variants(sku) WHERE sku IS NOT NULL;

-- 4. Performance indexes for POS search (<100ms)
CREATE INDEX IF NOT EXISTS idx_variants_barcode_idx ON product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_sku_idx ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_variant_branch ON inventory(variant_id, branch_id);

-- 5. CHECK constraints for data integrity
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_name_notblank') THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_name_notblank CHECK (length(trim(name)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_prices_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_prices_nonneg CHECK (purchase_price >= 0 AND selling_price >= 0 AND tax_rate >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_qty_nonneg') THEN
    ALTER TABLE inventory ADD CONSTRAINT chk_inventory_qty_nonneg CHECK (quantity >= 0);
  END IF;
END $$;

-- 6. Sequence tables for barcode and SKU generation (durable across instances)
CREATE TABLE IF NOT EXISTS barcode_seq (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM barcode_seq) THEN
    INSERT INTO barcode_seq VALUES (default);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sku_seq (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM sku_seq) THEN
    INSERT INTO sku_seq VALUES (default);
  END IF;
END $$;

-- 7. Sequential barcode generator: returns 890100000001, 890100000002, ...
CREATE OR REPLACE FUNCTION next_barcode() RETURNS text AS $$
DECLARE
  next_val bigint;
BEGIN
  INSERT INTO barcode_seq (id) VALUES (default) RETURNING currval('barcode_seq_id_seq') INTO next_val;
  RETURN lpad((890100000000 + next_val)::text, 12, '0');
END;
$$ LANGUAGE plpgsql;

-- 8. Sequential SKU generator: prefix-NNNNNN (e.g. SHU-000001)
CREATE OR REPLACE FUNCTION next_sku(prefix text DEFAULT 'PRD') RETURNS text AS $$
DECLARE
  next_val bigint;
  clean_prefix text;
BEGIN
  clean_prefix := upper(substr(regexp_replace(prefix, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  IF clean_prefix = '' THEN clean_prefix := 'PRD'; END IF;
  INSERT INTO sku_seq (id) VALUES (default) RETURNING currval('sku_seq_id_seq') INTO next_val;
  RETURN clean_prefix || '-' || lpad(next_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 9. Purchase returns tables
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no text NOT NULL,
  po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_crud_select" ON purchase_returns;
CREATE POLICY "pr_crud_select" ON purchase_returns FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pr_crud_insert" ON purchase_returns;
CREATE POLICY "pr_crud_insert" ON purchase_returns FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pr_crud_update" ON purchase_returns;
CREATE POLICY "pr_crud_update" ON purchase_returns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pr_crud_delete" ON purchase_returns;
CREATE POLICY "pr_crud_delete" ON purchase_returns FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pri_crud_select" ON purchase_return_items;
CREATE POLICY "pri_crud_select" ON purchase_return_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pri_crud_insert" ON purchase_return_items;
CREATE POLICY "pri_crud_insert" ON purchase_return_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pri_crud_update" ON purchase_return_items;
CREATE POLICY "pri_crud_update" ON purchase_return_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pri_crud_delete" ON purchase_return_items;
CREATE POLICY "pri_crud_delete" ON purchase_return_items FOR DELETE TO anon, authenticated USING (true);

-- 10. Indexes on inventory_movements for reporting
CREATE INDEX IF NOT EXISTS idx_movements_type_date ON inventory_movements(movement_type, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_variant ON inventory_movements(variant_id, created_at);
