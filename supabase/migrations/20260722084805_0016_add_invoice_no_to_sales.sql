-- Add invoice_no column to sales for formal invoice numbering
ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_no text;

-- Generate invoice numbers for existing sales (INV-YYYYMMDD-NNN format)
UPDATE sales s
SET invoice_no = sub.invoice_no
FROM (
  SELECT id, 'INV-' || to_char(created_at, 'YYYYMMDD') || '-' || lpad(row_number() over (partition by date_trunc('day', created_at) order by created_at)::text, 4, '0') as invoice_no
  FROM sales
) sub
WHERE s.id = sub.id AND s.invoice_no IS NULL;

-- Make invoice_no unique going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_no ON sales(invoice_no) WHERE invoice_no IS NOT NULL;
