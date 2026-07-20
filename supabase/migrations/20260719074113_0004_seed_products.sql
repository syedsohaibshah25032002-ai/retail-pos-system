/*
# Seed products, variants, and inventory

Creates a realistic footwear catalog (Nike Air Max, Adidas Ultraboost, etc.)
across brands and categories, each with multiple size variants, then distributes
stock across the warehouse and three shops. Uses a PL/pgSQL DO block to resolve
brand/category/branch IDs by name so the seed is order-independent.
*/

DO $$
DECLARE
  b_warehouse uuid; b_shop1 uuid; b_shop2 uuid; b_shop3 uuid; b_online uuid;
  b_nike uuid; b_adidas uuid; b_puma uuid; b_reebok uuid; b_nb uuid; b_skechers uuid;
  c_sneakers uuid; c_running uuid; c_boots uuid; c_formal uuid; c_casual uuid; c_sandals uuid;
  prod_id uuid;
  v_id uuid;
  sizes text[] := ARRAY['38','39','40','41','42','43','44'];
  s text;
BEGIN
  SELECT id INTO b_warehouse FROM branches WHERE name = 'Main Warehouse';
  SELECT id INTO b_shop1 FROM branches WHERE name = 'Shop 1 - Downtown';
  SELECT id INTO b_shop2 FROM branches WHERE name = 'Shop 2 - Mall';
  SELECT id INTO b_shop3 FROM branches WHERE name = 'Shop 3 - Airport';
  SELECT id INTO b_online FROM branches WHERE name = 'Online Store';

  SELECT id INTO b_nike FROM brands WHERE name='Nike';
  SELECT id INTO b_adidas FROM brands WHERE name='Adidas';
  SELECT id INTO b_puma FROM brands WHERE name='Puma';
  SELECT id INTO b_reebok FROM brands WHERE name='Reebok';
  SELECT id INTO b_nb FROM brands WHERE name='New Balance';
  SELECT id INTO b_skechers FROM brands WHERE name='Skechers';

  SELECT id INTO c_sneakers FROM categories WHERE name='Sneakers';
  SELECT id INTO c_running FROM categories WHERE name='Running';
  SELECT id INTO c_boots FROM categories WHERE name='Boots';
  SELECT id INTO c_formal FROM categories WHERE name='Formal';
  SELECT id INTO c_casual FROM categories WHERE name='Casual';
  SELECT id INTO c_sandals FROM categories WHERE name='Sandals';

  -- Helper to create a product + its size variants + inventory across branches
  -- Nike Air Max (black)
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('Nike Air Max', b_nike, c_sneakers, 'Men', 'Summer 2026', 'Lifestyle', 'Black', 60.00, 120.00, 0, '500000000001')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY sizes LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '50' || s || '001') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 80, 10), (b_shop1, v_id, 12, 5), (b_shop2, v_id, 8, 5), (b_shop3, v_id, 5, 5)
    ON CONFLICT (branch_id, variant_id) DO NOTHING;
  END LOOP;

  -- Nike Air Max (white)
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('Nike Air Max', b_nike, c_sneakers, 'Men', 'Summer 2026', 'Lifestyle', 'White', 60.00, 120.00, 0, '500000000002')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY sizes LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '50' || s || '002') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 60, 10), (b_shop1, v_id, 10, 5), (b_shop2, v_id, 6, 5), (b_shop3, v_id, 4, 5)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Adidas Ultraboost
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('Adidas Ultraboost', b_adidas, c_running, 'Women', 'Spring 2026', 'Running', 'Grey', 75.00, 150.00, 0, '500000000003')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY ARRAY['36','37','38','39','40','41'] LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '51' || s || '003') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 50, 10), (b_shop1, v_id, 8, 5), (b_shop2, v_id, 7, 5), (b_shop3, v_id, 3, 5)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Puma Suede Classic
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('Puma Suede Classic', b_puma, c_casual, 'Unisex', 'All Season', 'Casual', 'Blue', 40.00, 80.00, 0, '500000000004')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY sizes LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '52' || s || '004') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 40, 10), (b_shop1, v_id, 6, 5), (b_shop2, v_id, 5, 5), (b_shop3, v_id, 2, 5)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Reebok Leather Boot
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('Reebok Leather Boot', b_reebok, c_boots, 'Men', 'Winter 2026', 'Boot', 'Brown', 90.00, 180.00, 0, '500000000005')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY ARRAY['40','41','42','43','44','45'] LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '53' || s || '005') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 30, 8), (b_shop1, v_id, 4, 3), (b_shop2, v_id, 3, 3), (b_shop3, v_id, 2, 3)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- New Balance Formal
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('New Balance Oxford', b_nb, c_formal, 'Men', 'All Season', 'Formal', 'Black', 55.00, 110.00, 0, '500000000006')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY ARRAY['40','41','42','43','44'] LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '54' || s || '006') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 25, 5), (b_shop1, v_id, 3, 3), (b_shop2, v_id, 2, 3), (b_shop3, v_id, 1, 3)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Skechers Sandals
  INSERT INTO products (name, brand_id, category_id, gender, season, style, color, purchase_price, selling_price, tax_rate, barcode)
  VALUES ('Skechers Sandals', b_skechers, c_sandals, 'Women', 'Summer 2026', 'Sandal', 'Pink', 25.00, 50.00, 0, '500000000007')
  RETURNING id INTO prod_id;
  FOREACH s IN ARRAY ARRAY['36','37','38','39','40'] LOOP
    INSERT INTO product_variants (product_id, size, barcode) VALUES (prod_id, s, '55' || s || '007') RETURNING id INTO v_id;
    INSERT INTO inventory (branch_id, variant_id, quantity, low_stock_threshold) VALUES
      (b_warehouse, v_id, 100, 15), (b_shop1, v_id, 15, 8), (b_shop2, v_id, 12, 8), (b_shop3, v_id, 8, 8)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
