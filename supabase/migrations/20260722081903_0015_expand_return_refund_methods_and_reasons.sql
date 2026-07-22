/*
# Expand Sales Returns: Refund Methods + Reasons

1. Changes to `sales_returns` table
- Drop the old `refund_type` CHECK constraint that only allowed cash/credit/exchange.
- Add a new CHECK constraint allowing: cash, card, bank, jazzcash, easypaisa, credit, exchange.
- Add a CHECK constraint on `reason` allowing: Damaged, Wrong Size, Wrong Color, Customer Changed Mind, Other.
   (reason remains nullable — only set when a return is actually processed)

2. No new tables or columns — `sales_return_items.exchange_variant_id` already exists for exchanges.

3. Security: No RLS changes — existing policies remain valid.
*/

ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_refund_type_check;
ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_refund_type_check1;

ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_refund_type_check
  CHECK (refund_type = ANY (ARRAY['cash'::text, 'card'::text, 'bank'::text, 'jazzcash'::text, 'easypaisa'::text, 'credit'::text, 'exchange'::text]));

ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_reason_check;
ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_reason_check
  CHECK (reason IS NULL OR reason = ANY (ARRAY['Damaged'::text, 'Wrong Size'::text, 'Wrong Color'::text, 'Customer Changed Mind'::text, 'Other'::text]));
