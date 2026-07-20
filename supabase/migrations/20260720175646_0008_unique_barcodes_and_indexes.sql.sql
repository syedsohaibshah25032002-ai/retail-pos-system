-- Add unique partial indexes on barcodes to prevent duplicates
-- Only applies to non-deleted products and non-null barcodes
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON products(barcode) WHERE deleted_at IS NULL AND barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_barcode_unique
  ON product_variants(barcode) WHERE barcode IS NOT NULL;

-- Add index on inventory_movements for reference lookups
CREATE INDEX IF NOT EXISTS idx_movements_reference ON inventory_movements(reference_id) WHERE reference_id IS NOT NULL;
