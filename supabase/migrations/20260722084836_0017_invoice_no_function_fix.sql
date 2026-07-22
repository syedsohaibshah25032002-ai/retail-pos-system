-- Fix: use substring() instead of regexp_extract
CREATE OR REPLACE FUNCTION next_invoice_no()
RETURNS text AS $$
DECLARE
  today_str text;
  next_seq int;
  base_seq int;
BEGIN
  today_str := to_char(now(), 'YYYYMMDD');
  
  SELECT coalesce(max(seq), 0) INTO base_seq
  FROM (
    SELECT substring(invoice_no from 'INV-' || today_str || '-([0-9]+)$')::int AS seq
    FROM sales
    WHERE invoice_no LIKE 'INV-' || today_str || '-%'
  ) t;
  
  next_seq := base_seq + 1;
  RETURN 'INV-' || today_str || '-' || lpad(next_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
