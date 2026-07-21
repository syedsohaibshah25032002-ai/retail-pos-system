import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { PageContainer, Card, Button, Input, Select, Spinner, Badge } from '../components/ui';
import { formatMoney, genReceiptNo } from '../lib/utils';
import { ScanLine, Trash2, ShoppingCart, Plus, Minus, X, Filter, User, Star, CreditCard, Wallet, Banknote, Smartphone, Package } from 'lucide-react';
import { ReceiptModal, type ReceiptData, type ReceiptLine } from './pos/Receipt';
import { NewCustomerModal } from './pos/NewCustomer';

type CatalogItem = {
  variant_id: string;
  product_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  color: string | null;
  size: string;
  sku: string | null;
  barcode: string | null;
  product_barcode: string | null;
  price: number;
  tax_rate: number;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
};

type CartLine = {
  variant_id: string;
  name: string;
  brand: string | null;
  color: string | null;
  size: string;
  sku: string | null;
  price: number;
  qty: number;
  stock: number;
  tax_rate: number;
};

type Customer = { id: string; name: string | null; mobile: string | null; loyalty_points: number; total_spent: number; created_at: string };

type ProductRow = {
  id: string;
  name: string;
  color: string | null;
  selling_price: number;
  tax_rate: number;
  barcode: string | null;
  image_url: string | null;
  brands: { name: string }[] | null;
  categories: { name: string }[] | null;
};

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', Icon: Banknote },
  { key: 'card', label: 'Card', Icon: CreditCard },
  { key: 'bank', label: 'Bank', Icon: Wallet },
  { key: 'jazzcash', label: 'JazzCash', Icon: Smartphone },
  { key: 'easypaisa', label: 'EasyPaisa', Icon: Smartphone },
  { key: 'credit', label: 'Credit', Icon: CreditCard },
  { key: 'split', label: 'Split', Icon: Wallet },
] as const;

const STOCK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'instock', label: 'In Stock' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Out' },
] as const;

