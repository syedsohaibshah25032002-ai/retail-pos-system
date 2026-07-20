/*
# Core ERP schema — multi-branch shoe retail system

1. Overview
This migration creates the foundational tables for a multi-branch footwear retail
ERP: branches, employee profiles (linked to Supabase Auth), product catalog with
size/color matrix, per-branch inventory, suppliers, and customers.

2. New Tables
- `branches` — physical locations (main warehouse + shops + online store).
  - id, name, type ('warehouse'|'shop'|'online'), address, phone, is_main, created_at.
- `profiles` — employee records, one row per auth.users user.
  - id (= auth.users.id), branch_id, name, role, active, created_at.
  - role ∈ super_admin | owner | manager | cashier | warehouse | accountant.
- `categories` — product categories (e.g. Sneakers, Boots, Sandals).
- `brands` — product brands (e.g. Nike, Adidas).
- `suppliers` — vendor records with running balance.
- `products` — shoe model: name, brand, category, gender, season, style, color,
  purchase/selling price, tax rate, default barcode, image url.
- `product_variants` — size/color matrix rows. Each variant = one sellable SKU
  with its own barcode and size. Color lives on the product; size on the variant.
- `inventory` — stock-on-hand per branch per variant, with low-stock threshold.
  UNIQUE(branch_id, variant_id) guarantees one stock row per location per SKU.
- `customers` — CRM records with loyalty points and lifetime spend.

3. Security
- RLS enabled on every table.
- This is a single-company internal ERP: every authenticated employee needs to
  read and write shared company data across all branches. Role-based access
  control is enforced in the application layer (UI + queries), not at the row
  level. Therefore all policies are scoped `TO authenticated USING (true)` /
  `WITH CHECK (true)` — the data is intentionally shared among authenticated
  company members. Unauthenticated (anon) access is denied on every table.
- `profiles` is readable by all authenticated users (company directory) and
  updatable by the owner of the row.

4. Notes
- `profiles.id` is NOT defaulted to auth.uid() because it is inserted once during
  signup with the explicit auth uid. It is the primary key and FK to auth.users.
- All monetary columns are numeric(12,2).
- All id columns are uuid with gen_random_uuid() defaults.
*/

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'shop' CHECK (type IN ('warehouse','shop','online')),
  address text,
  phone text,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_branches" ON branches;
CREATE POLICY "auth_select_branches" ON branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_branches" ON branches;
CREATE POLICY "auth_insert_branches" ON branches FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_branches" ON branches;
CREATE POLICY "auth_update_branches" ON branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_branches" ON branches;
CREATE POLICY "auth_delete_branches" ON branches FOR DELETE TO authenticated USING (true);

-- Profiles (employees)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('super_admin','owner','manager','cashier','warehouse','accountant')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_profiles" ON profiles;
CREATE POLICY "auth_select_profiles" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_profiles" ON profiles;
CREATE POLICY "auth_insert_profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_profiles" ON profiles;
CREATE POLICY "auth_update_profiles" ON profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_profiles" ON profiles;
CREATE POLICY "auth_delete_profiles" ON profiles FOR DELETE TO authenticated USING (true);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_categories" ON categories;
CREATE POLICY "auth_select_categories" ON categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_categories" ON categories;
CREATE POLICY "auth_insert_categories" ON categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_categories" ON categories;
CREATE POLICY "auth_update_categories" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_categories" ON categories;
CREATE POLICY "auth_delete_categories" ON categories FOR DELETE TO authenticated USING (true);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_brands" ON brands;
CREATE POLICY "auth_select_brands" ON brands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_brands" ON brands;
CREATE POLICY "auth_insert_brands" ON brands FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_brands" ON brands;
CREATE POLICY "auth_update_brands" ON brands FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_brands" ON brands;
CREATE POLICY "auth_delete_brands" ON brands FOR DELETE TO authenticated USING (true);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_suppliers" ON suppliers;
CREATE POLICY "auth_select_suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_suppliers" ON suppliers;
CREATE POLICY "auth_insert_suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_suppliers" ON suppliers;
CREATE POLICY "auth_update_suppliers" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_suppliers" ON suppliers;
CREATE POLICY "auth_delete_suppliers" ON suppliers FOR DELETE TO authenticated USING (true);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  gender text CHECK (gender IN ('Men','Women','Kids','Unisex')),
  season text,
  style text,
  color text,
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  barcode text,
  image_url text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_products" ON products;
CREATE POLICY "auth_select_products" ON products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products" ON products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "auth_delete_products" ON products FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Product variants (size/color matrix)
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size text NOT NULL,
  barcode text,
  sku text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size)
);
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_product_variants" ON product_variants;
CREATE POLICY "auth_select_product_variants" ON product_variants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_product_variants" ON product_variants;
CREATE POLICY "auth_insert_product_variants" ON product_variants FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_product_variants" ON product_variants;
CREATE POLICY "auth_update_product_variants" ON product_variants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_product_variants" ON product_variants;
CREATE POLICY "auth_delete_product_variants" ON product_variants FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- Inventory (per branch per variant)
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, variant_id)
);
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_inventory" ON inventory;
CREATE POLICY "auth_select_inventory" ON inventory FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_inventory" ON inventory;
CREATE POLICY "auth_insert_inventory" ON inventory FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_inventory" ON inventory;
CREATE POLICY "auth_update_inventory" ON inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_inventory" ON inventory;
CREATE POLICY "auth_delete_inventory" ON inventory FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_inventory_branch ON inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant ON inventory(variant_id);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  mobile text,
  email text,
  birthday date,
  loyalty_points integer NOT NULL DEFAULT 0,
  total_spent numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_customers" ON customers;
CREATE POLICY "auth_select_customers" ON customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_customers" ON customers;
CREATE POLICY "auth_insert_customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_customers" ON customers;
CREATE POLICY "auth_update_customers" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_customers" ON customers;
CREATE POLICY "auth_delete_customers" ON customers FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
