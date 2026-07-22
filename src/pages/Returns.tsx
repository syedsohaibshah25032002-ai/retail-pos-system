import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState, SearchInput } from '../components/ui';
import { formatMoney, formatDateTime, genReceiptNo } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { CheckCircle2, RotateCcw, Search, Calendar, User, Phone, Barcode, Receipt as ReceiptIcon, Filter, ArrowRight, Package } from 'lucide-react';
import { ReturnReceiptModal, type ReturnReceiptData, type ReturnReceiptLine } from './pos/ReturnReceipt';

const RETURN_REASONS = ['Damaged', 'Wrong Size', 'Wrong Color', 'Customer Changed Mind', 'Other'] as const;
const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'EasyPaisa' },
  { value: 'credit', label: 'Store Credit' },
  { value: 'exchange', label: 'Exchange' },
] as const;

type SaleItem = {
  id: string;
  variant_id: string;
  qty: number;
  unit_price: number;
  line_total: number;
  name: string;
  size: string;
  color: string | null;
  sku: string | null;
  barcode: string | null;
  product_barcode: string | null;
  image_url: string | null;
  stock: number;
  alreadyReturned: number;
};

type FoundSale = {
  id: string;
  receipt_no: string;
  invoice_no: string | null;
  branch_id: string;
  total: number;
  subtotal: number;
  tax: number;
  discount: number;
  status: string;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  cashier_name: string | null;
  branch_name: string;
  items: SaleItem[];
};

type ReturnRecord = {
  id: string;
  return_no: string;
  original_sale_id: string;
  refund_amount: number;
  refund_type: string;
  reason: string | null;
  branch_id: string;
  created_by: string | null;
  created_at: string;
  sale: { receipt_no: string; total: number } | null;
  cashier: { name: string } | null;
  customer: { name: string | null; mobile: string | null } | null;
};

type ExchangeItem = {
  variant_id: string;
  name: string;
  size: string;
  color: string | null;
  price: number;
  stock: number;
  image_url: string | null;
};

type SearchMode = 'receipt' | 'barcode' | 'customer' | 'phone' | 'date';

const SALE_SELECT = 'id,receipt_no,invoice_no,branch_id,total,subtotal,tax,discount,status,created_at,customer_id,customer:customers(name,mobile),cashier:profiles(name),branch:branches(name)';

