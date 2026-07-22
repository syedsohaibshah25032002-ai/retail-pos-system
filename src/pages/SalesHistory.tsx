import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  PageContainer, PageHeader, Card, Button, Input, Select, Badge, Spinner,
  EmptyState, SearchInput, Modal, ConfirmDialog,
} from '../components/ui';
import { formatMoney, formatDateTime } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import {
  Search, Filter, Eye, Printer, RotateCcw, Ban, Receipt, Package,
  Calendar, User, Phone, Barcode, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ReceiptModal, type ReceiptData, type ReceiptLine } from './pos/Receipt';

const SALE_SELECT = `
  id, receipt_no, invoice_no, branch_id, cashier_id, customer_id,
  subtotal, discount, tax, total, status, created_at,
  customer:customers(name, mobile),
  cashier:profiles(name),
  branch:branches(name, address, phone),
  payments(method, amount, cash_amount, card_amount, change_amount, reference_no)
`;

type SaleRow = {
  id: string;
  receipt_no: string;
  invoice_no: string | null;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  created_at: string;
  customer: { name: string | null; mobile: string | null } | null;
  cashier: { name: string | null } | null;
  branch: { name: string; address: string | null; phone: string | null } | null;
  payments: { method: string; amount: number; cash_amount: number; card_amount: number; change_amount: number; reference_no: string | null }[];
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  variant_id: string;
  qty: number;
  unit_price: number;
  line_total: number;
  name: string;
  size: string;
  color: string | null;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  alreadyReturned: number;
};

type SearchMode = 'receipt' | 'barcode' | 'customer' | 'phone' | 'date';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', split: 'Split', bank: 'Bank',
  jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', credit: 'Credit',
};

