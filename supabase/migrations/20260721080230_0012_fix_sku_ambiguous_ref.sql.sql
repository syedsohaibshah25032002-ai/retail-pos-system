/*
# Fix: ambiguous column reference in build_readable_sku

The PL/pgSQL variable `sku` conflicts with the column `product_variants.sku`.
Renamed the local variable to `v_sku` to disambiguate.
*/

CREATE OR REPLACE FUNCTION build_readable_sku(brand_name text DEFAULT NULL, color text DEFAULT NULL, size text DEFAULT NULL, product_name text DEFAULT NULL) RETURNS text AS $$
DECLARE
  brand_prefix text;
  color_prefix text;
  size_part text;
  v_sku text;
BEGIN
  IF brand_name IS NOT NULL AND trim(brand_name) <> '' THEN
    brand_prefix := upper(substr(regexp_replace(brand_name, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  ELSIF product_name IS NOT NULL AND trim(product_name) <> '' THEN
    brand_prefix := upper(substr(regexp_replace(product_name, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  ELSE
    brand_prefix := 'PRD';
  END IF;

  IF color IS NOT NULL AND trim(color) <> '' THEN
    color_prefix := upper(substr(regexp_replace(color, '[^A-Za-z0-9]', '', 'g'), 1, 3));
  ELSE
    color_prefix := 'GEN';
  END IF;

  IF size IS NOT NULL AND trim(size) <> '' THEN
    size_part := regexp_replace(size, '[^A-Za-z0-9]', '', 'g');
  ELSE
    size_part := 'OS';
  END IF;

  v_sku := brand_prefix || '-' || color_prefix || '-' || size_part;

  IF EXISTS (SELECT 1 FROM product_variants WHERE product_variants.sku = v_sku) THEN
    DECLARE
      suffix integer := 1;
    BEGIN
      WHILE EXISTS (SELECT 1 FROM product_variants WHERE product_variants.sku = v_sku || '-' || suffix::text) LOOP
        suffix := suffix + 1;
      END LOOP;
      v_sku := v_sku || '-' || suffix::text;
    END;
  END IF;

  RETURN v_sku;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
