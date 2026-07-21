-- Add manager, email, and is_active columns to branches table
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Set existing branches to active
UPDATE branches SET is_active = true WHERE is_active IS NULL;
