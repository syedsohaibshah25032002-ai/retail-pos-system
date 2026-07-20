import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Role = 'super_admin' | 'owner' | 'manager' | 'cashier' | 'warehouse' | 'accountant';

export type Branch = {
  id: string;
  name: string;
  type: 'warehouse' | 'shop' | 'online';
  address: string | null;
  phone: string | null;
  is_main: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  branch_id: string | null;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

export type Category = { id: string; name: string; created_at: string };
export type Brand = { id: string; name: string; created_at: string };

export type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  brand_id: string | null;
  category_id: string | null;
  gender: 'Men' | 'Women' | 'Kids' | 'Unisex' | null;
  season: string | null;
  style: string | null;
  color: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  barcode: string | null;
  image_url: string | null;
  description: string | null;
  created_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  size: string;
  barcode: string | null;
  sku: string | null;
  created_at: string;
};

export type Inventory = {
  id: string;
  branch_id: string;
  variant_id: string;
  quantity: number;
  low_stock_threshold: number;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string | null;
  mobile: string | null;
  email: string | null;
  birthday: string | null;
  loyalty_points: number;
  total_spent: number;
  notes: string | null;
  created_at: string;
};

export type Sale = {
  id: string;
  receipt_no: string;
  branch_id: string;
  cashier_id: string | null;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: 'completed' | 'returned' | 'partial';
  note: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  variant_id: string;
  qty: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

export type Payment = {
  id: string;
  sale_id: string;
  method: 'cash' | 'card' | 'split';
  amount: number;
  cash_amount: number;
  card_amount: number;
  change_amount: number;
  created_at: string;
};

export type PurchaseOrder = {
  id: string;
  po_no: string;
  supplier_id: string;
  branch_id: string;
  status: 'draft' | 'ordered' | 'received' | 'partial';
  total: number;
  note: string | null;
  created_at: string;
};

export type StockTransfer = {
  id: string;
  transfer_no: string;
  from_branch_id: string;
  to_branch_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_by: string | null;
  approved_by: string | null;
  note: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  branch_id: string | null;
  category: string;
  amount: number;
  expense_date: string;
  note: string | null;
  created_at: string;
};

export type SalesReturn = {
  id: string;
  return_no: string;
  original_sale_id: string;
  refund_amount: number;
  refund_type: 'cash' | 'credit' | 'exchange';
  reason: string | null;
  branch_id: string;
  created_by: string | null;
  created_at: string;
};
