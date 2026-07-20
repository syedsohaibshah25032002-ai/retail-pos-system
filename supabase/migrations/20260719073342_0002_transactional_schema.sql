/*
# Transactional schema — sales, purchases, transfers, expenses, returns

1. Overview
Adds the tables that record day-to-day operations on top of the core schema:
sales (POS receipts) with line items and payments, purchase orders with line
items, stock transfers between branches, expenses, sales returns, and an
audit log.

2. New Tables
- `sales` — a single sale/receipt header. branch_id, cashier_id, customer_id,
  subtotal, discount, tax, total, status ('completed'|'returned'|'partial'),
  receipt_no (unique human-readable number), created_at.
- `sale_items` — line items per sale. variant_id, qty, unit_price, line_total.
- `payments` — payments per sale. method ('cash'|'card'|'split'), amount,
  cash_amount, card_amount, change_amount.
- `purchase_orders` — PO header. supplier_id, branch_id (receiving branch,
  usually warehouse), status ('draft'|'ordered'|'received'|'partial'),
  total, po_no, created_at.
- `purchase_order_items` — PO line items. variant_id, qty, unit_cost, line_total.
- `stock_transfers` — transfer header. from_branch, to_branch, status
  ('pending'|'approved'|'rejected'|'completed'), created_by, approved_by,
  created_at.
- `stock_transfer_items` — transfer line items. variant_id, qty.
- `expenses` — expense records. branch_id, category, amount, date, note.
- `sales_returns` — return header. original_sale_id, reason, refund_amount,
  refund_type ('cash'|'credit'|'exchange'), created_at.
- `sales_return_items` — returned line items. sale_item_id, qty, exchange_variant_id.
- `audit_log` — append-only action log. user_id, action, entity, entity_id, meta jsonb.

3. Security
- RLS enabled on every table, `TO authenticated` with USING(true)/WITH CHECK(true).
  Same shared-company model as the core schema: every authenticated employee can
  read/write shared company data; RBAC is enforced in the app layer.
- `audit_log` is INSERT-only for authenticated users (no update/delete) to keep
  the audit trail tamper-evident.

4. Notes
- Monetary columns numeric(12,2).
- `sales.receipt_no` and `purchase_orders.po_no` are unique.
- Foreign keys cascade deletes from parent sale/PO/transfer to their items.
*/

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  cashier_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','returned','partial')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_sales" ON sales;
CREATE POLICY "auth_select_sales" ON sales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_sales" ON sales;
CREATE POLICY "auth_insert_sales" ON sales FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_sales" ON sales;
CREATE POLICY "auth_update_sales" ON sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_sales" ON sales;
CREATE POLICY "auth_delete_sales" ON sales FOR DELETE TO authenticated USING (true);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_receipt_no ON sales(receipt_no);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

-- Sale items
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_sale_items" ON sale_items;
CREATE POLICY "auth_select_sale_items" ON sale_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_sale_items" ON sale_items;
CREATE POLICY "auth_insert_sale_items" ON sale_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_sale_items" ON sale_items;
CREATE POLICY "auth_update_sale_items" ON sale_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_sale_items" ON sale_items;
CREATE POLICY "auth_delete_sale_items" ON sale_items FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','split')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_amount numeric(12,2) NOT NULL DEFAULT 0,
  card_amount numeric(12,2) NOT NULL DEFAULT 0,
  change_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_payments" ON payments;
CREATE POLICY "auth_select_payments" ON payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_payments" ON payments;
CREATE POLICY "auth_insert_payments" ON payments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_payments" ON payments;
CREATE POLICY "auth_update_payments" ON payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_payments" ON payments;
CREATE POLICY "auth_delete_payments" ON payments FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','received','partial')),
  total numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_purchase_orders" ON purchase_orders;
CREATE POLICY "auth_select_purchase_orders" ON purchase_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_purchase_orders" ON purchase_orders;
CREATE POLICY "auth_insert_purchase_orders" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_purchase_orders" ON purchase_orders;
CREATE POLICY "auth_update_purchase_orders" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_purchase_orders" ON purchase_orders;
CREATE POLICY "auth_delete_purchase_orders" ON purchase_orders FOR DELETE TO authenticated USING (true);
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_no ON purchase_orders(po_no);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);

-- Purchase order items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  qty integer NOT NULL DEFAULT 1,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_po_items" ON purchase_order_items;
CREATE POLICY "auth_select_po_items" ON purchase_order_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_po_items" ON purchase_order_items;
CREATE POLICY "auth_insert_po_items" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_po_items" ON purchase_order_items;
CREATE POLICY "auth_update_po_items" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_po_items" ON purchase_order_items;
CREATE POLICY "auth_delete_po_items" ON purchase_order_items FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

-- Stock transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_no text NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  to_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_stock_transfers" ON stock_transfers;
CREATE POLICY "auth_select_stock_transfers" ON stock_transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_stock_transfers" ON stock_transfers;
CREATE POLICY "auth_insert_stock_transfers" ON stock_transfers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_stock_transfers" ON stock_transfers;
CREATE POLICY "auth_update_stock_transfers" ON stock_transfers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_stock_transfers" ON stock_transfers;
CREATE POLICY "auth_delete_stock_transfers" ON stock_transfers FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);

-- Stock transfer items
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  qty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_transfer_items" ON stock_transfer_items;
CREATE POLICY "auth_select_transfer_items" ON stock_transfer_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_transfer_items" ON stock_transfer_items;
CREATE POLICY "auth_insert_transfer_items" ON stock_transfer_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_transfer_items" ON stock_transfer_items;
CREATE POLICY "auth_update_transfer_items" ON stock_transfer_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_transfer_items" ON stock_transfer_items;
CREATE POLICY "auth_delete_transfer_items" ON stock_transfer_items FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON stock_transfer_items(transfer_id);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_expenses" ON expenses;
CREATE POLICY "auth_select_expenses" ON expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_expenses" ON expenses;
CREATE POLICY "auth_insert_expenses" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_expenses" ON expenses;
CREATE POLICY "auth_update_expenses" ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_expenses" ON expenses;
CREATE POLICY "auth_delete_expenses" ON expenses FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);

-- Sales returns
CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no text NOT NULL,
  original_sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  refund_type text NOT NULL DEFAULT 'cash' CHECK (refund_type IN ('cash','credit','exchange')),
  reason text,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_sales_returns" ON sales_returns;
CREATE POLICY "auth_select_sales_returns" ON sales_returns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_sales_returns" ON sales_returns;
CREATE POLICY "auth_insert_sales_returns" ON sales_returns FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_sales_returns" ON sales_returns;
CREATE POLICY "auth_update_sales_returns" ON sales_returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_sales_returns" ON sales_returns;
CREATE POLICY "auth_delete_sales_returns" ON sales_returns FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON sales_returns(original_sale_id);

-- Sales return items
CREATE TABLE IF NOT EXISTS sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  qty integer NOT NULL DEFAULT 1,
  exchange_variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sales_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_return_items" ON sales_return_items;
CREATE POLICY "auth_select_return_items" ON sales_return_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_return_items" ON sales_return_items;
CREATE POLICY "auth_insert_return_items" ON sales_return_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_return_items" ON sales_return_items;
CREATE POLICY "auth_update_return_items" ON sales_return_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_return_items" ON sales_return_items;
CREATE POLICY "auth_delete_return_items" ON sales_return_items FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON sales_return_items(return_id);

-- Audit log (insert-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_select_audit_log" ON audit_log;
CREATE POLICY "auth_select_audit_log" ON audit_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_audit_log" ON audit_log;
CREATE POLICY "auth_insert_audit_log" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
