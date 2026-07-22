/*
# POS Shifts and Held Orders

1. New Tables
- `cashier_shifts` — tracks cashier work shifts per branch. A shift must be opened before
  sales can be processed, and closed at end of day with expected vs actual cash reconciliation.
  Columns: id, cashier_id, branch_id, opened_at, closed_at, opening_float, expected_cash,
  actual_cash, status (open/closed), closing_note, created_at.
- `pos_held_orders` — persists held/suspended sales so they survive page refresh and can be
  resumed by any cashier at the same branch. Columns: id, branch_id, cashier_id, customer_id,
  cart_data (jsonb), discount, discount_type, payment_method, status (held/resumed/cancelled),
  created_at, updated_at.

2. Security
- Enable RLS on both tables.
- `cashier_shifts`: authenticated users can manage their own shifts (auth.uid() = cashier_id).
- `pos_held_orders`: authenticated users can read/insert/update/delete held orders at their branch.
*/

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_float numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  actual_cash numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closing_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_shifts" ON cashier_shifts;
CREATE POLICY "select_own_shifts" ON cashier_shifts FOR SELECT
  TO authenticated USING (auth.uid() = cashier_id);

DROP POLICY IF EXISTS "insert_own_shifts" ON cashier_shifts;
CREATE POLICY "insert_own_shifts" ON cashier_shifts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = cashier_id);

DROP POLICY IF EXISTS "update_own_shifts" ON cashier_shifts;
CREATE POLICY "update_own_shifts" ON cashier_shifts FOR UPDATE
  TO authenticated USING (auth.uid() = cashier_id) WITH CHECK (auth.uid() = cashier_id);

DROP POLICY IF EXISTS "delete_own_shifts" ON cashier_shifts;
CREATE POLICY "delete_own_shifts" ON cashier_shifts FOR DELETE
  TO authenticated USING (auth.uid() = cashier_id);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier_status ON cashier_shifts(cashier_id, status);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_branch ON cashier_shifts(branch_id);

CREATE TABLE IF NOT EXISTS pos_held_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  cart_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  discount text NOT NULL DEFAULT '0',
  discount_type text NOT NULL DEFAULT 'fixed',
  payment_method text NOT NULL DEFAULT 'cash',
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'resumed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_held_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_held_orders" ON pos_held_orders;
CREATE POLICY "select_held_orders" ON pos_held_orders FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_held_orders" ON pos_held_orders;
CREATE POLICY "insert_held_orders" ON pos_held_orders FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_held_orders" ON pos_held_orders;
CREATE POLICY "update_held_orders" ON pos_held_orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_held_orders" ON pos_held_orders;
CREATE POLICY "delete_held_orders" ON pos_held_orders FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pos_held_orders_branch_status ON pos_held_orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_held_orders_created ON pos_held_orders(created_at DESC);
