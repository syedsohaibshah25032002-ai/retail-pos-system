import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { PageContainer, Card, Button, Input, Select, Spinner, Badge, Modal } from '../components/ui';
import { formatMoney, genReceiptNo } from '../lib/utils';
import { ScanLine, Trash2, ShoppingCart, Plus, Minus, X, Filter, User, Star, CreditCard, Wallet, Banknote, Smartphone, Package, Pause, Play, RotateCcw, Lock, Unlock, Clock, DollarSign } from 'lucide-react';
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
  line_discount: number;
  line_discount_type: 'pct' | 'fixed';
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

type HeldOrder = {
  id: string;
  cart: CartLine[];
  discount: string;
  discount_type: 'pct' | 'fixed';
  payment_method: string;
  customer_id: string;
  customer_name: string | null;
  created_at: string;
};

type Shift = {
  id: string;
  cashier_id: string;
  branch_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  expected_cash: number;
  actual_cash: number;
  status: 'open' | 'closed';
  closing_note: string | null;
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

export function POS({ onNavigate }: { onNavigate: (k: 'returns') => void }) {
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
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftOpeningFloat, setShiftOpeningFloat] = useState('0');
  const [shiftActualCash, setShiftActualCash] = useState('');
  const [shiftClosingNote, setShiftClosingNote] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);


  const searchRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Online/offline detection
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => { setOnline(false); warning('Internet connection lost — checkout disabled until reconnected'); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [warning]);

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
      const savedBranch = localStorage.getItem('pos-branch');
      if (savedBranch && (b.data ?? []).some((x) => x.id === savedBranch)) {
        setBranchId(savedBranch);
      } else if (!branchId && (b.data ?? []).length > 0) {
        const main = (b.data ?? []).find((x) => x.name.toLowerCase().includes('shop')) ?? b.data![0];
        setBranchId(main.id);
      }
    })();
  }, []);

  // Load active shift for this cashier+branch
  const loadActiveShift = useCallback(async () => {
    if (!profile?.id || !branchId) return;
    const { data } = await supabase
      .from('cashier_shifts')
      .select('*')
      .eq('cashier_id', profile.id)
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle();
    setActiveShift(data as Shift | null);
  }, [profile?.id, branchId]);

  useEffect(() => { loadActiveShift(); }, [loadActiveShift]);

  // Load held orders from DB
  const loadHeldOrders = useCallback(async () => {
    if (!branchId) return;
    const { data } = await supabase
      .from('pos_held_orders')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'held')
      .order('created_at', { ascending: false });
    const orders: HeldOrder[] = (data ?? []).map((d: any) => ({
      id: d.id,
      cart: d.cart_data as CartLine[],
      discount: d.discount,
      discount_type: d.discount_type,
      payment_method: d.payment_method,
      customer_id: d.customer_id ?? '',
      customer_name: null,
      created_at: d.created_at,
    }));
    setHeldOrders(orders);
  }, [branchId]);

  useEffect(() => { loadHeldOrders(); }, [loadHeldOrders]);

  // Load catalog when branch changes
  const loadCatalog = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
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
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id,product_id,size,barcode,sku')
        .in('product_id', productIds)
        .order('size');
      const vars = (variants ?? []) as { id: string; product_id: string; size: string; barcode: string | null; sku: string | null }[];
      const { data: inv } = await supabase
        .from('inventory')
        .select('variant_id,quantity,low_stock_threshold')
        .eq('branch_id', branchId);
      const stockMap = new Map((inv ?? []).map((i) => [i.variant_id, { qty: i.quantity, low: i.low_stock_threshold }]));
      const items: CatalogItem[] = vars.map((v) => {
        const p = prodMap.get(v.product_id);
        const s = stockMap.get(v.id) ?? { qty: 0, low: 5 };
        return {
          variant_id: v.id, product_id: v.product_id,
          name: p?.name ?? 'Unknown', brand: p?.brands?.[0]?.name ?? null,
          category: p?.categories?.[0]?.name ?? null, color: p?.color ?? null,
          size: v.size, sku: v.sku ?? null, barcode: v.barcode,
          product_barcode: p?.barcode ?? null, price: Number(p?.selling_price ?? 0),
          tax_rate: Number(p?.tax_rate ?? 0), stock: s.qty,
          low_stock_threshold: s.low, image_url: p?.image_url ?? null,
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

  // Realtime catalog updates
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

  // Keyboard shortcuts
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
        if (cart.length > 0) holdSale();
        else setShowHeldOrders(true);
      }
      else if (e.key === 'F6') { e.preventDefault(); document.getElementById('pos-charge-btn')?.focus(); }
      else if (e.key === 'F7') { e.preventDefault(); document.getElementById('pos-discount-input')?.focus(); }
      else if (e.key === 'F8') { e.preventDefault(); checkout(); }
      else if (e.key === 'F9') { e.preventDefault(); setShowShiftModal(true); }
      else if (e.key === 'Escape') {
        if (receipt) return;
        setShowCustomerDropdown(false);
        setShowRecent(false);
        setShowFilters(false);
        setShowHeldOrders(false);
        setShowShiftModal(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        checkout();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, discount, paymentMethod, cashGiven, cardRef, splitCash, splitCard, customerId, branchId, receipt, heldOrders]);

  // Filtered catalog
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
          (c.product_barcode?.includes(q) ?? false);
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

  const sizeOptions = useMemo(() => ['all', ...new Set(catalog.map((c) => c.size).filter(Boolean))] as string[], [catalog]);
  const colorOptions = useMemo(() => ['all', ...new Set(catalog.map((c) => c.color).filter(Boolean))] as string[], [catalog]);

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
        variant_id: item.variant_id, name: item.name, brand: item.brand,
        color: item.color, size: item.size, sku: item.sku, price: item.price,
        qty: 1, stock: item.stock, tax_rate: item.tax_rate,
        line_discount: 0, line_discount_type: 'fixed' as const,
      }];
    });
  }, [warning]);

  const setQty = useCallback((vid: string, raw: number) => {
    if (!Number.isFinite(raw) || raw < 0) { error('Invalid quantity'); return; }
    const qty = Math.floor(raw);
    setCart((prev) =>
      prev.map((l) => {
        if (l.variant_id !== vid) return l;
        if (qty > l.stock) { error(`Only ${l.stock} in stock`); return l; }
        return { ...l, qty };
      }).filter((l) => l.qty > 0)
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

  const setLineDiscount = useCallback((vid: string, val: string, type: 'pct' | 'fixed') => {
    setCart((prev) => prev.map((l) => l.variant_id === vid ? { ...l, line_discount: Number(val) || 0, line_discount_type: type } : l));
  }, []);

  // Barcode scan handler
  const handleScanOrEnter = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    const now = Date.now();
    if (lastScanRef.current.code === q && now - lastScanRef.current.time < 800) {
      setSearch(''); return;
    }
    lastScanRef.current = { code: q, time: now };
    const byBarcode = catalog.find((c) => c.barcode === q || c.product_barcode === q);
    if (byBarcode) { addToCart(byBarcode); pushRecent(q); setSearch(''); return; }
    const match = filtered[0];
    if (match) { addToCart(match); pushRecent(q); setSearch(''); }
    else error(`No product found for "${q}"`);
  }, [search, catalog, filtered, addToCart, pushRecent, error]);

  // Calculations
  const lineTotals = useMemo(() => cart.map((l) => {
    const gross = l.price * l.qty;
    const ld = l.line_discount_type === 'pct'
      ? gross * Math.min(l.line_discount, 100) / 100
      : Math.min(gross, l.line_discount);
    return { variant_id: l.variant_id, gross, discount: ld, net: Math.max(0, gross - ld) };
  }), [cart]);

  const subtotal = useMemo(() => lineTotals.reduce((a, l) => a + l.net, 0), [lineTotals]);
  const itemDiscountTotal = useMemo(() => lineTotals.reduce((a, l) => a + l.discount, 0), [lineTotals]);

  const disc = useMemo(() => {
    const v = Number(discount) || 0;
    if (v < 0) return 0;
    if (discountType === 'pct') return Math.min(subtotal, (subtotal * Math.min(v, 100)) / 100);
    return Math.min(subtotal, v);
  }, [discount, discountType, subtotal]);

  const taxable = Math.max(0, subtotal - disc);
  const tax = useMemo(() => {
    if (subtotal <= 0) return 0;
    const ratio = taxable / subtotal;
    return cart.reduce((a, l, i) => {
      const lt = lineTotals[i];
      if (!lt) return a;
      return a + lt.net * (l.tax_rate / 100);
    }, 0) * ratio;
  }, [cart, taxable, subtotal, lineTotals]);
  const total = Math.max(0, taxable + tax);

  const totalDiscount = itemDiscountTotal + disc;

  // Payment validation
  const paymentValid = useMemo(() => {
    if (total <= 0) return false;
    if (paymentMethod === 'cash') {
      const given = Number(cashGiven) || total;
      return given >= total;
    }
    if (paymentMethod === 'card' || paymentMethod === 'bank' || paymentMethod === 'jazzcash' || paymentMethod === 'easypaisa') return true;
    if (paymentMethod === 'credit') return !!customerId;
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

  // Shift management
  const openShift = async () => {
    if (!profile?.id || !branchId) { error('Missing profile or branch'); return; }
    setShiftLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('cashier_shifts')
        .insert({
          cashier_id: profile.id,
          branch_id: branchId,
          opening_float: Number(shiftOpeningFloat) || 0,
          status: 'open',
        })
        .select()
        .single();
      if (err) throw err;
      setActiveShift(data as Shift);
      setShowShiftModal(false);
      success('Shift opened');
      await logAudit('shift_open', 'cashier_shifts', data.id, { opening_float: shiftOpeningFloat });
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to open shift');
    } finally {
      setShiftLoading(false);
    }
  };

  const closeShift = async () => {
    if (!activeShift) return;
    setShiftLoading(true);
    try {
      // Calculate expected cash: opening float + all cash sales during this shift
      const { data: salesData } = await supabase
        .from('payments')
        .select('cash_amount,change_amount,sale_id')
        .in('sale_id',
          (await supabase.from('sales').select('id').eq('branch_id', branchId).eq('cashier_id', profile?.id ?? '').gte('created_at', activeShift.opened_at)).data?.map((s: any) => s.id) ?? []
        );
      const cashIn = (salesData ?? []).reduce((a: number, p: any) => a + (Number(p.cash_amount) - Number(p.change_amount)), 0);
      const expected = Number(activeShift.opening_float) + cashIn;
      const { data, error: err } = await supabase
        .from('cashier_shifts')
        .update({
          closed_at: new Date().toISOString(),
          status: 'closed',
          expected_cash: expected,
          actual_cash: Number(shiftActualCash) || expected,
          closing_note: shiftClosingNote || null,
        })
        .eq('id', activeShift.id)
        .select()
        .single();
      if (err) throw err;
      setActiveShift(null);
      setShowShiftModal(false);
      setShiftActualCash('');
      setShiftClosingNote('');
      success('Shift closed');
      await logAudit('shift_close', 'cashier_shifts', data.id, { expected, actual: shiftActualCash });
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to close shift');
    } finally {
      setShiftLoading(false);
    }
  };

  // Hold sale to DB
  const holdSale = async () => {
    if (cart.length === 0) { error('Cart is empty'); return; }
    if (!branchId) { error('Select a branch'); return; }
    try {
      const { error: err } = await supabase
        .from('pos_held_orders')
        .insert({
          branch_id: branchId,
          cashier_id: profile?.id ?? null,
          customer_id: customerId || null,
          cart_data: cart as any,
          discount,
          discount_type: discountType,
          payment_method: paymentMethod,
          status: 'held',
        });
      if (err) throw err;
      setCart([]); setDiscount('0'); setDiscountType('fixed'); setCustomerId(''); setCustomerSearch('');
      success('Sale held — resume from held orders (F5)');
      loadHeldOrders();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to hold sale');
    }
  };

  // Resume held order
  const resumeHeldOrder = async (order: HeldOrder) => {
    setCart(order.cart);
    setDiscount(order.discount);
    setDiscountType(order.discount_type);
    setPaymentMethod(order.payment_method);
    setCustomerId(order.customer_id);
    setShowHeldOrders(false);
    // Mark as resumed in DB
    await supabase.from('pos_held_orders').update({ status: 'resumed' }).eq('id', order.id);
    loadHeldOrders();
    success('Held sale restored');
  };

  // Delete held order
  const deleteHeldOrder = async (id: string) => {
    await supabase.from('pos_held_orders').delete().eq('id', id);
    loadHeldOrders();
    success('Held order deleted');
  };

  // Cash drawer pulse (sends signal to printer)
  const triggerCashDrawer = useCallback(() => {
    try {
      const w = window.open('', '', 'width=1,height=1');
      if (!w) return;
      // ESC/POS cash drawer kick command: ESC p 0 0 0
      const drawerCmd = String.fromCharCode(27, 112, 48, 48, 48);
      w.document.write(`<pre style="font-family:monospace;font-size:1px;">${drawerCmd}</pre>`);
      w.print();
      w.close();
    } catch { /* best-effort */ }
  }, []);

  // Checkout
  const checkout = useCallback(async () => {
    if (cart.length === 0) { error('Cart is empty'); return; }
    if (!branchId) { error('Select a branch'); return; }
    if (!profile) { error('Session expired — re-login'); return; }
    if (!online) { error('Cannot checkout while offline. Check your connection.'); return; }
    if (!activeShift) { warning('Open a shift before checkout (F9)'); setShowShiftModal(true); return; }
    if (disc > subtotal) { error('Discount exceeds subtotal'); return; }
    if (paymentMethod === 'credit' && !customerId) { error('Credit sale requires a registered customer'); return; }
    if (!paymentValid) {
      if (paymentMethod === 'split') error('Split amounts must equal total');
      else if (paymentMethod === 'cash') error('Cash given is less than total');
      else error('Invalid payment');
      return;
    }
    for (const l of cart) {
      if (l.qty <= 0) { error('Invalid quantity in cart'); return; }
      if (!Number.isInteger(l.qty)) { error('Decimal quantity not allowed'); return; }
      if (l.qty > l.stock) { error(`${l.name}: only ${l.stock} in stock`); return; }
    }

    setSaving(true);
    const receipt_no = genReceiptNo();
    const startTime = Date.now();
    try {
      // 0. Generate invoice number
      const { data: invNo } = await supabase.rpc('next_invoice_no');
      const invoice_no = invNo as string;
      // 1. Create sale header
      const { data: sale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          receipt_no, invoice_no, branch_id: branchId, cashier_id: profile.id,
          customer_id: customerId || null, subtotal, discount: totalDiscount, tax, total,
          status: 'completed',
        })
        .select()
        .single();
      if (saleErr || !sale) throw new Error(saleErr?.message ?? 'Failed to create sale');

      // 2. Insert sale items (batch)
      const itemsToInsert = cart.map((l, i) => ({
        sale_id: sale.id, variant_id: l.variant_id, qty: l.qty,
        unit_price: l.price, line_total: lineTotals[i]?.net ?? l.price * l.qty,
      }));
      const { error: itemsErr } = await supabase.from('sale_items').insert(itemsToInsert);
      if (itemsErr) throw new Error('Failed to record sale items');

      // 3. Decrement inventory + log movements (parallel)
      const invUpdates = cart.map(async (l) => {
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
          variant_id: l.variant_id, branch_id: branchId, movement_type: 'sale',
          quantity_change: -l.qty, quantity_after: newQty,
          reference_id: sale.id, reference_type: 'sales',
          note: `Sale ${receipt_no}`, created_by: profile.id,
        });
      });
      await Promise.all(invUpdates);

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
        digitalAmt = total;
      } else if (paymentMethod === 'split') {
        methodForDb = 'split';
        cashAmt = Number(splitCash) || 0;
        cardAmt = Number(splitCard) || 0;
        changeAmt = Math.max(0, cashAmt - (total - cardAmt));
        refNo = cardRef || null;
      }
      const { error: payErr } = await supabase.from('payments').insert({
        sale_id: sale.id, method: methodForDb, amount: total,
        cash_amount: cashAmt, card_amount: cardAmt, digital_amount: digitalAmt,
        change_amount: changeAmt, reference_no: refNo,
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

      // 6. Trigger cash drawer for cash/split payments
      if (paymentMethod === 'cash' || paymentMethod === 'split') {
        triggerCashDrawer();
      }

      // 7. Build receipt
      const branch = branches.find((b) => b.id === branchId);
      const receiptLines: ReceiptLine[] = cart.map((l, i) => ({
        variant_id: l.variant_id, name: l.name, size: l.size, color: l.color,
        sku: l.sku, price: l.price, qty: l.qty,
        lineDiscount: l.line_discount > 0 ? l.line_discount : undefined,
      }));
      setReceipt({
        receipt_no, lines: receiptLines, subtotal, discount: totalDiscount,
        discountType, tax, taxRate: subtotal > 0 ? (tax / subtotal) * 100 : 0,
        total, method: paymentMethod,
        cashGiven: paymentMethod === 'cash' ? (Number(cashGiven) || total) : (paymentMethod === 'split' ? (Number(splitCash) || 0) : total),
        change: changeAmt, cardRef: refNo,
        customer: selectedCustomer?.name ?? null, customerMobile: selectedCustomer?.mobile ?? null,
        loyaltyEarned, cashier: profile.name,
        branchName: branch?.name ?? '', branchAddress: branch?.address ?? null, branchPhone: branch?.phone ?? null,
        date: new Date().toLocaleString('en-PK'),
      });

      // 8. Reset
      setCart([]); setDiscount('0'); setDiscountType('fixed');
      setCashGiven(''); setCardRef(''); setSplitCash(''); setSplitCard('');
      setCustomerId(''); setCustomerSearch('');
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      success(`Sale ${receipt_no} completed in ${elapsed}s`);
      setTimeout(() => searchRef.current?.focus(), 100);
      await logAudit('completed_sale', 'sales', sale.id, { receipt_no, total, method: paymentMethod });

      // 9. Refresh catalog stock locally
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
  }, [cart, branchId, profile, disc, subtotal, tax, total, totalDiscount, paymentMethod, cashGiven, splitCash, splitCard, cardRef, customerId, paymentValid, selectedCustomer, branches, success, error, discountType, online, activeShift, triggerCashDrawer, lineTotals]);

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Point of Sale</h1>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Shift indicator */}
          <button
            onClick={() => setShowShiftModal(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeShift
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}
          >
            {activeShift ? <Unlock size={14} /> : <Lock size={14} />}
            {activeShift ? 'Shift Open' : 'No Shift'}
          </button>
          {/* Online indicator */}
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${online ? 'text-emerald-600' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'} ${online ? 'animate-pulse' : ''}`} />
            {online ? 'Online' : 'Offline'}
          </span>
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
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScanOrEnter(); } }}
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
              <div className="flex gap-2">
                {heldOrders.length > 0 && (
                  <button
                    onClick={() => setShowHeldOrders(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                  >
                    <Pause size={12} /> Held ({heldOrders.length})
                  </button>
                )}
                {cart.length > 0 && (
                  <>
                    <button
                      onClick={holdSale}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      <Pause size={12} /> Hold
                    </button>
                    <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">Clear</button>
                  </>
                )}
              </div>
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
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {cart.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Cart is empty. Scan or click products.</p>
              ) : (
                cart.map((l) => {
                  const lt = lineTotals.find((x) => x.variant_id === l.variant_id);
                  return (
                    <div key={l.variant_id} className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <div className="flex items-center gap-2">
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
                        <span className="w-20 text-right font-medium text-sm text-slate-900 dark:text-white">{formatMoney(lt?.net ?? l.price * l.qty)}</span>
                      </div>
                      {/* Item-level discount */}
                      <div className="flex items-center gap-1 mt-1 ml-1">
                        <span className="text-[10px] text-slate-400">Disc:</span>
                        <select
                          value={l.line_discount_type}
                          onChange={(e) => setLineDiscount(l.variant_id, String(l.line_discount), e.target.value as 'pct' | 'fixed')}
                          className="text-[10px] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded px-1 py-0.5"
                        >
                          <option value="fixed">PKR</option>
                          <option value="pct">%</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          value={l.line_discount || ''}
                          onChange={(e) => setLineDiscount(l.variant_id, e.target.value, l.line_discount_type)}
                          placeholder="0"
                          className="w-14 text-[10px] px-1 py-0.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded text-right"
                        />
                        {l.line_discount > 0 && lt && (
                          <span className="text-[10px] text-red-500">-{formatMoney(lt.discount)}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-sm border-t border-slate-200 dark:border-slate-700 pt-3">
              <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>Subtotal</span><span>{formatMoney(subtotal + itemDiscountTotal)}</span></div>
              {itemDiscountTotal > 0 && (
                <div className="flex justify-between text-red-500"><span>Item Discounts</span><span>-{formatMoney(itemDiscountTotal)}</span></div>
              )}
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">Invoice Discount</span>
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

            <div className="flex gap-2 mt-4">
              <button
                id="pos-charge-btn"
                onClick={checkout}
                disabled={saving || cart.length === 0 || !paymentValid || !online}
                className={`flex-1 rounded-lg font-medium transition-colors inline-flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 px-5 py-3 text-base ${
                  saving || cart.length === 0 || !paymentValid || !online
                    ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                }`}
              >
                {saving ? <Spinner className="mx-auto" /> : `Charge ${formatMoney(total)}`}
              </button>
              <button
                onClick={() => onNavigate('returns')}
                className="shrink-0 rounded-lg font-semibold transition-colors inline-flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 px-4 py-3 text-sm bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500 shadow-sm"
                title="Process a return or exchange for a previous sale"
              >
                <RotateCcw size={18} />
                <span className="hidden sm:inline">Return / Exchange</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-400 mt-2 text-center">
              F2 Search · F3 Qty · F4 Customer · F5 Hold · F6 Pay · F7 Disc · F8 Complete · F9 Shift · Ctrl+Enter Charge · Esc Cancel
            </p>
          </Card>
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}

      {/* New Customer Modal */}
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

      {/* Held Orders Modal */}
      {showHeldOrders && (
        <Modal open onClose={() => setShowHeldOrders(false)} title="Held Orders" size="md">
          {heldOrders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No held orders at this branch.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {heldOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {o.cart.length} items · {formatMoney(o.cart.reduce((a, l) => a + l.price * l.qty, 0))}
                    </p>
                    <p className="text-xs text-slate-400">
                      <Clock size={10} className="inline mr-1" />
                      {new Date(o.created_at).toLocaleString('en-PK')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={() => resumeHeldOrder(o)}>
                      <Play size={14} /> Resume
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => deleteHeldOrder(o.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Shift Modal */}
      {showShiftModal && (
        <Modal open onClose={() => setShowShiftModal(false)} title={activeShift ? 'Close Shift' : 'Open Shift'} size="sm">
          {activeShift ? (
            <div className="space-y-3">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-sm">
                <p className="text-slate-600 dark:text-slate-300">Opened: <strong>{new Date(activeShift.opened_at).toLocaleString('en-PK')}</strong></p>
                <p className="text-slate-600 dark:text-slate-300">Opening Float: <strong>{formatMoney(activeShift.opening_float)}</strong></p>
              </div>
              <Input label="Actual Cash in Drawer" value={shiftActualCash} onChange={setShiftActualCash} type="number" placeholder="Count cash..." />
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Closing Note</span>
                <textarea
                  value={shiftClosingNote}
                  onChange={(e) => setShiftClosingNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Optional note..."
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowShiftModal(false)}>Cancel</Button>
                <Button variant="danger" onClick={closeShift} disabled={shiftLoading}>
                  {shiftLoading ? <Spinner className="mx-auto" /> : 'Close Shift'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-300">
                <p>Opening a shift records the starting cash float and enables checkout.</p>
                <p className="mt-1 text-xs text-slate-400">Required before processing sales.</p>
              </div>
              <Input label="Opening Cash Float" value={shiftOpeningFloat} onChange={setShiftOpeningFloat} type="number" placeholder="0" />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowShiftModal(false)}>Cancel</Button>
                <Button variant="success" onClick={openShift} disabled={shiftLoading}>
                  {shiftLoading ? <Spinner className="mx-auto" /> : <><Unlock size={16} className="inline mr-1" />Open Shift</>}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}


    </PageContainer>
  );
}
