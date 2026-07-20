/*
# Seed demo customers and sample sales

Adds a handful of customers and a spread of completed sales across the three
shops over the last several days so the dashboard, reports, and CRM screens
have realistic data to display on first login.
*/

INSERT INTO customers (name, mobile, email, birthday, loyalty_points, total_spent) VALUES
  ('Alice Johnson', '555-2001', 'alice@example.com', '1990-05-12', 320, 3200),
  ('Bob Chen', '555-2002', 'bob@example.com', '1985-09-23', 150, 1500),
  ('Carla Diaz', '555-2003', 'carla@example.com', '1998-12-01', 80, 800),
  ('David Kim', '555-2004', null, null, 0, 0)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  b_shop1 uuid; b_shop2 uuid; b_shop3 uuid;
  cust_alice uuid; cust_bob uuid; cust_carla uuid;
  v_nike_black_41 uuid; v_nike_black_42 uuid; v_adidas_39 uuid; v_puma_40 uuid; v_skechers_38 uuid; v_reebok_43 uuid;
  sale_id uuid;
  i int;
BEGIN
  SELECT id INTO b_shop1 FROM branches WHERE name='Shop 1 - Downtown';
  SELECT id INTO b_shop2 FROM branches WHERE name='Shop 2 - Mall';
  SELECT id INTO b_shop3 FROM branches WHERE name='Shop 3 - Airport';
  SELECT id INTO cust_alice FROM customers WHERE mobile='555-2001';
  SELECT id INTO cust_bob FROM customers WHERE mobile='555-2002';
  SELECT id INTO cust_carla FROM customers WHERE mobile='555-2003';

  SELECT pv.id INTO v_nike_black_41 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.name='Nike Air Max' AND p.color='Black' AND pv.size='41' LIMIT 1;
  SELECT pv.id INTO v_nike_black_42 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.name='Nike Air Max' AND p.color='Black' AND pv.size='42' LIMIT 1;
  SELECT pv.id INTO v_adidas_39 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.name='Adidas Ultraboost' AND pv.size='39' LIMIT 1;
  SELECT pv.id INTO v_puma_40 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.name='Puma Suede Classic' AND pv.size='40' LIMIT 1;
  SELECT pv.id INTO v_skechers_38 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.name='Skechers Sandals' AND pv.size='38' LIMIT 1;
  SELECT pv.id INTO v_reebok_43 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.name='Reebok Leather Boot' AND pv.size='43' LIMIT 1;

  -- A few sales spread over the last 5 days
  FOR i IN 1..5 LOOP
    sale_id := gen_random_uuid();
    INSERT INTO sales (id, receipt_no, branch_id, cashier_id, customer_id, subtotal, discount, tax, total, status, created_at)
    VALUES (sale_id, 'R-SEED-' || i, b_shop1, null, cust_alice, 120, 0, 0, 120, 'completed', now() - (i || ' days')::interval);

    INSERT INTO sale_items (sale_id, variant_id, qty, unit_price, line_total)
    VALUES (sale_id, v_nike_black_41, 1, 120, 120);

    INSERT INTO payments (sale_id, method, amount, cash_amount) VALUES (sale_id, 'cash', 120, 120);

    -- decrement inventory
    UPDATE inventory SET quantity = GREATEST(0, quantity - 1) WHERE branch_id = b_shop1 AND variant_id = v_nike_black_41;
  END LOOP;

  -- shop 2 sales
  sale_id := gen_random_uuid();
  INSERT INTO sales (id, receipt_no, branch_id, cashier_id, customer_id, subtotal, discount, tax, total, status, created_at)
  VALUES (sale_id, 'R-SEED-6', b_shop2, null, cust_bob, 150, 10, 0, 140, 'completed', now() - '2 days'::interval);
  INSERT INTO sale_items (sale_id, variant_id, qty, unit_price, line_total) VALUES (sale_id, v_adidas_39, 1, 150, 150);
  INSERT INTO payments (sale_id, method, amount, card_amount) VALUES (sale_id, 'card', 140, 140);
  UPDATE inventory SET quantity = GREATEST(0, quantity - 1) WHERE branch_id = b_shop2 AND variant_id = v_adidas_39;

  sale_id := gen_random_uuid();
  INSERT INTO sales (id, receipt_no, branch_id, cashier_id, customer_id, subtotal, discount, tax, total, status, created_at)
  VALUES (sale_id, 'R-SEED-7', b_shop2, null, cust_carla, 80, 0, 0, 80, 'completed', now() - '1 day'::interval);
  INSERT INTO sale_items (sale_id, variant_id, qty, unit_price, line_total) VALUES (sale_id, v_puma_40, 1, 80, 80);
  INSERT INTO payments (sale_id, method, amount, cash_amount) VALUES (sale_id, 'cash', 80, 80);
  UPDATE inventory SET quantity = GREATEST(0, quantity - 1) WHERE branch_id = b_shop2 AND variant_id = v_puma_40;

  -- shop 3 sales
  sale_id := gen_random_uuid();
  INSERT INTO sales (id, receipt_no, branch_id, cashier_id, customer_id, subtotal, discount, tax, total, status, created_at)
  VALUES (sale_id, 'R-SEED-8', b_shop3, null, null, 180, 0, 0, 180, 'completed', now() - '3 hours'::interval);
  INSERT INTO sale_items (sale_id, variant_id, qty, unit_price, line_total) VALUES (sale_id, v_reebok_43, 1, 180, 180);
  INSERT INTO payments (sale_id, method, amount, cash_amount) VALUES (sale_id, 'cash', 180, 180);
  UPDATE inventory SET quantity = GREATEST(0, quantity - 1) WHERE branch_id = b_shop3 AND variant_id = v_reebok_43;

  sale_id := gen_random_uuid();
  INSERT INTO sales (id, receipt_no, branch_id, cashier_id, customer_id, subtotal, discount, tax, total, status, created_at)
  VALUES (sale_id, 'R-SEED-9', b_shop3, null, cust_alice, 50, 0, 0, 50, 'completed', now() - '1 hour'::interval);
  INSERT INTO sale_items (sale_id, variant_id, qty, unit_price, line_total) VALUES (sale_id, v_skechers_38, 1, 50, 50);
  INSERT INTO payments (sale_id, method, amount, card_amount) VALUES (sale_id, 'card', 50, 50);
  UPDATE inventory SET quantity = GREATEST(0, quantity - 1) WHERE branch_id = b_shop3 AND variant_id = v_skechers_38;
END $$;

-- a couple of expenses
INSERT INTO expenses (branch_id, category, amount, expense_date, note) VALUES
  ((SELECT id FROM branches WHERE name='Shop 1 - Downtown'), 'Rent', 2000, CURRENT_DATE, 'Monthly rent'),
  ((SELECT id FROM branches WHERE name='Shop 2 - Mall'), 'Electricity', 350, CURRENT_DATE, 'Electric bill'),
  ((SELECT id FROM branches WHERE name='Main Warehouse'), 'Salaries', 5000, CURRENT_DATE, 'Warehouse staff')
ON CONFLICT DO NOTHING;