export function SalesHistory({ onNavigate }: { onNavigate: (k: 'returns') => void }) {
  const { profile } = useAuth();
  const { success, error } = useToast();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  // Search
  const [searchMode, setSearchMode] = useState<SearchMode>('receipt');
  const [search, setSearch] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<SaleRow[]>([]);
  const [searching, setSearching] = useState(false);

  // Filters
  const [branchFilter, setBranchFilter] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Detail modal
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Print receipt
  const [printReceipt, setPrintReceipt] = useState<ReceiptData | null>(null);

  // Void
  const [voidTarget, setVoidTarget] = useState<SaleRow | null>(null);

  // Ref data
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[]>([]);
  const canVoid = profile && ['super_admin', 'owner', 'manager'].includes(profile.role);

  useEffect(() => {
    supabase.from('branches').select('id,name').order('name').then(({ data }) => setBranches(data ?? []));
    supabase.from('profiles').select('id,name').order('name').then(({ data }) => setCashiers(data ?? []));
  }, []);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('sales').select(SALE_SELECT, { count: 'exact' });
      if (branchFilter) q = q.eq('branch_id', branchFilter);
      if (cashierFilter) q = q.eq('cashier_id', cashierFilter);
      q = q.order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
      const { data, count, error: qErr } = await q;
      if (qErr) throw new Error(qErr.message);
      let rows = ((data ?? []) as unknown as SaleRow[]);
      if (paymentFilter) {
        rows = rows.filter((s) => s.payments?.some((p) => p.method === paymentFilter));
      }
      setSales(rows);
      setTotalPages(Math.max(1, Math.ceil((count ?? 0) / pageSize)));
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [page, branchFilter, cashierFilter, paymentFilter, error]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const doSearch = async (mode: SearchMode, term: string, dateVal?: string) => {
    setSearching(true);
    setHasSearched(true);
    try {
      let query;
      if (mode === 'receipt') {
        query = supabase.from('sales').select(SALE_SELECT).ilike('receipt_no', `%${term}%`).order('created_at', { ascending: false }).limit(20);
      } else if (mode === 'date') {
        if (!dateVal) { error('Select a date'); return; }
        query = supabase.from('sales').select(SALE_SELECT).gte('created_at', `${dateVal}T00:00:00`).lte('created_at', `${dateVal}T23:59:59`).order('created_at', { ascending: false }).limit(20);
      } else if (mode === 'customer') {
        const { data: custs, error: cErr } = await supabase.from('customers').select('id').ilike('name', `%${term}%`);
        if (cErr) throw new Error(cErr.message);
        if (!custs?.length) { setSearchResults([]); return; }
        query = supabase.from('sales').select(SALE_SELECT).in('customer_id', custs.map((c) => c.id)).order('created_at', { ascending: false }).limit(20);
      } else if (mode === 'phone') {
        const { data: custs, error: cErr } = await supabase.from('customers').select('id').ilike('mobile', `%${term}%`);
        if (cErr) throw new Error(cErr.message);
        if (!custs?.length) { setSearchResults([]); return; }
        query = supabase.from('sales').select(SALE_SELECT).in('customer_id', custs.map((c) => c.id)).order('created_at', { ascending: false }).limit(20);
      } else {
        // barcode
        const { data: variants, error: vErr } = await supabase.from('product_variants').select('id').ilike('barcode', `%${term}%`);
        if (vErr) throw new Error(vErr.message);
        const { data: products, error: pErr } = await supabase.from('products').select('id').ilike('barcode', `%${term}%`);
        if (pErr) throw new Error(pErr.message);
        const pIds = (products ?? []).map((p) => p.id);
        let moreVIds: string[] = [];
        if (pIds.length > 0) {
          const { data: mvs, error: mvErr } = await supabase.from('product_variants').select('id').in('product_id', pIds);
          if (mvErr) throw new Error(mvErr.message);
          moreVIds = (mvs ?? []).map((v) => v.id);
        }
        const allVIds = [...new Set([...(variants ?? []).map((v) => v.id), ...moreVIds])];
        if (!allVIds.length) { setSearchResults([]); return; }
        const { data: sItems, error: siErr } = await supabase.from('sale_items').select('sale_id').in('variant_id', allVIds);
        if (siErr) throw new Error(siErr.message);
        const saleIds = [...new Set((sItems ?? []).map((si) => si.sale_id))];
        if (!saleIds.length) { setSearchResults([]); return; }
        query = supabase.from('sales').select(SALE_SELECT).in('id', saleIds).order('created_at', { ascending: false }).limit(20);
      }
      const { data, error: qErr } = await query;
      if (qErr) throw new Error(qErr.message);
      setSearchResults((data ?? []) as unknown as SaleRow[]);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = () => doSearch(searchMode, search.trim(), searchDate);

  const openDetail = async (sale: SaleRow) => {
    setSelectedSale(sale);
    setShowDetail(true);
    setLoadingItems(true);
    try {
      const { data: items, error: iErr } = await supabase
        .from('sale_items')
        .select('id,sale_id,variant_id,qty,unit_price,line_total')
        .eq('sale_id', sale.id);
      if (iErr) throw new Error(iErr.message);
      const vIds = [...new Set((items ?? []).map((i) => i.variant_id))];
      const { data: variants, error: vErr } = await supabase
        .from('product_variants')
        .select('id,product_id,size,barcode,sku')
        .in('id', vIds);
      if (vErr) throw new Error(vErr.message);
      const pIds = [...new Set((variants ?? []).map((v) => v.product_id))];
      const { data: products, error: pErr } = await supabase
        .from('products')
        .select('id,name,color,image_url')
        .in('id', pIds);
      if (pErr) throw new Error(pErr.message);
      const pMap = new Map((products ?? []).map((p) => [p.id, p]));
      const vMap = new Map((variants ?? []).map((v) => [v.id, v]));
      const siIds = (items ?? []).map((i) => i.id);
      let returnedMap = new Map<string, number>();
      if (siIds.length > 0) {
        const { data: ri } = await supabase.from('sales_return_items').select('sale_item_id,qty').in('sale_item_id', siIds);
        (ri ?? []).forEach((r) => returnedMap.set(r.sale_item_id, (returnedMap.get(r.sale_item_id) ?? 0) + r.qty));
      }
      const rows: SaleItemRow[] = (items ?? []).map((i) => {
        const v = vMap.get(i.variant_id);
        const p = v ? pMap.get(v.product_id) : null;
        return {
          id: i.id, sale_id: i.sale_id, variant_id: i.variant_id,
          qty: i.qty, unit_price: Number(i.unit_price), line_total: Number(i.line_total),
          name: p?.name ?? 'Unknown', size: v?.size ?? '?',
          color: p?.color ?? null, sku: v?.sku ?? null,
          barcode: v?.barcode ?? null, image_url: p?.image_url ?? null,
          alreadyReturned: returnedMap.get(i.id) ?? 0,
        };
      });
      setSaleItems(rows);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load items');
    } finally {
      setLoadingItems(false);
    }
  };

  const handlePrint = async (sale: SaleRow) => {
    // Load items if not already loaded
    let items = saleItems;
    if (items.length === 0 || items[0]?.sale_id !== sale.id) {
      const { data: si } = await supabase
        .from('sale_items')
        .select('id,variant_id,qty,unit_price,line_total')
        .eq('sale_id', sale.id);
      const vIds = [...new Set((si ?? []).map((i) => i.variant_id))];
      const { data: variants } = await supabase.from('product_variants').select('id,product_id,size,barcode,sku').in('id', vIds);
      const pIds = [...new Set((variants ?? []).map((v) => v.product_id))];
      const { data: products } = await supabase.from('products').select('id,name,color').in('id', pIds);
      const pMap = new Map((products ?? []).map((p) => [p.id, p]));
      const vMap = new Map((variants ?? []).map((v) => [v.id, v]));
      items = (si ?? []).map((i) => {
        const v = vMap.get(i.variant_id);
        const p = v ? pMap.get(v.product_id) : null;
        return {
          id: i.id, sale_id: sale.id, variant_id: i.variant_id,
          qty: i.qty, unit_price: Number(i.unit_price), line_total: Number(i.line_total),
          name: p?.name ?? 'Unknown', size: v?.size ?? '?',
          color: p?.color ?? null, sku: v?.sku ?? null,
          barcode: v?.barcode ?? null, image_url: null, alreadyReturned: 0,
        };
      });
    }
    const pay = sale.payments?.[0];
    const lines: ReceiptLine[] = items.map((i) => ({
      variant_id: i.variant_id, name: i.name, size: i.size, color: i.color,
      sku: i.sku, price: i.unit_price, qty: i.qty,
    }));
    const receipt: ReceiptData = {
      receipt_no: sale.receipt_no, lines,
      subtotal: sale.subtotal, discount: sale.discount, discountType: 'fixed',
      tax: sale.tax, taxRate: sale.subtotal > 0 ? (sale.tax / sale.subtotal) * 100 : 0,
      total: sale.total, method: PAYMENT_LABELS[pay?.method ?? 'cash'] ?? 'Cash',
      cashGiven: pay ? Number(pay.cash_amount) + Number(pay.card_amount) : sale.total,
      change: pay ? Number(pay.change_amount) : 0,
      cardRef: pay?.reference_no ?? null,
      customer: sale.customer?.name ?? null, customerMobile: sale.customer?.mobile ?? null,
      loyaltyEarned: 0, cashier: sale.cashier?.name ?? '—',
      branchName: sale.branch?.name ?? '', branchAddress: sale.branch?.address ?? null,
      branchPhone: sale.branch?.phone ?? null, date: sale.created_at,
    };
    setPrintReceipt(receipt);
  };

  const handleVoid = async () => {
    if (!voidTarget) return;
    try {
      await supabase.from('sales').update({ status: 'void' }).eq('id', voidTarget.id);
      await logAudit('void_sale', 'sales', voidTarget.id, { receipt_no: voidTarget.receipt_no });
      success(`Sale ${voidTarget.receipt_no} voided`);
      setVoidTarget(null);
      loadSales();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to void sale');
    }
  };

  const displaySales = searchResults.length > 0 || (hasSearched && !searching) ? searchResults : sales;

  return (
    <PageContainer>
      <PageHeader title="Sales History" subtitle="View all completed POS sales, search invoices, and process returns" />

      {/* Search section */}
      <Card className="p-4 mb-4 dark:bg-slate-800">
        <div className="flex flex-wrap gap-2 mb-3">
          {([
            { key: 'receipt', label: 'Receipt No', Icon: Receipt },
            { key: 'barcode', label: 'Barcode', Icon: Barcode },
            { key: 'customer', label: 'Customer', Icon: User },
            { key: 'phone', label: 'Phone', Icon: Phone },
            { key: 'date', label: 'Date', Icon: Calendar },
          ] as { key: SearchMode; label: string; Icon: typeof Receipt }[]).map((m) => {
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
                searchMode === 'receipt' ? 'Enter receipt number...' :
                searchMode === 'barcode' ? 'Scan or enter barcode...' :
                searchMode === 'customer' ? 'Customer name...' : 'Phone number...'
              }
              className="flex-1"
            />
          )}
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? <Spinner /> : <><Search size={16} /> Search</>}
          </Button>
          {(hasSearched || search) && (
            <Button variant="secondary" onClick={() => { setSearch(''); setSearchResults([]); setHasSearched(false); }}>Clear</Button>
          )}
        </div>
      </Card>

      {/* Filters */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          {hasSearched ? `Search Results (${searchResults.length})` : 'All Sales'}
        </h3>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <Filter size={14} /> Filters
        </button>
      </div>

      {showFilters && (
        <Card className="p-4 mb-4 dark:bg-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Branch" value={branchFilter} onChange={setBranchFilter} options={[{ value: '', label: 'All Branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
            <Select label="Cashier" value={cashierFilter} onChange={setCashierFilter} options={[{ value: '', label: 'All Cashiers' }, ...cashiers.map((c) => ({ value: c.id, label: c.name }))]} />
            <Select label="Payment Method" value={paymentFilter} onChange={setPaymentFilter} options={[
              { value: '', label: 'All Methods' },
              { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' },
              { value: 'split', label: 'Split' }, { value: 'bank', label: 'Bank' },
              { value: 'jazzcash', label: 'JazzCash' }, { value: 'easypaisa', label: 'EasyPaisa' },
              { value: 'credit', label: 'Credit' },
            ]} />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={() => { setBranchFilter(''); setCashierFilter(''); setPaymentFilter(''); }}>Clear</Button>
            <Button size="sm" onClick={() => { setPage(0); loadSales(); }}>Apply</Button>
          </div>
        </Card>
      )}

      {/* Sales table */}
      {loading ? (
        <Card className="p-8 flex justify-center"><Spinner className="text-slate-400" /></Card>
      ) : displaySales.length === 0 ? (
        <Card><EmptyState message={hasSearched ? 'No sales found matching your search.' : 'No sales recorded yet.'} /></Card>
      ) : (
        <Card className="overflow-hidden dark:bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Receipt No</th>
                  <th className="text-left px-4 py-3 font-medium">Invoice No</th>
                  <th className="text-left px-4 py-3 font-medium">Date & Time</th>
                  <th className="text-left px-4 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Cashier</th>
                  <th className="text-left px-4 py-3 font-medium">Branch</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Payment</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {displaySales.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                    onClick={() => openDetail(s)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.receipt_no}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.invoice_no ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.customer?.name ?? 'Walk-in'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.customer?.mobile ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.cashier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.branch?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{formatMoney(s.total)}</td>
                    <td className="px-4 py-3"><Badge color="blue">{PAYMENT_LABELS[s.payments?.[0]?.method ?? 'cash'] ?? s.payments?.[0]?.method ?? '—'}</Badge></td>
                    <td className="px-4 py-3">
                      <Badge color={s.status === 'completed' ? 'green' : s.status === 'returned' ? 'red' : s.status === 'partial' ? 'amber' : 'slate'}>{s.status}</Badge>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openDetail(s)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600" title="View"><Eye size={15} /></button>
                        <button onClick={() => handlePrint(s)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600" title="Print"><Printer size={15} /></button>
                        <button onClick={() => onNavigate('returns')} className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Return / Exchange"><RotateCcw size={15} /></button>
                        {canVoid && s.status !== 'void' && (
                          <button onClick={() => setVoidTarget(s)} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Void Sale"><Ban size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasSearched && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
              <span className="text-sm text-slate-500">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Prev</Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={14} /></Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Sale Detail Modal */}
      {showDetail && selectedSale && (
        <Modal open onClose={() => { setShowDetail(false); setSelectedSale(null); setSaleItems([]); }} title={`Invoice ${selectedSale.receipt_no}`} size="xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 text-sm">
              <div><span className="text-slate-500 block text-xs">Receipt No</span><span className="font-medium text-slate-900 dark:text-white">{selectedSale.receipt_no}</span></div>
              <div><span className="text-slate-500 block text-xs">Invoice No</span><span className="font-medium text-slate-900 dark:text-white">{selectedSale.invoice_no ?? '—'}</span></div>
              <div><span className="text-slate-500 block text-xs">Date & Time</span><span className="font-medium text-slate-900 dark:text-white">{formatDateTime(selectedSale.created_at)}</span></div>
              <div><span className="text-slate-500 block text-xs">Status</span><Badge color={selectedSale.status === 'completed' ? 'green' : selectedSale.status === 'returned' ? 'red' : 'amber'}>{selectedSale.status}</Badge></div>
              <div><span className="text-slate-500 block text-xs">Customer</span><span className="font-medium text-slate-900 dark:text-white">{selectedSale.customer?.name ?? 'Walk-in'}</span></div>
              <div><span className="text-slate-500 block text-xs">Phone</span><span className="font-medium text-slate-900 dark:text-white">{selectedSale.customer?.mobile ?? '—'}</span></div>
              <div><span className="text-slate-500 block text-xs">Cashier</span><span className="font-medium text-slate-900 dark:text-white">{selectedSale.cashier?.name ?? '—'}</span></div>
              <div><span className="text-slate-500 block text-xs">Branch</span><span className="font-medium text-slate-900 dark:text-white">{selectedSale.branch?.name ?? '—'}</span></div>
            </div>

            {/* Items */}
            <div>
              <h4 className="font-medium text-slate-900 dark:text-white mb-2 text-sm">Items Sold</h4>
              {loadingItems ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Product</th>
                        <th className="text-left px-3 py-2 font-medium">Barcode</th>
                        <th className="text-left px-3 py-2 font-medium">Size</th>
                        <th className="text-left px-3 py-2 font-medium">Color</th>
                        <th className="text-right px-3 py-2 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 font-medium">Price</th>
                        <th className="text-right px-3 py-2 font-medium">Total</th>
                        <th className="text-right px-3 py-2 font-medium">Returned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {saleItems.map((i) => (
                        <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                                {i.image_url ? <img src={i.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-slate-400" />}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-white">{i.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-xs">{i.barcode ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{i.size}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{i.color ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-900 dark:text-white">{i.qty}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatMoney(i.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-white">{formatMoney(i.line_total)}</td>
                          <td className="px-3 py-2 text-right">
                            {i.alreadyReturned > 0 ? <Badge color="amber">{i.alreadyReturned}</Badge> : <span className="text-slate-400">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Subtotal</span><span className="font-medium text-slate-900 dark:text-white">{formatMoney(selectedSale.subtotal)}</span></div>
              {selectedSale.discount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Discount</span><span className="font-medium text-red-600">-{formatMoney(selectedSale.discount)}</span></div>}
              {selectedSale.tax > 0 && <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Tax</span><span className="font-medium text-slate-900 dark:text-white">{formatMoney(selectedSale.tax)}</span></div>}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-slate-700"><span className="text-slate-900 dark:text-white">Grand Total</span><span className="text-emerald-600">{formatMoney(selectedSale.total)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Payment Method</span><span className="font-medium text-slate-900 dark:text-white">{PAYMENT_LABELS[selectedSale.payments?.[0]?.method ?? 'cash'] ?? '—'}</span></div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => handlePrint(selectedSale)}><Printer size={16} /> Print Receipt</Button>
              <Button variant="secondary" onClick={() => { setShowDetail(false); setSelectedSale(null); onNavigate('returns'); }}><RotateCcw size={16} /> Return / Exchange</Button>
              {canVoid && selectedSale.status !== 'void' && <Button variant="danger" onClick={() => { setVoidTarget(selectedSale); setShowDetail(false); }}><Ban size={16} /> Void Sale</Button>}
            </div>
          </div>
        </Modal>
      )}

      {/* Print Receipt */}
      {printReceipt && <ReceiptModal receipt={printReceipt} onClose={() => setPrintReceipt(null)} />}

      {/* Void Confirmation */}
      <ConfirmDialog
        open={!!voidTarget}
        message={`Void sale ${voidTarget?.receipt_no ?? ''}? This will mark the sale as voided. This action cannot be undone.`}
        confirmLabel="Void Sale"
        onConfirm={handleVoid}
        onCancel={() => setVoidTarget(null)}
      />
    </PageContainer>
  );
}
