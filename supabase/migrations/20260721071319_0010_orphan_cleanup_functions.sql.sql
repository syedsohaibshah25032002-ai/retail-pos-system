/*
# Phase 2: Orphaned brand/category cleanup functions

## What this migration does
1. Creates `cleanup_orphaned_brands()` — deletes brands not referenced by any non-deleted product.
2. Creates `cleanup_orphaned_categories()` — deletes categories not referenced by any non-deleted product.

## Security
- Functions are SECURITY DEFINER so they can delete rows regardless of RLS.
- Both functions return the count of deleted rows.

## Idempotency
- CREATE OR REPLACE — safe to re-run.
*/

CREATE OR REPLACE FUNCTION cleanup_orphaned_brands() RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM brands
  WHERE id NOT IN (
    SELECT DISTINCT brand_id FROM products
    WHERE brand_id IS NOT NULL AND deleted_at IS NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_orphaned_categories() RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM categories
  WHERE id NOT IN (
    SELECT DISTINCT category_id FROM products
    WHERE category_id IS NOT NULL AND deleted_at IS NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
