-- Expand payments to support all POS payment methods and card references
-- Existing 'split' method is retained; new methods added for digital wallets, bank, credit

-- 1) Drop old CHECK and replace with expanded method set
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash','card','split','bank','jazzcash','easypaisa','credit'));

-- 2) Add reference columns for card / digital / bank transactions
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference_no text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS approval_code text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS terminal_id text;

-- 3) Add digital_amount to support split across more than cash+card
ALTER TABLE payments ADD COLUMN IF NOT EXISTS digital_amount numeric(12,2) NOT NULL DEFAULT 0;

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
