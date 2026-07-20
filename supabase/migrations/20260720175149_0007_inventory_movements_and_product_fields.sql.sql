-- Inventory movements log + product enrichment fields + soft delete + price history
-- Addresses: inventory logging, no negative stock, opening stock fields, product delete safety

-- 1) Product enrichment columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level integer NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

-- 2) Inventory movements log (append-only ledger for every stock change)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase','sale','return','transfer_in','transfer_out','adjustment','manual','opening')),
  quantity_change integer NOT NULL,  -- positive=in, negative=out
  quantity_after integer NOT NULL,
  reference_id uuid,  -- sale_id, po_id, transfer_id, etc.
  reference_type text, -- 'sales','purchase_orders','stock_transfers','sales_returns'
  note text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_inventory_movements" ON inventory_movements;
CREATE POLICY "auth_select_inventory_movements" ON inventory_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_inventory_movements" ON inventory_movements;
CREATE POLICY "auth_insert_inventory_movements" ON inventory_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_movements_variant ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_movements_branch ON inventory_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at);

-- 3) Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  purchase_price numeric(12,2),
  selling_price numeric(12,2),
  changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_price_history" ON price_history;
CREATE POLICY "auth_select_price_history" ON price_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_price_history" ON price_history;
CREATE POLICY "auth_insert_price_history" ON price_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);

-- 4) Constraint to prevent negative stock
ALTER TABLE inventory ADD CONSTRAINT inventory_non_negative CHECK (quantity >= 0);

-- 5) Product images table (for multiple images per product)
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_product_images" ON product_images;
CREATE POLICY "auth_select_product_images" ON product_images FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_product_images" ON product_images;
CREATE POLICY "auth_insert_product_images" ON product_images FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_product_images" ON product_images;
CREATE POLICY "auth_delete_product_images" ON product_images FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
