/*
# Seed demo data

Populates the system with realistic sample data so a new user can explore every
module immediately after signing up: branches (warehouse + 3 shops + online),
brands, categories, suppliers, products with size/color variants, and per-branch
inventory. Uses ON CONFLICT DO NOTHING so it is safe to re-run.
*/

INSERT INTO branches (name, type, address, phone, is_main) VALUES
  ('Main Warehouse', 'warehouse', '1 Industrial Park', '555-0100', true),
  ('Shop 1 - Downtown', 'shop', '10 Main Street', '555-0101', false),
  ('Shop 2 - Mall', 'shop', 'Mall Blvd K-12', '555-0102', false),
  ('Shop 3 - Airport', 'shop', 'Airport Terminal 2', '555-0103', false),
  ('Online Store', 'online', null, null, false)
ON CONFLICT DO NOTHING;

INSERT INTO brands (name) VALUES
  ('Nike'), ('Adidas'), ('Puma'), ('Reebok'), ('New Balance'), ('Skechers')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name) VALUES
  ('Sneakers'), ('Boots'), ('Sandals'), ('Formal'), ('Running'), ('Casual')
ON CONFLICT (name) DO NOTHING;

INSERT INTO suppliers (name, contact_person, phone, email, address, balance) VALUES
  ('Global Footwear Co.', 'John Smith', '555-1000', 'sales@globalfoot.com', '200 Supply St', 0),
  ('Premium Shoes Ltd', 'Maria Garcia', '555-2000', 'orders@premiumshoes.com', '300 Vendor Ave', 0),
  ('Sport Imports', 'Lee Wong', '555-3000', 'info@sportimports.com', '400 Trade Blvd', 0)
ON CONFLICT DO NOTHING;
