import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Badge, Spinner, EmptyState, ErrorState, Modal, ConfirmDialog, SearchInput, Pagination, TableSkeleton } from '../components/ui';
import { useToast } from '../lib/toast';
import { formatMoney, formatMoneyShort, formatNumber, formatDate, formatDateTime, genBarcode } from '../lib/utils';
import { Package, AlertTriangle, XCircle, Search, RefreshCw, Warehouse as WarehouseIcon, ClipboardList, Calculator, Award, Barcode, Settings as SettingsIcon, FileText, DatabaseBackup, Tag, Percent, Plus, Trash2, CreditCard as Edit2, Printer, TrendingUp, TrendingDown, Wallet, Receipt, Download, Shield, ArrowUpRight, Check } from 'lucide-react';
import type { NavKey } from '../components/AppShell';

/* ============================ INVENTORY ============================ */
export function Inventory() {
  const { filters } = useApp();
  const { profile } = useAuth();
  const { success } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    const [inv, b, variants, products] = await Promise.all([
      supabase.from('inventory').select('id,branch_id,variant_id,quantity,low_stock_threshold'),
      supabase.from('branches').select('id,name').order('name'),
      supabase.from('product_variants').select('id,product_id,size,barcode'),
      supabase.from('products').select('id,name,color,purchase_price,selling_price,brands(name)'),
    ]);
    const bMap = new Map((b.data ?? []).map((x) => [x.id, x.name]));
    const pMap = new Map((products.data ?? []).map((p: any) => [p.id, p]));
    const vMap = new Map((variants.data ?? []).map((v: any) => [v.id, v]));
    const combined = (inv.data ?? []).map((i: any) => {
      const v = vMap.get(i.variant_id);
      const p = v ? pMap.get(v.product_id) : null;
      return {
        ...i,
        branch_name: bMap.get(i.branch_id) ?? '?',
        product_name: p?.name ?? '?',
        brand: (p as any)?.brands?.name ?? '-',
        color: p?.color ?? '-',
        size: v?.size ?? '?',
        barcode: v?.barcode ?? '-',
        cost: Number(p?.purchase_price ?? 0),
        value: Number(p?.purchase_price ?? 0) * i.quantity,
      };
    });
    setBranches(b.data ?? []);
    setRows(combined);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.product_name.toLowerCase().includes(q) || r.barcode.includes(q) || r.size.includes(q);
    const matchBranch = branchFilter === 'all' || r.branch_id === branchFilter;
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'low' && r.quantity > 0 && r.quantity <= r.low_stock_threshold) ||
      (statusFilter === 'out' && r.quantity === 0) ||
      (statusFilter === 'ok' && r.quantity > r.low_stock_threshold);
    return matchSearch && matchBranch && matchStatus;
  });

  const totalValue = filtered.reduce((a, r) => a + r.value, 0);
  const totalUnits = filtered.reduce((a, r) => a + r.quantity, 0);

  const adjust = async (row: any, delta: number) => {
    const newQty = Math.max(0, row.quantity + delta);
    await supabase.from('inventory').update({ quantity: newQty }).eq('id', row.id);
    await supabase.from('inventory_movements').insert({
      variant_id: row.variant_id,
      branch_id: row.branch_id,
      movement_type: 'adjustment',
      quantity_change: delta,
      quantity_after: newQty,
      note: `Manual adjustment ${delta > 0 ? '+' : ''}${delta}`,
      created_by: profile?.id ?? null,
    });
    success('Stock adjusted');
    load();
  };

  const exportCsv = () => {
    const headers = ['Product', 'Brand', 'Color', 'Size', 'Barcode', 'Branch', 'Quantity', 'Min', 'Value'];
    const lines = filtered.map((r) => [r.product_name, r.brand, r.color, r.size, r.barcode, r.branch_name, r.quantity, r.low_stock_threshold, r.value].join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory.csv'; a.click();
    success('Inventory exported');
  };

  return (
    <PageContainer>
      <PageHeader title="Inventory Management" subtitle="Track stock across all branches" action={<Button variant="secondary" onClick={exportCsv}><Download size={16} className="inline mr-1" /> Export CSV</Button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4"><p className="text-xs text-slate-500">Total Units</p><p className="text-xl font-bold text-slate-900 dark:text-white">{formatNumber(totalUnits)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Stock Value</p><p className="text-xl font-bold text-orange-600">{formatMoney(totalValue)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Low Stock</p><p className="text-xl font-bold text-amber-600">{formatNumber(rows.filter((r) => r.quantity > 0 && r.quantity <= r.low_stock_threshold).length)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Out of Stock</p><p className="text-xl font-bold text-red-600">{formatNumber(rows.filter((r) => r.quantity === 0).length)}</p></Card>
      </div>
      <Card className="p-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, barcodes, sizes..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
          </div>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
            <option value="all">All Branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
            <option value="all">All Status</option>
            <option value="ok">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
      </Card>
      <Card className="overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : filtered.length === 0 ? <EmptyState message="No inventory found." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Product</th>
                  <th className="text-left px-4 py-3 font-medium">Brand</th>
                  <th className="text-left px-4 py-3 font-medium">Color</th>
                  <th className="text-left px-4 py-3 font-medium">Size</th>
                  <th className="text-left px-4 py-3 font-medium">Branch</th>
                  <th className="text-right px-4 py-3 font-medium">Qty</th>
                  <th className="text-right px-4 py-3 font-medium">Min</th>
                  <th className="text-right px-4 py-3 font-medium">Value</th>
                  <th className="text-center px-4 py-3 font-medium">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.slice(0, 100).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{r.product_name}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.brand}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.color}</td>
                    <td className="px-4 py-2.5"><Badge color="slate">{r.size}</Badge></td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 text-xs">{r.branch_name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.quantity === 0 ? <Badge color="red">Out</Badge> : r.quantity <= r.low_stock_threshold ? <span className="text-amber-600 font-semibold">{r.quantity}</span> : <span className="text-slate-800 dark:text-slate-100 font-medium">{r.quantity}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{r.low_stock_threshold}</td>
                    <td className="px-4 py-2.5 text-right text-orange-600 font-medium">{formatMoneyShort(r.value)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => adjust(r, -1)} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-200">−</button>
                        <button onClick={() => adjust(r, 1)} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-200">+</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}

/* ============================ WAREHOUSE ============================ */
export function Warehouse() {
  const [branches, setBranches] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('');

  const load = async () => {
    setLoading(true);
    const [b, inv] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('inventory').select('id,branch_id,variant_id,quantity,low_stock_threshold'),
    ]);
    setBranches(b.data ?? []);
    const warehouse = (b.data ?? []).find((x) => x.type === 'warehouse');
    if (warehouse && !selectedBranch) setSelectedBranch(warehouse.id);
    setInventory(inv.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const warehouseBranches = branches.filter((b) => b.type === 'warehouse');
  const branchInv = inventory.filter((i) => i.branch_id === selectedBranch);
  const totalValue = branchInv.reduce((a, i) => a + i.quantity * 50, 0);

  return (
    <PageContainer>
      <PageHeader title="Warehouse Management" subtitle="Central warehouse stock and goods movement" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {warehouseBranches.map((w) => (
          <Card key={w.id} className={`p-5 cursor-pointer ${selectedBranch === w.id ? 'ring-2 ring-emerald-500' : ''}`} >
            <div onClick={() => setSelectedBranch(w.id)}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><WarehouseIcon className="text-blue-600" size={20} /></div>
                <div><h3 className="font-semibold text-slate-900 dark:text-white">{w.name}</h3><p className="text-xs text-slate-500">{w.address ?? 'No address'}</p></div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{inventory.filter((i) => i.branch_id === w.id).length} SKUs in stock</p>
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Warehouse Stock</h3>
        {loading ? <Spinner /> : branchInv.length === 0 ? <EmptyState message="No stock in warehouse." /> : (
          <p className="text-sm text-slate-600 dark:text-slate-300">{branchInv.length} unique SKUs · Total units: {formatNumber(branchInv.reduce((a, i) => a + i.quantity, 0))}</p>
        )}
      </Card>
    </PageContainer>
  );
}

/* ============================ PURCHASE ORDERS ============================ */
export function PurchaseOrders() {
  const { success } = useToast();
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    const [p, s, b] = await Promise.all([
      supabase.from('purchase_orders').select('*,suppliers(name)').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id,name').order('name'),
      supabase.from('branches').select('id,name').order('name'),
    ]);
    setPos(p.data ?? []);
    setSuppliers(s.data ?? []);
    setBranches(b.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = pos.filter((p) => statusFilter === 'all' || p.status === statusFilter);
  const statusColor = (s: string) => (s === 'received' ? 'green' : s === 'ordered' ? 'blue' : s === 'partial' ? 'amber' : 'slate') as any;

  return (
    <PageContainer>
      <PageHeader title="Purchase Orders" subtitle="Manage all purchase orders in one place" action={<Button onClick={() => success('Use Suppliers page to create POs')}><Plus size={16} className="inline mr-1" /> New PO</Button>} />
      <div className="flex gap-2 mb-4">
        {['all', 'draft', 'ordered', 'received', 'partial'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${statusFilter === s ? 'bg-slate-900 text-white dark:bg-emerald-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'}`}>{s}</button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : filtered.length === 0 ? <EmptyState message="No purchase orders." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3 font-medium">PO Number</th><th className="text-left px-4 py-3 font-medium">Supplier</th><th className="text-left px-4 py-3 font-medium">Date</th><th className="text-left px-4 py-3 font-medium">Status</th><th className="text-right px-4 py-3 font-medium">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{p.po_no}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{(p as any).suppliers?.name ?? '?'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3"><Badge color={statusColor(p.status)}>{p.status}</Badge></td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(Number(p.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}

/* ============================ ACCOUNTING ============================ */
export function Accounting() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [sales, expenses, payments, suppliers, customers] = await Promise.all([
        supabase.from('sales').select('total,status').neq('status', 'returned'),
        supabase.from('expenses').select('amount'),
        supabase.from('payments').select('method,amount'),
        supabase.from('suppliers').select('balance'),
        supabase.from('customers').select('total_spent'),
      ]);
      const income = (sales.data ?? []).reduce((a: number, s: any) => a + Number(s.total), 0);
      const exp = (expenses.data ?? []).reduce((a: number, e: any) => a + Number(e.amount), 0);
      const supplierBal = (suppliers.data ?? []).reduce((a: number, s: any) => a + Number(s.balance), 0);
      const customerBal = (customers.data ?? []).reduce((a: number, c: any) => a + Number(c.total_spent), 0);
      const cashPay = (payments.data ?? []).filter((p: any) => p.method === 'cash').reduce((a: number, p: any) => a + Number(p.amount), 0);
      const cardPay = (payments.data ?? []).filter((p: any) => p.method === 'card').reduce((a: number, p: any) => a + Number(p.amount), 0);
      setData({ income, expenses: exp, net: income - exp, supplierBal, customerBal, cashPay, cardPay });
      setLoading(false);
    })();
  }, []);

  if (loading) return <PageContainer><div className="flex justify-center py-12"><Spinner /></div></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title="Accounting" subtitle="Financial overview and cashbook" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4"><p className="text-xs text-slate-500">Total Income</p><p className="text-xl font-bold text-emerald-600">{formatMoney(data.income)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total Expenses</p><p className="text-xl font-bold text-red-600">{formatMoney(data.expenses)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Net Profit</p><p className={`text-xl font-bold ${data.net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatMoney(data.net)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Margin %</p><p className="text-xl font-bold text-slate-900 dark:text-white">{data.income > 0 ? ((data.net / data.income) * 100).toFixed(1) : 0}%</p></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Cashbook</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Cash Payments</span><span className="font-medium text-emerald-600">{formatMoney(data.cashPay)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Card Payments</span><span className="font-medium text-blue-600">{formatMoney(data.cardPay)}</span></div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Balances</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Supplier Balances</span><span className="font-medium text-red-600">{formatMoney(data.supplierBal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Customer Balances</span><span className="font-medium text-emerald-600">{formatMoney(data.customerBal)}</span></div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}

/* ============================ LOYALTY ============================ */
export function Loyalty() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('customers').select('*').order('loyalty_points', { ascending: false });
      setCustomers(data ?? []);
      setLoading(false);
    })();
  }, []);

  const tier = (pts: number) => pts >= 5000 ? 'VIP' : pts >= 1000 ? 'Gold' : pts >= 200 ? 'Silver' : 'Bronze';
  const tierColor = (pts: number) => (pts >= 5000 ? 'violet' : pts >= 1000 ? 'amber' : pts >= 200 ? 'slate' : 'green') as any;
  const totalPoints = customers.reduce((a, c) => a + c.loyalty_points, 0);
  const vipCount = customers.filter((c) => c.loyalty_points >= 1000).length;

  return (
    <PageContainer>
      <PageHeader title="Loyalty Program" subtitle="Customer loyalty points and tiers" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4"><p className="text-xs text-slate-500">Total Members</p><p className="text-xl font-bold text-slate-900 dark:text-white">{customers.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total Points</p><p className="text-xl font-bold text-violet-600">{formatNumber(totalPoints)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">VIP Customers</p><p className="text-xl font-bold text-amber-600">{vipCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Active</p><p className="text-xl font-bold text-emerald-600">{customers.filter((c) => c.total_spent > 0).length}</p></Card>
      </div>
      <Card className="overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : customers.length === 0 ? <EmptyState message="No customers yet." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3 font-medium">Customer</th><th className="text-left px-4 py-3 font-medium">Mobile</th><th className="text-right px-4 py-3 font-medium">Points</th><th className="text-right px-4 py-3 font-medium">Total Spent</th><th className="text-center px-4 py-3 font-medium">Tier</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.name ?? 'Unknown'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.mobile ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-violet-600">{c.loyalty_points}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(Number(c.total_spent))}</td>
                  <td className="px-4 py-3 text-center"><Badge color={tierColor(c.loyalty_points)}>{tier(c.loyalty_points)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}

/* ============================ BARCODE LABELS ============================ */
const LABEL_SIZES = [
  { key: '50x25', w: 50, h: 25, label: '50×25 mm (Small)' },
  { key: '60x40', w: 60, h: 40, label: '60×40 mm (Medium)' },
  { key: '100x50', w: 100, h: 50, label: '100×50 mm (Large)' },
];
const BC_PAGE_SIZE = 24;

export function BarcodeLabels() {
  const { success, error } = useToast();
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelSize, setLabelSize] = useState('50x25');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data: vs, error: ve } = await supabase
          .from('product_variants')
          .select('id,product_id,size,barcode,sku')
          .not('barcode', 'is', null)
          .order('size');
        if (ve) throw ve;
        const pIds = [...new Set((vs ?? []).map((v) => v.product_id))];
        const { data: products, error: pe } = await supabase
          .from('products')
          .select('id,name,color,selling_price')
          .in('id', pIds);
        if (pe) throw pe;
        const pMap = new Map((products ?? []).map((p: any) => [p.id, p]));
        setVariants((vs ?? []).map((v: any) => ({
          ...v,
          product_name: pMap.get(v.product_id)?.name ?? '?',
          color: pMap.get(v.product_id)?.color ?? '-',
          price: pMap.get(v.product_id)?.selling_price ?? 0,
        })));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load barcodes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return variants;
    return variants.filter(
      (v) =>
        v.product_name.toLowerCase().includes(q) ||
        v.barcode?.includes(q) ||
        v.size?.includes(q) ||
        v.sku?.toLowerCase().includes(q)
    );
  }, [variants, search]);

  const totalPages = Math.ceil(filtered.length / BC_PAGE_SIZE);
  const paged = filtered.slice((page - 1) * BC_PAGE_SIZE, page * BC_PAGE_SIZE);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectAll = () => setSelected(new Set(filtered.map((v) => v.id)));
  const clearAll = () => setSelected(new Set());
  const selectPage = () => setSelected((prev) => new Set([...prev, ...paged.map((v) => v.id)]));

  const sizeDef = LABEL_SIZES.find((s) => s.key === labelSize) ?? LABEL_SIZES[0];

  const printSelected = () => {
    const labels = variants.filter((v) => selected.has(v.id));
    if (labels.length === 0) { error('Select at least one barcode to print'); return; }
    const html = labels
      .map(
        (v) =>
          `<div style="display:inline-block;width:${sizeDef.w}mm;height:${sizeDef.h}mm;margin:2mm;border:1px dashed #ccc;padding:1mm;text-align:center;font-family:Arial,sans-serif;overflow:hidden">
            <div style="font-size:7px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.product_name}</div>
            <div style="font-size:6px;color:#666">Sz ${v.size}${v.color !== '-' ? ' · ' + v.color : ''}</div>
            <div style="font-size:9px;font-family:monospace;letter-spacing:1px;margin-top:2px">${v.barcode}</div>
            <div style="border-top:1px solid #ccc;margin-top:4px;padding-top:4px;font-size:24px;letter-spacing:2px">${'|||'.repeat(Math.min(20, Math.floor(sizeDef.w / 3)))}</div>
          </div>`
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) { error('Popup blocked. Allow popups to print barcodes.'); return; }
    w.document.write(`<html><head><title>Barcode Labels (${labels.length})</title><style>@page{size:auto;margin:5mm}body{margin:5mm}</style></head><body>${html}<script>window.print();window.close()</script></body></html>`);
    w.document.close();
    success(`Printing ${labels.length} barcode labels`);
  };

  const exportPDF = () => {
    const labels = variants.filter((v) => selected.has(v.id));
    if (labels.length === 0) { error('Select at least one barcode to export'); return; }
    const html = labels
      .map(
        (v) =>
          `<div style="display:inline-block;width:${sizeDef.w}mm;height:${sizeDef.h}mm;margin:2mm;border:1px solid #000;padding:2mm;text-align:center;font-family:Arial,sans-serif">
            <div style="font-weight:bold;font-size:8px">${v.product_name}</div>
            <div style="font-size:6px;color:#666">Sz ${v.size} · ${v.color}</div>
            <div style="font-family:monospace;font-size:10px;margin-top:4px">${v.barcode}</div>
          </div>`
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) { error('Popup blocked. Allow popups to export.'); return; }
    w.document.write(`<html><head><title>Barcode Export (${labels.length})</title><style>@page{size:A4;margin:10mm}body{margin:10mm}</style></head><body>${html}<script>window.print();window.close()</script></body></html>`);
    w.document.close();
    success(`Exported ${labels.length} barcodes to PDF`);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Barcode Labels"
        subtitle="Generate and print barcode labels in bulk"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportPDF} disabled={selected.size === 0}><FileText size={16} /> PDF Export ({selected.size})</Button>
            <Button onClick={printSelected} disabled={selected.size === 0}><Printer size={16} /> Print ({selected.size})</Button>
          </div>
        }
      />

      <Card className="p-4 mb-4">
        <div className="flex gap-2 flex-wrap items-end">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by product, barcode, size, SKU..." className="flex-1 min-w-[200px]" />
          <Select
            label="Label Size"
            value={labelSize}
            onChange={setLabelSize}
            options={LABEL_SIZES.map((s) => ({ value: s.key, label: s.label }))}
            className="w-48"
          />
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 mt-3 text-sm">
            <button onClick={selectAll} className="text-emerald-600 hover:underline font-medium">Select All ({filtered.length})</button>
            <span className="text-slate-300">|</span>
            <button onClick={selectPage} className="text-slate-600 dark:text-slate-300 hover:underline">Select Page</button>
            <span className="text-slate-300">|</span>
            <button onClick={clearAll} className="text-red-500 hover:underline">Clear</button>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{selected.size} selected</span>
          </div>
        )}
      </Card>

      {loading ? (
        <Card><TableSkeleton rows={6} cols={4} /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={() => window.location.reload()} /></Card>
      ) : paged.length === 0 ? (
        <Card><EmptyState message="No barcodes found. Add barcodes to your product variants first." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {paged.map((v) => (
              <div
                key={v.id}
                onClick={() => toggle(v.id)}
                role="checkbox"
                aria-checked={selected.has(v.id)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(v.id); } }}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${selected.has(v.id) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{v.product_name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge color="slate">Sz {v.size}</Badge>
                    {selected.has(v.id) && <Check size={14} className="text-emerald-600" />}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-1">Color: {v.color}</p>
                {v.sku && <p className="text-xs text-slate-400 mb-1 font-mono">SKU: {v.sku}</p>}
                <div className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 px-2 py-1 rounded">{v.barcode ?? 'No barcode'}</div>
                <div className="mt-2 h-8 flex items-end gap-px" aria-hidden="true">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} style={{ height: `${((i * 7 + 3) % 10) > 4 ? 100 : 60}%` }} className="flex-1 bg-slate-800 dark:bg-slate-200" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </Card>
      )}
    </PageContainer>
  );
}

/* ============================ SETTINGS ============================ */
export function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { success, error } = useToast();
  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error: err } = await supabase.from('profiles').update({ name }).eq('id', profile?.id);
    if (err) error('Failed to save'); else { success('Profile updated'); refreshProfile(); }
    setSaving(false);
  };

  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Manage your account and preferences" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">My Profile</h3>
          <div className="space-y-3">
            <Input label="Display Name" value={name} onChange={setName} />
            <Button onClick={save} disabled={saving}>{saving ? <Spinner /> : 'Save Changes'}</Button>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Preferences</h3>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700"><span>Language</span><span>English</span></div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700"><span>Currency</span><span>PKR (Pakistani Rupee)</span></div>
            <div className="flex justify-between items-center py-2"><span>Date Format</span><span>DD/MM/YYYY</span></div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
/* ============================ AUDIT LOGS ============================ */
export function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('audit_log').select('*,profiles(name)').order('created_at', { ascending: false }).limit(50);
      setLogs(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <PageContainer>
      <PageHeader title="Audit Logs" subtitle="Track all system changes" />
      <Card className="overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : logs.length === 0 ? <EmptyState message="No audit logs recorded yet." /> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-3 font-medium">User</th><th className="text-left px-4 py-3 font-medium">Action</th><th className="text-left px-4 py-3 font-medium">Entity</th><th className="text-left px-4 py-3 font-medium">Time</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {logs.map((l) => (
                <tr key={l.id}><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{(l as any).profiles?.name ?? 'System'}</td><td className="px-4 py-3 font-medium">{l.action}</td><td className="px-4 py-3 text-slate-500">{l.entity ?? '-'}</td><td className="px-4 py-3 text-slate-500">{formatDateTime(l.created_at)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}

/* ============================ BACKUP ============================ */
export function Backup() {
  const { success } = useToast();
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const backup = async () => {
    const tables = ['branches', 'profiles', 'products', 'product_variants', 'inventory', 'sales', 'sale_items', 'payments', 'purchase_orders', 'expenses', 'customers', 'suppliers', 'stock_transfers', 'sales_returns'];
    const data: any = {};
    for (const t of tables) {
      const { data: rows } = await supabase.from(t).select('*');
      data[t] = rows ?? [];
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `soleerp-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setLastBackup(new Date().toISOString());
    success('Backup downloaded successfully');
  };

  return (
    <PageContainer>
      <PageHeader title="Backup & Restore" subtitle="Export your data for safekeeping" />
      <Card className="p-6 text-center">
        <DatabaseBackup size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-600 dark:text-slate-300 mb-1">Download a full JSON backup of all your data.</p>
        <p className="text-xs text-slate-400 mb-4">{lastBackup ? `Last backup: ${formatDateTime(lastBackup)}` : 'No backup taken yet'}</p>
        <Button onClick={backup}><Download size={16} className="inline mr-1" /> Download Backup</Button>
      </Card>
    </PageContainer>
  );
}

/* ============================ PROMOTIONS ============================ */
export function Promotions() {
  return (
    <PageContainer>
      <PageHeader title="Promotions" subtitle="Manage marketing promotions" />
      <Card className="p-6 text-center">
        <Tag size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-600 dark:text-slate-300">Create promotional campaigns and track their performance. Apply discounts to specific products, brands, or categories during sale periods.</p>
      </Card>
    </PageContainer>
  );
}

/* ============================ DISCOUNT RULES ============================ */
export function DiscountRules() {
  return (
    <PageContainer>
      <PageHeader title="Discount Rules" subtitle="Configure automatic discount rules" />
      <Card className="p-6 text-center">
        <Percent size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-600 dark:text-slate-300">Set up quantity-based, customer-tier, and time-based discount rules that apply automatically at the POS.</p>
      </Card>
    </PageContainer>
  );
}

/* ============================ TAX / VAT ============================ */
export function Tax() {
  return (
    <PageContainer>
      <PageHeader title="Tax / VAT" subtitle="Configure tax rates" />
      <Card className="p-6 text-center">
        <Receipt size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-600 dark:text-slate-300">Configure standard and reduced VAT rates per product category. Tax is calculated automatically at the POS based on each product's tax_rate setting.</p>
      </Card>
    </PageContainer>
  );
}