export function Returns({ initialReceipt }: { initialReceipt?: string }) {
  const { profile } = useAuth();
  const { success, error } = useToast();
  const [searchMode, setSearchMode] = useState<SearchMode>('receipt');
  const [search, setSearch] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchResults, setSearchResults] = useState<FoundSale[]>([]);
  const [selectedSale, setSelectedSale] = useState<FoundSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [showProcess, setShowProcess] = useState(false);
  const [branchId, setBranchId] = useState(profile?.branch_id ?? '');
  const [returnReceipt, setReturnReceipt] = useState<ReturnReceiptData | null>(null);
  const [filterReceipt, setFilterReceipt] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterCashier, setFilterCashier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const loadReturns = useCallback(async () => {
    let q = supabase
      .from('sales_returns')
      .select('*,sale:sales(receipt_no,total),cashier:profiles(name),customer:customers(name,mobile)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (filterReceipt.trim()) q = q.like('return_no', `%${filterReceipt.trim()}%`);
    if (filterDateFrom) q = q.gte('created_at', `${filterDateFrom}T00:00:00`);
    if (filterDateTo) q = q.lte('created_at', `${filterDateTo}T23:59:59`);
    const { data, error: qErr } = await q;
    if (qErr) { error(qErr.message); return; }
    let rows = (data ?? []) as any[];
    if (filterCustomer.trim()) {
      rows = rows.filter((r) => (r.customer?.name ?? '').toLowerCase().includes(filterCustomer.trim().toLowerCase()) || (r.customer?.mobile ?? '').includes(filterCustomer.trim()));
    }
    if (filterCashier.trim()) {
      rows = rows.filter((r) => (r.cashier?.name ?? '').toLowerCase().includes(filterCashier.trim().toLowerCase()));
    }
    setReturns(rows as ReturnRecord[]);
  }, [filterReceipt, filterCustomer, filterCashier, filterDateFrom, filterDateTo, error]);

  useEffect(() => {
    loadReturns();
    if (!branchId) {
      supabase.from('branches').select('id,name').order('name').limit(1).maybeSingle().then(({ data: b }) => { if (b) setBranchId(b.id); });
    }
    supabase.from('profiles').select('id,name').order('name').then(({ data }) => setCashiers(data ?? []));
  }, [loadReturns, branchId]);

  // Auto-search if initialReceipt is provided (from POS redirect)
  useEffect(() => {
    if (initialReceipt) {
      setSearchMode('receipt');
      setSearch(initialReceipt);
      // Trigger search after a brief delay
      setTimeout(() => doFindSales('receipt', initialReceipt), 100);
    }
  }, [initialReceipt]);

  // Shared function to load full sale details (items, variants, products, returns, stock)
  const loadSaleDetails = async (salesData: any[]): Promise<FoundSale[]> => {
    if (salesData.length === 0) return [];
    const saleIds = salesData.map((s) => s.id);
    const { data: saleItems, error: siErr } = await supabase
      .from('sale_items')
      .select('id,sale_id,variant_id,qty,unit_price,line_total')
      .in('sale_id', saleIds);
    if (siErr) throw new Error('Failed to load sale items: ' + siErr.message);
    const vIds = [...new Set((saleItems ?? []).map((si) => si.variant_id))];
    const { data: variants, error: vErr } = await supabase
      .from('product_variants')
      .select('id,product_id,size,barcode,sku')
      .in('id', vIds);
    if (vErr) throw new Error('Failed to load variants: ' + vErr.message);
    const pIds = [...new Set((variants ?? []).map((v) => v.product_id))];
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id,name,color,barcode,image_url')
      .in('id', pIds);
    if (pErr) throw new Error('Failed to load products: ' + pErr.message);
    const pMap = new Map((products ?? []).map((p) => [p.id, p]));
    const vMap = new Map((variants ?? []).map((v) => [v.id, v]));
    // Load already-returned quantities per sale_item
    const siIds = (saleItems ?? []).map((si) => si.id);
    let returnedMap = new Map<string, number>();
    if (siIds.length > 0) {
      const { data: returnItems, error: riErr } = await supabase
        .from('sales_return_items')
        .select('sale_item_id,qty')
        .in('sale_item_id', siIds);
      if (riErr) throw new Error('Failed to load return items: ' + riErr.message);
      (returnItems ?? []).forEach((ri) => {
        returnedMap.set(ri.sale_item_id, (returnedMap.get(ri.sale_item_id) ?? 0) + ri.qty);
      });
    }
    // Load current stock at branch
    const { data: inv, error: invErr } = await supabase
      .from('inventory')
      .select('variant_id,quantity')
      .eq('branch_id', branchId);
    if (invErr) throw new Error('Failed to load inventory: ' + invErr.message);
    const stockMap = new Map((inv ?? []).map((i) => [i.variant_id, i.quantity]));
    return salesData.map((s: any) => {
      const items: SaleItem[] = (saleItems ?? []).filter((si) => si.sale_id === s.id).map((si) => {
        const v = vMap.get(si.variant_id);
        const p = v ? pMap.get(v.product_id) : null;
        return {
          id: si.id, variant_id: si.variant_id, qty: si.qty,
          unit_price: Number(si.unit_price), line_total: Number(si.line_total),
          name: p?.name ?? 'Unknown', size: v?.size ?? '?',
          color: p?.color ?? null, sku: v?.sku ?? null,
          barcode: v?.barcode ?? null, product_barcode: p?.barcode ?? null,
          image_url: p?.image_url ?? null,
          stock: stockMap.get(si.variant_id) ?? 0,
          alreadyReturned: returnedMap.get(si.id) ?? 0,
        };
      });
      return {
        ...s, total: Number(s.total), subtotal: Number(s.subtotal),
        tax: Number(s.tax), discount: Number(s.discount),
        customer_name: s.customer?.name ?? null,
        customer_mobile: s.customer?.mobile ?? null,
        cashier_name: s.cashier?.name ?? null,
        branch_name: s.branch?.name ?? '',
        items,
      };
    });
  };

  const doFindSales = useCallback(async (mode: SearchMode, term: string, dateVal?: string) => {
    setLoading(true);
    setHasSearched(true);
    try {
      let salesQuery;
      if (mode === 'receipt') {
        salesQuery = supabase
          .from('sales')
          .select(SALE_SELECT)
          .ilike('receipt_no', `%${term}%`)
          .order('created_at', { ascending: false })
          .limit(10);
      } else if (mode === 'date') {
        if (!dateVal) { error('Select a date'); return; }
        salesQuery = supabase
          .from('sales')
          .select(SALE_SELECT)
          .gte('created_at', `${dateVal}T00:00:00`)
          .lte('created_at', `${dateVal}T23:59:59`)
          .order('created_at', { ascending: false })
          .limit(20);
      } else if (mode === 'customer') {
        const { data: custs, error: cErr } = await supabase
          .from('customers')
          .select('id')
          .ilike('name', `%${term}%`);
        if (cErr) throw new Error('Failed to search customers: ' + cErr.message);
        if (!custs || custs.length === 0) { setSearchResults([]); return; }
        salesQuery = supabase
          .from('sales')
          .select(SALE_SELECT)
          .in('customer_id', custs.map((c) => c.id))
          .order('created_at', { ascending: false })
          .limit(20);
      } else if (mode === 'phone') {
        const { data: custs, error: cErr } = await supabase
          .from('customers')
          .select('id')
          .ilike('mobile', `%${term}%`);
        if (cErr) throw new Error('Failed to search customers: ' + cErr.message);
        if (!custs || custs.length === 0) { setSearchResults([]); return; }
        salesQuery = supabase
          .from('sales')
          .select(SALE_SELECT)
          .in('customer_id', custs.map((c) => c.id))
          .order('created_at', { ascending: false })
          .limit(20);
      } else {
        // barcode: search sale_items by variant barcode OR product barcode
        // 1. Find variant IDs matching the barcode directly
        const { data: variants, error: vErr } = await supabase
          .from('product_variants')
          .select('id')
          .ilike('barcode', `%${term}%`);
        if (vErr) throw new Error('Failed to search barcodes: ' + vErr.message);
        // 2. Find products matching the barcode, then get their variants
        const { data: products, error: pErr } = await supabase
          .from('products')
          .select('id')
          .ilike('barcode', `%${term}%`);
        if (pErr) throw new Error('Failed to search product barcodes: ' + pErr.message);
        const pIds = (products ?? []).map((p) => p.id);
        let moreVariantIds: string[] = [];
        if (pIds.length > 0) {
          const { data: moreVariants, error: mvErr } = await supabase
            .from('product_variants')
            .select('id')
            .in('product_id', pIds);
          if (mvErr) throw new Error('Failed to search variants: ' + mvErr.message);
          moreVariantIds = (moreVariants ?? []).map((v) => v.id);
        }
        const allVIds = [...new Set([...(variants ?? []).map((v) => v.id), ...moreVariantIds])];
        if (allVIds.length === 0) { setSearchResults([]); return; }
        // 3. Find sale_items containing these variant IDs
        const { data: saleItems, error: siErr } = await supabase
          .from('sale_items')
          .select('sale_id')
          .in('variant_id', allVIds);
        if (siErr) throw new Error('Failed to search sale items: ' + siErr.message);
        const saleIds = [...new Set((saleItems ?? []).map((si) => si.sale_id))];
        if (saleIds.length === 0) { setSearchResults([]); return; }
        salesQuery = supabase
          .from('sales')
          .select(SALE_SELECT)
          .in('id', saleIds)
          .order('created_at', { ascending: false })
          .limit(20);
      }
      const { data: salesData, error: sErr } = await salesQuery;
      if (sErr) throw new Error('Failed to search sales: ' + sErr.message);
      if (!salesData || salesData.length === 0) { setSearchResults([]); return; }
      const results = await loadSaleDetails(salesData);
      setSearchResults(results);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, error]);

  const findSales = () => doFindSales(searchMode, search.trim(), searchDate);

  const openSale = (sale: FoundSale) => {
    setSelectedSale(sale);
    setShowProcess(true);
  };

  return (
    <PageContainer>
      <PageHeader title="Sales Returns & Exchanges" subtitle="Search past sales, process returns, exchanges, and refunds" />

      {/* Search section */}
      <Card className="p-4 mb-4 dark:bg-slate-800">
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { key: 'receipt', label: 'Receipt No', Icon: ReceiptIcon },
            { key: 'barcode', label: 'Barcode', Icon: Barcode },
            { key: 'customer', label: 'Customer', Icon: User },
            { key: 'phone', label: 'Phone', Icon: Phone },
            { key: 'date', label: 'Date', Icon: Calendar },
          ] as { key: SearchMode; label: string; Icon: typeof ReceiptIcon }[]).map((m) => {
            const Icon = m.Icon;
            return (
              <button
                key={m.key}
                onClick={() => { setSearchMode(m.key); setSearchResults([]); setSearch(''); setHasSearched(false); }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  searchMode === m.key
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <Icon size={14} /> {m.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          {searchMode === 'date' ? (
            <Input value={searchDate} onChange={setSearchDate} type="date" className="flex-1" />
          ) : (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={
                searchMode === 'receipt' ? 'Enter receipt number (e.g. R-20260722-75NNO)...' :
                searchMode === 'barcode' ? 'Scan or enter barcode...' :
                searchMode === 'customer' ? 'Customer name...' :
                'Phone number...'
              }
              className="flex-1"
            />
          )}
          <Button onClick={findSales} disabled={loading}>{loading ? <Spinner /> : <><Search size={16} /> Search</>}</Button>
        </div>
      </Card>

      {/* Search results */}
      {searchResults.length > 0 && (
        <Card className="p-4 mb-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Search Results ({searchResults.length})</h3>
          <div className="space-y-2">
            {searchResults.map((s) => (
              <button
                key={s.id}
                onClick={() => openSale(s)}
                className="w-full text-left p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 dark:text-white">{s.receipt_no}</span>
                    {s.invoice_no && <span className="text-xs text-slate-400">{s.invoice_no}</span>}
                    <Badge color={s.status === 'completed' ? 'green' : 'amber'}>{s.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(s.created_at)} · {s.cashier_name ?? '—'} · {s.customer_name ?? 'Walk-in'}{s.customer_mobile ? ` · ${s.customer_mobile}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">{s.items.length} items · {s.branch_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-slate-900 dark:text-white">{formatMoney(s.total)}</p>
                  <span className="text-xs text-emerald-600 inline-flex items-center gap-0.5">
                    Process Return <ArrowRight size={12} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {searchResults.length === 0 && !loading && hasSearched && (
        <Card className="p-4 mb-4"><EmptyState message="No sales found matching your search." /></Card>
      )}

      {/* Returns history */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">Returns History</h3>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <Filter size={14} /> Filters
        </button>
      </div>

      {showFilters && (
        <Card className="p-4 mb-4 dark:bg-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Input label="Return No" value={filterReceipt} onChange={setFilterReceipt} placeholder="RT-..." />
            <Input label="Customer" value={filterCustomer} onChange={setFilterCustomer} placeholder="Name or phone" />
            <Select label="Cashier" value={filterCashier} onChange={setFilterCashier} options={[{ value: '', label: 'All Cashiers' }, ...cashiers.map((c) => ({ value: c.name, label: c.name }))]} />
            <Input label="From Date" value={filterDateFrom} onChange={setFilterDateFrom} type="date" />
            <Input label="To Date" value={filterDateTo} onChange={setFilterDateTo} type="date" />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={() => { setFilterReceipt(''); setFilterCustomer(''); setFilterCashier(''); setFilterDateFrom(''); setFilterDateTo(''); }}>Clear</Button>
            <Button size="sm" onClick={loadReturns}>Apply Filters</Button>
          </div>
        </Card>
      )}

      {returns.length === 0 ? (
        <Card><EmptyState message="No returns processed yet." /></Card>
      ) : (
        <Card className="overflow-hidden dark:bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Return No</th>
                  <th className="text-left px-4 py-3 font-medium">Original Receipt</th>
                  <th className="text-left px-4 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium">Cashier</th>
                  <th className="text-left px-4 py-3 font-medium">Reason</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-right px-4 py-3 font-medium">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{r.return_no}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.sale?.receipt_no ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.customer?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.cashier?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.reason ?? '-'}</td>
                    <td className="px-4 py-3"><Badge color={r.refund_type === 'exchange' ? 'blue' : r.refund_type === 'credit' ? 'violet' : 'amber'}>{r.refund_type}</Badge></td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{formatMoney(Number(r.refund_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Process Return Modal */}
      {showProcess && selectedSale && (
        <ProcessReturnModal
          sale={selectedSale}
          branchId={branchId || selectedSale.branch_id}
          createdBy={profile?.id ?? null}
          cashierName={profile?.name ?? 'Unknown'}
          onClose={() => { setShowProcess(false); setSelectedSale(null); }}
          onDone={(receiptData) => {
            setShowProcess(false);
            setSelectedSale(null);
            setSearch('');
            setSearchResults([]);
            setHasSearched(false);
            setReturnReceipt(receiptData);
            loadReturns();
          }}
        />
      )}

      {/* Return Receipt */}
      {returnReceipt && <ReturnReceiptModal receipt={returnReceipt} onClose={() => setReturnReceipt(null)} />}
    </PageContainer>
  );
}

function ProcessReturnModal({
  sale, branchId, createdBy, cashierName, onClose, onDone,
}: {
  sale: FoundSale;
  branchId: string;
  createdBy: string | null;
  cashierName: string;
  onClose: () => void;
  onDone: (receiptData: ReturnReceiptData) => void;
}) {
  const { success, error } = useToast();
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [exchangeQty, setExchangeQty] = useState<Record<string, string>>({});
  const [refundType, setRefundType] = useState<string>('cash');
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeResults, setExchangeResults] = useState<ExchangeItem[]>([]);
  const [selectedExchanges, setSelectedExchanges] = useState<Record<string, ExchangeItem>>({});

  const returnableItems = sale.items.filter((i) => i.qty - i.alreadyReturned > 0);

  const refundAmount = useMemo(() => {
    return sale.items.reduce((a, i) => a + (returnQty[i.id] ?? 0) * i.unit_price, 0);
  }, [sale.items, returnQty]);

  const exchangeTotal = useMemo(() => {
    return Object.values(selectedExchanges).reduce((a, e) => {
      const qty = Number(exchangeQty[e.variant_id] ?? 0);
      return a + qty * e.price;
    }, 0);
  }, [selectedExchanges, exchangeQty]);

  const priceDifference = useMemo(() => {
    if (!exchangeMode) return 0;
    return exchangeTotal - refundAmount;
  }, [exchangeMode, exchangeTotal, refundAmount]);

  const finalRefund = useMemo(() => {
    if (exchangeMode) {
      return priceDifference < 0 ? Math.abs(priceDifference) : 0;
    }
    return refundAmount;
  }, [exchangeMode, priceDifference, refundAmount]);

  const searchExchangeItems = async () => {
    const q = exchangeSearch.toLowerCase().trim();
    if (!q) { setExchangeResults([]); return; }
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id,name,color,selling_price,image_url')
      .ilike('name', `%${q}%`)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(5);
    if (pErr) { error(pErr.message); return; }
    const pIds = (products ?? []).map((p) => p.id);
    if (pIds.length === 0) { setExchangeResults([]); return; }
    const { data: variants, error: vErr } = await supabase
      .from('product_variants')
      .select('id,product_id,size,sku')
      .in('product_id', pIds)
      .order('size');
    if (vErr) { error(vErr.message); return; }
    const { data: inv, error: iErr } = await supabase
      .from('inventory')
      .select('variant_id,quantity')
      .eq('branch_id', branchId);
    if (iErr) { error(iErr.message); return; }
    const stockMap = new Map((inv ?? []).map((i) => [i.variant_id, i.quantity]));
    const pMap = new Map((products ?? []).map((p) => [p.id, p]));
    const items: ExchangeItem[] = (variants ?? []).map((v) => {
      const p = pMap.get(v.product_id);
      return {
        variant_id: v.id, name: p?.name ?? 'Unknown', size: v.size,
        color: p?.color ?? null, price: Number(p?.selling_price ?? 0),
        stock: stockMap.get(v.id) ?? 0, image_url: p?.image_url ?? null,
      };
    }).filter((i) => i.stock > 0);
    setExchangeResults(items);
  };

  const save = async () => {
    const items = sale.items.filter((i) => (returnQty[i.id] ?? 0) > 0);
    if (items.length === 0) { error('Select at least one item to return.'); return; }
    if (!reason) { error('Select a return reason.'); return; }
    if (exchangeMode && Object.keys(selectedExchanges).length === 0) { error('Select at least one exchange item.'); return; }
    for (const [vid, ex] of Object.entries(selectedExchanges)) {
      const qty = Number(exchangeQty[vid] ?? 0);
      if (qty <= 0) { error(`Enter quantity for exchange item ${ex.name}`); return; }
      if (qty > ex.stock) { error(`Only ${ex.stock} in stock for ${ex.name}`); return; }
    }
    setSaving(true);
    const return_no = genReceiptNo('RT');
    try {
      const effectiveRefundType = exchangeMode && priceDifference <= 0 ? 'exchange' : (exchangeMode && priceDifference > 0 ? 'cash' : refundType);
      const { data: ret, error: re } = await supabase.from('sales_returns').insert({
        return_no, original_sale_id: sale.id, refund_amount: finalRefund,
        refund_type: effectiveRefundType, reason, branch_id: branchId, created_by: createdBy,
      }).select().single();
      if (re) throw re;

      // Insert return items
      const returnItemsToInsert = items.map((i) => {
        const ex = Object.values(selectedExchanges).find((e) => exchangeQty[e.variant_id]);
        return {
          return_id: ret.id, sale_item_id: i.id, qty: returnQty[i.id],
          exchange_variant_id: exchangeMode ? Object.keys(selectedExchanges)[0] ?? null : null,
        };
      });
      const { error: riErr } = await supabase.from('sales_return_items').insert(returnItemsToInsert);
      if (riErr) throw riErr;

      // Restock returned items + log movements
      for (const i of items) {
        const retQty = returnQty[i.id];
        const { data: inv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', branchId).eq('variant_id', i.variant_id).maybeSingle();
        if (inv) {
          const newQty = inv.quantity + retQty;
          await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
          await supabase.from('inventory_movements').insert({
            variant_id: i.variant_id, branch_id: branchId, movement_type: 'return',
            quantity_change: retQty, quantity_after: newQty,
            reference_id: ret.id, reference_type: 'sales_returns',
            note: `Return ${return_no}`, created_by: createdBy,
          });
        } else {
          await supabase.from('inventory').insert({ branch_id: branchId, variant_id: i.variant_id, quantity: retQty });
          await supabase.from('inventory_movements').insert({
            variant_id: i.variant_id, branch_id: branchId, movement_type: 'return',
            quantity_change: retQty, quantity_after: retQty,
            reference_id: ret.id, reference_type: 'sales_returns',
            note: `Return ${return_no}`, created_by: createdBy,
          });
        }
      }

      // Deduct exchange item stock + log movements
      for (const [vid, ex] of Object.entries(selectedExchanges)) {
        const qty = Number(exchangeQty[vid] ?? 0);
        if (qty <= 0) continue;
        const { data: inv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', branchId).eq('variant_id', vid).maybeSingle();
        if (inv) {
          const newQty = Math.max(0, inv.quantity - qty);
          await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
          await supabase.from('inventory_movements').insert({
            variant_id: vid, branch_id: branchId, movement_type: 'exchange_out',
            quantity_change: -qty, quantity_after: newQty,
            reference_id: ret.id, reference_type: 'sales_returns',
            note: `Exchange ${return_no}`, created_by: createdBy,
          });
        }
      }

      // Update customer purchase history
      if (sale.customer_id) {
        const { data: cust } = await supabase.from('customers').select('total_spent,loyalty_points').eq('id', sale.customer_id).maybeSingle();
        if (cust) {
          await supabase.from('customers').update({
            total_spent: Math.max(0, Number(cust.total_spent) - finalRefund),
            loyalty_points: Math.max(0, cust.loyalty_points - Math.floor(finalRefund / 10)),
          }).eq('id', sale.customer_id);
        }
      }

      // Update sale status
      const allReturned = sale.items.every((i) => i.alreadyReturned + (returnQty[i.id] ?? 0) >= i.qty);
      const anyReturned = sale.items.some((i) => (returnQty[i.id] ?? 0) > 0);
      if (allReturned) {
        await supabase.from('sales').update({ status: 'returned' }).eq('id', sale.id);
      } else if (anyReturned) {
        await supabase.from('sales').update({ status: 'partial' }).eq('id', sale.id);
      }

      success(`Return ${return_no} processed — ${formatMoney(finalRefund)} ${exchangeMode ? 'exchange' : refundType}`);
      await logAudit('processed_return', 'sales_returns', ret.id, { return_no, refund: finalRefund, reason, exchange: exchangeMode });

      // Build return receipt
      const receiptLines: ReturnReceiptLine[] = items.map((i) => {
        const ex = exchangeMode ? Object.values(selectedExchanges)[0] : null;
        return {
          name: i.name, size: i.size, color: i.color, sku: i.sku,
          qty: returnQty[i.id], unit_price: i.unit_price,
          exchangeName: ex?.name ?? null, exchangeSize: ex?.size ?? null, exchangePrice: ex?.price ?? null,
        };
      });
      const receiptData: ReturnReceiptData = {
        return_no, original_receipt_no: sale.receipt_no,
        lines: receiptLines, refund_amount: finalRefund,
        refund_method: exchangeMode ? (priceDifference > 0 ? `${formatMoney(priceDifference)} due` : 'Even Exchange') : refundType,
        reason, price_difference: priceDifference,
        cashier: cashierName,
        branchName: sale.branch_name,
        branchAddress: null, branchPhone: null,
        customer: sale.customer_name, date: new Date().toLocaleString('en-PK'),
      };
      onDone(receiptData);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to process return');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Process Return — ${sale.receipt_no}`} size="xl">
      <div className="space-y-4">
        {/* Original sale info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 text-sm">
          <div><span className="text-slate-500 dark:text-slate-400 block text-xs">Date</span><span className="font-medium text-slate-900 dark:text-white">{formatDateTime(sale.created_at)}</span></div>
          <div><span className="text-slate-500 dark:text-slate-400 block text-xs">Customer</span><span className="font-medium text-slate-900 dark:text-white">{sale.customer_name ?? 'Walk-in'}</span></div>
          <div><span className="text-slate-500 dark:text-slate-400 block text-xs">Cashier</span><span className="font-medium text-slate-900 dark:text-white">{sale.cashier_name ?? '—'}</span></div>
          <div><span className="text-slate-500 dark:text-slate-400 block text-xs">Original Total</span><span className="font-bold text-slate-900 dark:text-white">{formatMoney(sale.total)}</span></div>
        </div>

        {/* Returnable items */}
        <div>
          <h4 className="font-medium text-slate-900 dark:text-white mb-2 text-sm">Select items to return:</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {returnableItems.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">All items from this sale have already been returned.</p>
            ) : (
              returnableItems.map((i) => {
                const max = i.qty - i.alreadyReturned;
                const qty = returnQty[i.id] ?? 0;
                return (
                  <div key={i.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                    qty > 0 ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                      {i.image_url ? <img src={i.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{i.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {i.color ?? '—'} · Sz {i.size} · {formatMoney(i.unit_price)}
                      </p>
                      <p className="text-xs text-slate-400">Sold: {i.qty} · Already returned: {i.alreadyReturned} · Current stock: {i.stock}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setReturnQty((p) => ({ ...p, [i.id]: Math.max(0, (p[i.id] ?? 0) - 1) }))}
                        className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
                      >−</button>
                      <input
                        type="number"
                        min={0}
                        max={max}
                        value={qty || ''}
                        onChange={(e) => setReturnQty((p) => ({ ...p, [i.id]: Math.min(max, Math.max(0, Number(e.target.value))) }))}
                        placeholder="0"
                        className="w-14 text-center px-2 py-1 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md text-sm"
                      />
                      <button
                        onClick={() => setReturnQty((p) => ({ ...p, [i.id]: Math.min(max, (p[i.id] ?? 0) + 1) }))}
                        className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"
                      >+</button>
                      <button
                        onClick={() => setReturnQty((p) => ({ ...p, [i.id]: max }))}
                        className="ml-1 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600"
                      >All</button>
                    </div>
                    <span className="w-20 text-right text-sm font-medium text-slate-900 dark:text-white shrink-0">
                      {qty > 0 ? formatMoney(qty * i.unit_price) : '—'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Exchange toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setExchangeMode(!exchangeMode); setSelectedExchanges({}); setExchangeQty({}); }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              exchangeMode
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <RotateCcw size={14} /> Exchange Mode {exchangeMode ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Exchange item search */}
        {exchangeMode && (
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-3 bg-blue-50/50 dark:bg-blue-900/10">
            <h4 className="font-medium text-sm text-slate-900 dark:text-white">Select replacement items:</h4>
            <div className="flex gap-2">
              <SearchInput value={exchangeSearch} onChange={setExchangeSearch} placeholder="Search products for exchange..." className="flex-1" />
              <Button variant="secondary" size="sm" onClick={searchExchangeItems}><Search size={14} /> Find</Button>
            </div>
            {exchangeResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {exchangeResults.map((e) => (
                  <div key={e.variant_id} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                      {e.image_url ? <img src={e.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{e.name}</p>
                      <p className="text-xs text-slate-500">{e.color ?? '—'} · Sz {e.size} · {formatMoney(e.price)} · {e.stock} in stock</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={e.stock}
                      value={exchangeQty[e.variant_id] ?? ''}
                      onChange={(ev) => {
                        const q = Math.min(e.stock, Math.max(0, Number(ev.target.value)));
                        setExchangeQty((p) => ({ ...p, [e.variant_id]: String(q) }));
                        if (q > 0) setSelectedExchanges((p) => ({ ...p, [e.variant_id]: e }));
                        else setSelectedExchanges((p) => { const n = { ...p }; delete n[e.variant_id]; return n; });
                      }}
                      placeholder="0"
                      className="w-14 text-center px-2 py-1 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
            {Object.keys(selectedExchanges).length > 0 && (
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Exchange total: <strong>{formatMoney(exchangeTotal)}</strong>
              </div>
            )}
          </div>
        )}

        {/* Reason + Refund method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Return Reason"
            value={reason}
            onChange={setReason}
            options={[{ value: '', label: 'Select reason...' }, ...RETURN_REASONS.map((r) => ({ value: r, label: r }))]}
            required
          />
          {!exchangeMode && (
            <Select
              label="Refund Method"
              value={refundType}
              onChange={setRefundType}
              options={REFUND_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            />
          )}
        </div>

        {/* Summary */}
        <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Return Value</span>
            <span className="font-medium text-slate-900 dark:text-white">{formatMoney(refundAmount)}</span>
          </div>
          {exchangeMode && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Exchange Value</span>
                <span className="font-medium text-slate-900 dark:text-white">{formatMoney(exchangeTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Price Difference</span>
                <span className={`font-bold ${priceDifference > 0 ? 'text-red-600' : priceDifference < 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                  {priceDifference > 0 ? `Customer pays ${formatMoney(priceDifference)}` : priceDifference < 0 ? `Refund ${formatMoney(Math.abs(priceDifference))}` : 'Even exchange'}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{exchangeMode ? 'Net Refund' : 'Refund Amount'}</span>
            <span className="text-xl font-bold text-emerald-600">{formatMoney(finalRefund)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={save} disabled={saving || !reason}>
            {saving ? <Spinner className="mx-auto" /> : <><CheckCircle2 size={16} className="inline mr-1" />Process Return</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
