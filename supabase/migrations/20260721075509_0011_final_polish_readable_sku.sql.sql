/*
# Phase 2 Final Polish: Readable SKU generation

## What this migration does
1. Creates `build_readable_sku()` function that generates SKUs in BRAND-COLOR-SIZE format (e.g. NIK-BLK-40).
2. Preserves the existing `next_sku()` sequential function for backward compatibility.
3. Adds a unique partial index on products.barcode if it doesn't already exist.

## Idempotency
- CREATE OR REPLACE — safe to re-run.
*/

CREATE OR REPLACE FUNCTION build_readable_sku(brand_name text DEFAULT NULL, color text DEFAULT NULL, size text DEFAULT NULL, product_name text DEFAULT NULL) RETURNS text AS $$
DECLARE
  brand_prefix text;
  color_prefix text;
  size_part text;
  sku text;
BEGIN
  -- Brand prefix: first 3 chars of brand name, uppercased, alnum only
  IF brand_name IS NOT NULL AND trim(brand_name) <> '' THEN
    brand_prefix := upper(substr(regexp_replace(brand_name, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  ELSIF product_name IS NOT NULL AND trim(product_name) <> '' THEN
    brand_prefix := upper(substr(regexp_replace(product_name, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  ELSE
    brand_prefix := 'PRD';
  END IF;

  -- Color prefix: first 3 chars, uppercased
  IF color IS NOT NULL AND trim(color) <> '' THEN
    color_prefix := upper(substr(regexp_replace(color, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  ELSE
    color_prefix := 'GEN';
  END IF;

  -- Size part
  IF size IS NOT NULL AND trim(size) <> '' THEN
    size_part := regexp_replace(size, '[^A-Za-z0-9]', '', 'g');
  ELSE
    size_part := 'OS';
  END IF;

  sku := brand_prefix || '-' || color_prefix || '-' || size_part;

  -- If duplicate exists, append a numeric suffix
  IF EXISTS (SELECT 1 FROM product_variants WHERE sku = sku) THEN
    DECLARE
      suffix integer := 1;
    BEGIN
      WHILE EXISTS (SELECT 1 FROM product_variants WHERE sku = sku || '-' || suffix::text) LOOP
        suffix := suffix + 1;
      END LOOP;
      sku := sku || '-' || suffix::text;
    END;
  END IF;

  RETURN sku;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unique partial index on products.barcode (non-null only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON products(barcode) WHERE barcode IS NOT NULL;