export function POS() {
  const { profile } = useAuth();
  const { success, error, warning } = useToast();
  const [branchId, setBranchId] = useState(profile?.branch_id ?? '');
  const [branches, setBranches] = useState<{ id: string; name: string; address: string | null; phone: string | null }[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState<'pct' | 'fixed'>('fixed');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [cashGiven, setCashGiven] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterSize, setFilterSize] = useState('all');
  const [filterColor, setFilterColor] = useState('all');
  const [filterStock, setFilterStock] = useState<'all' | 'instock' | 'low' | 'out'>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [heldSales, setHeldSales] = useState<{ id: string; cart: CartLine[]; discount: string; discountType: 'pct' | 'fixed'; paymentMethod: string; customerId: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Load branches, customers, categories, brands once
  useEffect(() => {
    (async () => {
      const [b, c, cats, brs] = await Promise.all([
        supabase.from('branches').select('id,name,address,phone').order('name'),
        supabase.from('customers').select('id,name,mobile,loyalty_points,total_spent,created_at').order('name'),
        supabase.from('categories').select('id,name').order('name'),
        supabase.from('brands').select('id,name').order('name'),
      ]);
      setBranches(b.data ?? []);
      setCustomers(c.data ?? []);
      setCategories(cats.data ?? []);
      setBrands(brs.data ?? []);
      const { data: supData } = await supabase.from('suppliers').select('id,name').order('name');
      setSuppliers(supData ?? []);
      const savedBranch = localStorage.getItem('pos-branch');
      if (savedBranch && (b.data ?? []).some((x) => x.id === savedBranch)) {
        setBranchId(savedBranch);
      } else if (!branchId && (b.data ?? []).length > 0) {
        const main = (b.data ?? []).find((x) => x.name.toLowerCase().includes('shop')) ?? b.data![0];
        setBranchId(main.id);
      }
    })();
  }, []);

  // Load catalog when branch changes — start from products, then variants, then inventory
  // This ensures ALL active products appear even if inventory row is missing (stock=0)
  const loadCatalog = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      // 1. Fetch all active, non-deleted products
      const { data: products } = await supabase
        .from('products')
        .select('id,name,color,selling_price,tax_rate,barcode,image_url,brands(name),categories(name)')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      const prods = (products ?? []) as ProductRow[];
      if (prods.length === 0) { setCatalog([]); setLoading(false); return; }
      const productIds = prods.map((p) => p.id);
      const prodMap = new Map<string, ProductRow>(prods.map((p) => [p.id, p]));

      // 2. Fetch all variants for those products
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id,product_id,size,barcode,sku')
        .in('product_id', productIds)
        .order('size');
      const vars = (variants ?? []) as { id: string; product_id: string; size: string; barcode: string | null; sku: string | null }[];

      // 3. Fetch inventory for this branch only
      const { data: inv } = await supabase
        .from('inventory')
        .select('variant_id,quantity,low_stock_threshold')
        .eq('branch_id', branchId);
      const stockMap = new Map((inv ?? []).map((i) => [i.variant_id, { qty: i.quantity, low: i.low_stock_threshold }]));

      // 4. Build catalog: every variant appears, stock defaults to 0 if no inventory row
      const items: CatalogItem[] = vars.map((v) => {
        const p = prodMap.get(v.product_id);
        const s = stockMap.get(v.id) ?? { qty: 0, low: 5 };
        return {
          variant_id: v.id,
          product_id: v.product_id,
          name: p?.name ?? 'Unknown',
          brand: p?.brands?.[0]?.name ?? null,
          category: p?.categories?.[0]?.name ?? null,
          color: p?.color ?? null,
          size: v.size,
          sku: v.sku ?? null,
          barcode: v.barcode,
          product_barcode: p?.barcode ?? null,
          price: Number(p?.selling_price ?? 0),
          tax_rate: Number(p?.tax_rate ?? 0),
          stock: s.qty,
          low_stock_threshold: s.low,
          image_url: p?.image_url ?? null,
        };
      });
      setCatalog(items);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Realtime: auto-refresh catalog when products, variants, or inventory change
  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel('pos-catalog-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadCatalog())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => loadCatalog())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `branch_id=eq.${branchId}` }, () => loadCatalog())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, loadCatalog]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Persist recent searches
  useEffect(() => {
    try {
      const s = localStorage.getItem('pos-recent-searches');
      if (s) setRecentSearches(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);

  const pushRecent = useCallback((q: string) => {
    if (!q.trim()) return;
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, 5);
      localStorage.setItem('pos-recent-searches', JSON.stringify(next));
      return next;
    });
  }, []);

  // Keyboard shortcuts: F2 Search, F3 Quantity, F4 Customer, F5 Hold Sale, F6 Payment, F7 Discount, F8 Complete, ESC Cancel, Ctrl+Enter Charge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F3') {
        e.preventDefault();
        if (cart.length > 0) {
          const last = cart[cart.length - 1];
          const inp = document.querySelector(`input[data-vid="${last.variant_id}"]`) as HTMLInputElement | null;
          inp?.focus(); inp?.select();
        }
      }
      else if (e.key === 'F4') { e.preventDefault(); setShowCustomerDropdown(true); }
      else if (e.key === 'F5') {
        e.preventDefault();
        if (cart.length > 0) {
          setHeldSales((prev) => [...prev, { id: crypto.randomUUID(), cart, discount, discountType, paymentMethod, customerId }]);
          setCart([]); setDiscount('0'); setCustomerId('');
          success('Sale held — retrieve with F5 again');
        } else if (heldSales.length > 0) {
          const last = heldSales[heldSales.length - 1];
          setCart(last.cart); setDiscount(last.discount); setDiscountType(last.discountType); setPaymentMethod(last.paymentMethod); setCustomerId(last.customerId);
          setHeldSales((prev) => prev.slice(0, -1));
          success('Held sale restored');
        }
      }
      else if (e.key === 'F6') { e.preventDefault(); document.querySelector('button[class*="w-full mt-4"]')?.closest('button')?.focus(); }
      else if (e.key === 'F7') { e.preventDefault(); document.getElementById('pos-discount-input')?.focus(); }
      else if (e.key === 'F8') { e.preventDefault(); checkout(); }
      else if (e.key === 'Escape') {
        if (receipt) return; // let modal handle
        setShowCustomerDropdown(false);
        setShowRecent(false);
        setShowFilters(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        checkout();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, discount, paymentMethod, cashGiven, cardAmount, cardRef, splitCash, splitCard, customerId, branchId, receipt, heldSales]);

  // Filtered catalog (memoized)
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return catalog.filter((c) => {
      if (q) {
        const match =
          c.name.toLowerCase().includes(q) ||
          (c.brand?.toLowerCase().includes(q) ?? false) ||
          (c.category?.toLowerCase().includes(q) ?? false) ||
          (c.color?.toLowerCase().includes(q) ?? false) ||
          c.size.toLowerCase().includes(q) ||
          (c.sku?.toLowerCase().includes(q) ?? false) ||
          (c.barcode?.includes(q) ?? false) ||
          (c.product_barcode?.includes(q) ?? false) ||
          (suppliers.some((s) => s.name.toLowerCase().includes(q)) && c.name.toLowerCase().includes(q.split(' ')[0] ?? q));
        if (!match) return false;
      }
      if (filterCategory !== 'all' && c.category !== filterCategory) return false;
      if (filterBrand !== 'all' && c.brand !== filterBrand) return false;
      if (filterSize !== 'all' && c.size !== filterSize) return false;
      if (filterColor !== 'all' && c.color !== filterColor) return false;
      if (filterStock === 'instock' && c.stock <= 0) return false;
      if (filterStock === 'low' && (c.stock <= 0 || c.stock > c.low_stock_threshold)) return false;
      if (filterStock === 'out' && c.stock > 0) return false;
      return true;
    });
  }, [catalog, debouncedSearch, filterCategory, filterBrand, filterSize, filterColor, filterStock]);

  // Derived filter options
  const sizeOptions = useMemo(() => ['all', ...new Set(catalog.map((c) => c.size).filter(Boolean))] as string[], [catalog]);
  const colorOptions = useMemo(() => ['all', ...new Set(catalog.map((c) => c.color).filter(Boolean))] as string[], [catalog]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => (c.name?.toLowerCase().includes(q) ?? false) || (c.mobile?.includes(q) ?? false));
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId) ?? null, [customers, customerId]);

  // Cart operations
  const addToCart = useCallback((item: CatalogItem) => {
    if (item.stock <= 0) { warning(`${item.name} is out of stock`); return; }
    setCart((prev) => {
      const ex = prev.find((l) => l.variant_id === item.variant_id);
      if (ex) {
        if (ex.qty >= item.stock) { warning(`Only ${item.stock} in stock`); return prev; }
        return prev.map((l) => (l.variant_id === item.variant_id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, {
        variant_id: item.variant_id,
        name: item.name,
        brand: item.brand,
        color: item.color,
        size: item.size,
        sku: item.sku,
        price: item.price,
        qty: 1,
        stock: item.stock,
        tax_rate: item.tax_rate,
      }];
    });
  }, [warning]);

  const setQty = useCallback((vid: string, raw: number) => {
    if (!Number.isFinite(raw) || raw < 0) { error('Invalid quantity'); return; }
    const qty = Math.floor(raw); // no decimals
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.variant_id !== vid) return l;
          if (qty > l.stock) { error(`Only ${l.stock} in stock`); return l; }
          return { ...l, qty };
        })
        .filter((l) => l.qty > 0)
    );
  }, [error]);

  const incQty = useCallback((vid: string) => {
    setCart((prev) => prev.map((l) => {
      if (l.variant_id !== vid) return l;
      if (l.qty >= l.stock) { warning(`Only ${l.stock} in stock`); return l; }
      return { ...l, qty: l.qty + 1 };
    }));
  }, [warning]);

  const decQty = useCallback((vid: string) => {
    setCart((prev) => prev.filter((l) => l.qty > 1).map((l) => l.variant_id === vid ? { ...l, qty: l.qty - 1 } : l));
  }, []);

  const removeLine = useCallback((vid: string) => {
    setCart((prev) => prev.filter((l) => l.variant_id !== vid));
  }, []);

  // Barcode scan handler (dedup rapid scans)
  const handleScanOrEnter = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    const now = Date.now();
    // Dedup: same code within 800ms = scanner duplicate
    if (lastScanRef.current.code === q && now - lastScanRef.current.time < 800) {
      setSearch('');
      return;
    }
    lastScanRef.current = { code: q, time: now };

    // Exact barcode match first
    const byBarcode = catalog.find((c) => c.barcode === q || c.product_barcode === q);
    if (byBarcode) {
      addToCart(byBarcode);
      pushRecent(q);
      setSearch('');
      return;
    }
    // Otherwise first filtered result
    const match = filtered[0];
    if (match) {
      addToCart(match);
      pushRecent(q);
      setSearch('');
    } else {
      error(`No product found for "${q}"`);
    }
  }, [search, catalog, filtered, addToCart, pushRecent, error]);

  // Calculations
  const subtotal = useMemo(() => cart.reduce((a, l) => a + l.price * l.qty, 0), [cart]);
  const disc = useMemo(() => {
    const v = Number(discount) || 0;
    if (v < 0) return 0;
    if (discountType === 'pct') return Math.min(subtotal, (subtotal * Math.min(v, 100)) / 100);
    return Math.min(subtotal, v);
  }, [discount, discountType, subtotal]);
  const taxable = Math.max(0, subtotal - disc);
  const tax = useMemo(() => cart.reduce((a, l) => a + (l.price * l.qty) * (l.tax_rate / 100), 0) * (subtotal > 0 ? taxable / subtotal : 1), [cart, taxable, subtotal]);
  const total = Math.max(0, taxable + tax);

  // Payment validation
  const paymentValid = useMemo(() => {
    if (total <= 0) return false;
    if (paymentMethod === 'cash') {
      const given = Number(cashGiven) || total;
      return given >= total;
    }
    if (paymentMethod === 'card' || paymentMethod === 'bank' || paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') {
      return true; // reference optional
    }
    if (paymentMethod === 'credit') {
      return !!customerId; // credit requires registered customer
    }
    if (paymentMethod === 'split') {
      const cash = Number(splitCash) || 0;
      const card = Number(splitCard) || 0;
      return cash >= 0 && card >= 0 && Math.abs((cash + card) - total) < 0.01;
    }
    return false;
  }, [paymentMethod, cashGiven, splitCash, splitCard, total, customerId]);

  const changeDue = useMemo(() => {
    if (paymentMethod === 'cash') {
      const given = Number(cashGiven) || total;
      return Math.max(0, given - total);
    }
    if (paymentMethod === 'split') {
      const cash = Number(splitCash) || 0;
      return Math.max(0, cash - (total - (Number(splitCard) || 0)));
    }
    return 0;
  }, [paymentMethod, cashGiven, splitCash, splitCard, total]);

  // Checkout
  const checkout = useCallback(async () => {
    if (cart.length === 0) { error('Cart is empty'); return; }
    if (!branchId) { error('Select a branch'); return; }
    if (!profile) { error('Session expired — re-login'); return; }
    if (disc > subtotal) { error('Discount exceeds subtotal'); return; }
    if (paymentMethod === 'credit' && !customerId) { error('Credit sale requires a registered customer'); return; }
    if (!paymentValid) {
      if (paymentMethod === 'split') error('Split amounts must equal total');
      else if (paymentMethod === 'cash') error('Cash given is less than total');
      else error('Invalid payment');
      return;
    }
    // Stock validation (re-check fresh)
    for (const l of cart) {
      if (l.qty <= 0) { error('Invalid quantity in cart'); return; }
      if (!Number.isInteger(l.qty)) { error('Decimal quantity not allowed'); return; }
      if (l.qty > l.stock) { error(`${l.name}: only ${l.stock} in stock`); return; }
    }

    setSaving(true);
    const receipt_no = genReceiptNo();
    try {
      // 1. Create sale header
      const { data: sale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          receipt_no,
          branch_id: branchId,
          cashier_id: profile.id,
          customer_id: customerId || null,
          subtotal,
          discount: disc,
          tax,
          total,
          status: 'completed',
        })
        .select()
        .single();
      if (saleErr || !sale) throw new Error(saleErr?.message ?? 'Failed to create sale');

      // 2. Insert sale items
      const itemsToInsert = cart.map((l) => ({
        sale_id: sale.id,
        variant_id: l.variant_id,
        qty: l.qty,
        unit_price: l.price,
        line_total: l.price * l.qty,
      }));
      const { error: itemsErr } = await supabase.from('sale_items').insert(itemsToInsert);
      if (itemsErr) throw new Error('Failed to record sale items');

      // 3. Decrement inventory (re-fetch to avoid race) + log movement
      for (const l of cart) {
        const { data: inv, error: invErr } = await supabase
          .from('inventory')
          .select('id,quantity')
          .eq('branch_id', branchId)
          .eq('variant_id', l.variant_id)
          .maybeSingle();
        if (invErr) throw new Error('Inventory check failed');
        if (!inv) throw new Error(`Inventory row missing for ${l.name}`);
        const newQty = inv.quantity - l.qty;
        if (newQty < 0) throw new Error(`Insufficient stock for ${l.name}`);
        const { error: updErr } = await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
        if (updErr) throw new Error('Inventory update failed');
        await supabase.from('inventory_movements').insert({
          variant_id: l.variant_id,
          branch_id: branchId,
          movement_type: 'sale',
          quantity_change: -l.qty,
          quantity_after: newQty,
          reference_id: sale.id,
          reference_type: 'sales',
          note: `Sale ${receipt_no}`,
          created_by: profile.id,
        });
      }

      // 4. Record payment
      let cashAmt = 0, cardAmt = 0, digitalAmt = 0, changeAmt = 0;
      let methodForDb: string = paymentMethod;
      let refNo: string | null = null;
      if (paymentMethod === 'cash') {
        const given = Number(cashGiven) || total;
        cashAmt = given; changeAmt = Math.max(0, given - total);
      } else if (paymentMethod === 'card') {
        cardAmt = total; refNo = cardRef || null;
      } else if (paymentMethod === 'bank' || paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') {
        digitalAmt = total; refNo = cardRef || null;
      } else if (paymentMethod === 'credit') {
        digitalAmt = total; // store credit / on account
      } else if (paymentMethod === 'split') {
        methodForDb = 'split';
        cashAmt = Number(splitCash) || 0;
        cardAmt = Number(splitCard) || 0;
        changeAmt = Math.max(0, cashAmt - (total - cardAmt));
        refNo = cardRef || null;
      }
      const { error: payErr } = await supabase.from('payments').insert({
        sale_id: sale.id,
        method: methodForDb,
        amount: total,
        cash_amount: cashAmt,
        card_amount: cardAmt,
        digital_amount: digitalAmt,
        change_amount: changeAmt,
        reference_no: refNo,
      });
      if (payErr) throw new Error('Failed to record payment');

      // 5. Loyalty + customer totals
      let loyaltyEarned = 0;
      if (customerId) {
        loyaltyEarned = Math.floor(total / 10);
        const { data: cust, error: custErr } = await supabase
          .from('customers')
          .select('loyalty_points,total_spent')
          .eq('id', customerId)
          .maybeSingle();
        if (custErr) throw new Error('Customer lookup failed');
        if (cust) {
          const { error: custUpdErr } = await supabase.from('customers').update({
            loyalty_points: cust.loyalty_points + loyaltyEarned,
            total_spent: Number(cust.total_spent) + total,
          }).eq('id', customerId);
          if (custUpdErr) throw new Error('Customer update failed');
        }
      }

      // 6. Build receipt data
      const branch = branches.find((b) => b.id === branchId);
      const receiptLines: ReceiptLine[] = cart.map((l) => ({
        variant_id: l.variant_id,
        name: l.name,
        size: l.size,
        color: l.color,
        sku: l.sku,
        price: l.price,
        qty: l.qty,
      }));
      setReceipt({
        receipt_no,
        lines: receiptLines,
        subtotal,
        discount: disc,
        discountType,
        tax,
        taxRate: subtotal > 0 ? (tax / subtotal) * 100 : 0,
        total,
        method: paymentMethod,
        cashGiven: paymentMethod === 'cash' ? (Number(cashGiven) || total) : (paymentMethod === 'split' ? (Number(splitCash) || 0) : total),
        change: changeAmt,
        cardRef: refNo,
        customer: selectedCustomer?.name ?? null,
        customerMobile: selectedCustomer?.mobile ?? null,
        loyaltyEarned,
        cashier: profile.name,
        branchName: branch?.name ?? '',
        branchAddress: branch?.address ?? null,
        branchPhone: branch?.phone ?? null,
        date: new Date().toLocaleString('en-PK'),
      });

      // 7. Reset cart + auto-focus search for next customer
      setCart([]);
      setDiscount('0');
      setDiscountType('fixed');
      setCashGiven('');
      setCardAmount('');
      setCardRef('');
      setSplitCash('');
      setSplitCard('');
      setCustomerId('');
      setCustomerSearch('');
      success(`Sale ${receipt_no} completed`);
      setTimeout(() => searchRef.current?.focus(), 100);
      await logAudit('completed_sale', 'sales', sale.id, { receipt_no, total, method: paymentMethod });

      // 8. Refresh catalog stock locally
      setCatalog((prev) => prev.map((c) => {
        const line = cart.find((l) => l.variant_id === c.variant_id);
        if (!line) return c;
        return { ...c, stock: Math.max(0, c.stock - line.qty) };
      }));
    } catch (e) {
      error(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setSaving(false);
    }
  }, [cart, branchId, profile, disc, subtotal, tax, total, paymentMethod, cashGiven, splitCash, splitCard, cardRef, customerId, paymentValid, selectedCustomer, branches, success, error, discountType]);

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Point of Sale</h1>
        <div className="flex gap-2 items-center">
          <Select
            value={branchId}
            onChange={(v) => { setBranchId(v); localStorage.setItem('pos-branch', v); }}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            className="w-48"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT: catalog */}
        <div className="lg:col-span-3">
          <Card className="p-4 mb-4 dark:bg-slate-800">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowRecent(true); }}
                onFocus={() => setShowRecent(true)}
                onBlur={() => setTimeout(() => setShowRecent(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleScanOrEnter(); }
                }}
                placeholder="Scan barcode or search name/SKU/brand/size… (Enter to add, F2 to focus)"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              )}
              {showRecent && recentSearches.length > 0 && !search && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
                  <p className="text-xs text-slate-400 px-2 mb-1">Recent searches</p>
                  {recentSearches.map((s) => (
                    <button key={s} onMouseDown={() => { setSearch(s); searchRef.current?.focus(); }} className="block w-full text-left px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                onClick={() => setShowFilters((s) => !s)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                <Filter size={14} /> Filters
              </button>
              {STOCK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilterStock(f.key as 'all' | 'instock' | 'low' | 'out')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    filterStock === f.key
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="text-xs text-slate-400 ml-auto">{filtered.length} items</span>
            </div>
            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                <Select value={filterCategory} onChange={setFilterCategory} options={[{ value: 'all', label: 'All Categories' }, ...categories.map((c) => ({ value: c.name, label: c.name }))]} />
                <Select value={filterBrand} onChange={setFilterBrand} options={[{ value: 'all', label: 'All Brands' }, ...brands.map((b) => ({ value: b.name, label: b.name }))]} />
                <Select value={filterSize} onChange={setFilterSize} options={sizeOptions.map((s) => ({ value: s, label: s === 'all' ? 'All Sizes' : `Size ${s}` }))} />
                <Select value={filterColor} onChange={setFilterColor} options={colorOptions.map((s) => ({ value: s, label: s === 'all' ? 'All Colors' : s }))} />
              </div>
            )}
          </Card>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-slate-400 text-sm">
              {catalog.length === 0 ? 'No stock at this branch. Receive inventory first.' : 'No matches. Adjust filters or search.'}
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.slice(0, 200).map((item) => {
                const out = item.stock <= 0;
                const low = item.stock > 0 && item.stock <= item.low_stock_threshold;
                return (
                  <button
                    key={item.variant_id}
                    onClick={() => addToCart(item)}
                    disabled={out}
                    className={`text-left bg-white dark:bg-slate-800 rounded-xl border p-3 transition-all group ${
                      out
                        ? 'border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:shadow-md'
                    }`}
                  >
                    <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="text-slate-300 group-hover:text-slate-400 dark:text-slate-500" size={28} />
                      )}
                    </div>
                    <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {item.brand ?? '—'} · {item.color ?? '—'} · Sz {item.size}
                    </p>
                    {item.sku && <p className="text-[10px] text-slate-400">SKU: {item.sku}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{formatMoney(item.price)}</span>
                      {out ? (
                        <Badge color="red">Out</Badge>
                      ) : low ? (
                        <Badge color="amber">Low · {item.stock}</Badge>
                      ) : (
                        <Badge color="green">{item.stock}</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: cart */}
        <div className="lg:col-span-2">
          <Card className="p-5 sticky top-4 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart size={18} /> Current Sale
              </h3>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">Clear</button>
              )}
            </div>

            {/* Customer */}
            <div className="mb-3 relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    value={customerId ? (selectedCustomer?.name ?? 'Walk-in') : customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); if (!e.target.value) setCustomerId(''); }}
                    onFocus={() => { setShowCustomerDropdown(true); if (customerId) { setCustomerId(''); setCustomerSearch(''); } }}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                    onKeyDown={(e) => e.key === 'Escape' && setShowCustomerDropdown(false)}
                    placeholder="Walk-in customer (F4)"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {showCustomerDropdown && (
                    <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                      <button
                        onMouseDown={() => { setCustomerId(''); setCustomerSearch(''); setShowCustomerDropdown(false); }}
                        className="block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        Walk-in customer
                      </button>
                      {filteredCustomers.slice(0, 30).map((c) => (
                        <button
                          key={c.id}
                          onMouseDown={() => { setCustomerId(c.id); setCustomerSearch(''); setShowCustomerDropdown(false); }}
                          className="block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <div className="flex justify-between">
                            <span>{c.name ?? c.mobile ?? 'Customer'}</span>
                            {c.loyalty_points >= 1000 && <Star size={12} className="text-amber-500" />}
                          </div>
                          {c.mobile && <span className="text-xs text-slate-400">{c.mobile}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowNewCustomer(true)}>
                  <Plus size={14} />
                </Button>
              </div>
              {selectedCustomer && (
                <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-900/40 rounded-lg text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Loyalty: <strong>{selectedCustomer.loyalty_points}</strong></span>
                  <span>Spent: <strong>{formatMoney(selectedCustomer.total_spent)}</strong></span>
                  {selectedCustomer.loyalty_points >= 1000 && <span className="text-amber-600 font-medium">VIP</span>}
                </div>
              )}
            </div>

            {/* Cart lines */}
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4" ref={cartEndRef}>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Cart is empty. Scan or click products.</p>
              ) : (
                cart.map((l) => (
                  <div key={l.variant_id} className="flex items-center gap-2 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{l.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {l.brand ?? '—'} · {l.color ?? '—'} · Sz {l.size}
                      </p>
                      <p className="text-xs text-slate-400">{formatMoney(l.price)} · {l.stock - l.qty} left</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => decQty(l.variant_id)} className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center">
                        <Minus size={13} />
                      </button>
                      <input
                        value={l.qty}
                        data-vid={l.variant_id}
                        onChange={(e) => setQty(l.variant_id, parseInt(e.target.value, 10))}
                        className="w-10 text-center text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md py-1"
                      />
                      <button onClick={() => incQty(l.variant_id)} className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center">
                        <Plus size={13} />
                      </button>
                      <button onClick={() => removeLine(l.variant_id)} className="ml-1 text-slate-400 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <span className="w-20 text-right font-medium text-sm text-slate-900 dark:text-white">{formatMoney(l.price * l.qty)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-sm border-t border-slate-200 dark:border-slate-700 pt-3">
              <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">Discount</span>
                <div className="flex items-center gap-1">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as 'pct' | 'fixed')}
                    className="text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md px-1 py-1"
                  >
                    <option value="fixed">PKR</option>
                    <option value="pct">%</option>
                  </select>
                  <input
                    id="pos-discount-input"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    type="number"
                    min="0"
                    className="w-20 text-right px-2 py-1 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md"
                  />
                </div>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>Tax</span><span>{formatMoney(tax)}</span></div>
              <div className="flex justify-between font-bold text-lg text-slate-900 dark:text-white pt-1"><span>Total</span><span>{formatMoney(total)}</span></div>
            </div>

            {/* Payment */}
            <div className="mt-4">
              <div className="grid grid-cols-4 gap-1 mb-3">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.Icon;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setPaymentMethod(m.key)}
                      className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        paymentMethod === m.key
                          ? 'bg-slate-900 text-white dark:bg-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      <Icon size={15} />
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'cash' && (
                <div>
                  <Input label="Cash Given" value={cashGiven} onChange={setCashGiven} type="number" placeholder={String(total)} />
                  {cashGiven && Number(cashGiven) >= total && (
                    <p className="text-xs text-emerald-600 mt-1">Change: {formatMoney(changeDue)}</p>
                  )}
                  {cashGiven && Number(cashGiven) < total && (
                    <p className="text-xs text-red-500 mt-1">Insufficient cash</p>
                  )}
                </div>
              )}

              {(paymentMethod === 'card' || paymentMethod === 'bank' || paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') && (
                <Input label="Reference / Transaction ID" value={cardRef} onChange={setCardRef} placeholder="Optional reference no." />
              )}

              {paymentMethod === 'credit' && (
                <div className="text-xs text-slate-500 dark:text-slate-400 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  Credit sale to <strong>{selectedCustomer?.name ?? '—'}</strong>. Outstanding will be tracked on customer account.
                </div>
              )}

              {paymentMethod === 'split' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Card / Digital" value={splitCard} onChange={setSplitCard} type="number" placeholder="0" />
                    <Input label="Cash" value={splitCash} onChange={setSplitCash} type="number" placeholder="0" />
                  </div>
                  <Input label="Reference (optional)" value={cardRef} onChange={setCardRef} />
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Remaining:</span>
                    <span className={Math.abs((Number(splitCash) + Number(splitCard)) - total) < 0.01 ? 'text-emerald-600' : 'text-red-500'}>
                      {formatMoney(Math.max(0, total - (Number(splitCash) + Number(splitCard))))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={checkout}
              disabled={saving || cart.length === 0 || !paymentValid}
              className="w-full mt-4"
              size="lg"
            >
              {saving ? <Spinner className="mx-auto" /> : `Charge ${formatMoney(total)}`}
            </Button>
            <p className="text-[10px] text-slate-400 mt-2 text-center">F2 Search · F3 Qty · F4 Customer · F5 Hold · F6 Payment · F7 Discount · F8 Complete · Ctrl+Enter Charge · Esc Cancel</p>
          </Card>
        </div>
      </div>

      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
      {showNewCustomer && (
        <NewCustomerModal
          onClose={() => setShowNewCustomer(false)}
          onCreated={(c) => {
            setCustomers((p) => [...p, c]);
            setCustomerId(c.id);
            setShowNewCustomer(false);
          }}
        />
      )}
    </PageContainer>
  );
}
