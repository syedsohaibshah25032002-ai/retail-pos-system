import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  PageContainer, PageHeader, Card, Button, Select, Input, Modal, Badge,
  Spinner, EmptyState, ErrorState, ConfirmDialog, SearchInput, Pagination, TableSkeleton,
} from '../components/ui';
import { formatDate, genReceiptNo } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, ArrowLeftRight, Check, X, Truck, Search, Filter, Package, History } from 'lucide-react';

type TransferItem = { variant_id: string; qty: number; name: string; size: string; color: string | null; sku: string | null };

type Transfer = {
  id: string;
  transfer_no: string;
  from_branch_id: string;
  to_branch_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  note: string | null;
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  items: TransferItem[];
};

const PAGE_SIZE = 10;

export function Transfers() {
  const { profile } = useAuth();
  const { success, error } = useToast();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve' | 'reject' | 'complete'; transfer: Transfer } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [t, b, p] = await Promise.all([
        supabase.from('stock_transfers').select('*').order('created_at', { ascending: false }),
        supabase.from('branches').select('id,name').order('name'),
        supabase.from('profiles').select('id,name'),
      ]);
      if (t.error) throw t.error;
      setBranches(b.data ?? []);
      setProfiles(new Map((p.data ?? []).map((x) => [x.id, x.name])));
      const ids = (t.data ?? []).map((x) => x.id);
      if (ids.length === 0) {
        setTransfers([]);
        setLoading(false);
        return;
      }
      const { data: items, error: ie } = await supabase
        .from('stock_transfer_items')
        .select('transfer_id,variant_id,qty')
        .in('transfer_id', ids);
      if (ie) throw ie;
      const vIds = [...new Set((items ?? []).map((i) => i.variant_id))];
      let vMap = new Map<string, { product_id: string; size: string; barcode: string | null; sku: string | null }>();
      let pMap = new Map<string, { name: string; color: string | null }>();
      if (vIds.length > 0) {
        const { data: variants } = await supabase
          .from('product_variants')
          .select('id,product_id,size,barcode,sku')
          .in('id', vIds);
        const pIds = [...new Set((variants ?? []).map((v) => v.product_id))];
        const { data: products } = await supabase
          .from('products')
          .select('id,name,color')
          .in('id', pIds);
        pMap = new Map((products ?? []).map((p) => [p.id, p]));
        vMap = new Map((variants ?? []).map((v) => [v.id, v]));
      }
      const itemsByT = new Map<string, TransferItem[]>();
      (items ?? []).forEach((i) => {
        const v = vMap.get(i.variant_id);
        const p = v ? pMap.get(v.product_id) : null;
        const arr = itemsByT.get(i.transfer_id) ?? [];
        arr.push({
          variant_id: i.variant_id,
          qty: i.qty,
          name: p?.name ?? '?',
          size: v?.size ?? '?',
          color: p?.color ?? null,
          sku: v?.sku ?? null,
        });
        itemsByT.set(i.transfer_id, arr);
      });
      setTransfers(
        (t.data ?? []).map((x) => ({
          ...x,
          items: itemsByT.get(x.id) ?? [],
        })) as Transfer[]
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '?';
  const userName = (id: string | null) => (id ? profiles.get(id) ?? 'User' : '—');
  const statusColor = (s: string) =>
    (s === 'completed' ? 'green' : s === 'approved' ? 'blue' : s === 'rejected' ? 'red' : 'amber') as 'green' | 'blue' | 'red' | 'amber';

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return transfers.filter((t) => {
      const matchSearch =
        !q ||
        t.transfer_no.toLowerCase().includes(q) ||
        branchName(t.from_branch_id).toLowerCase().includes(q) ||
        branchName(t.to_branch_id).toLowerCase().includes(q) ||
        t.items.some((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [transfers, search, statusFilter, branches]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      const { transfer, type } = confirmAction;
      if (type === 'approve') {
        const { error: e } = await supabase
          .from('stock_transfers')
          .update({ status: 'approved', approved_by: profile?.id ?? null })
          .eq('id', transfer.id);
        if (e) throw e;
        success('Transfer approved');
        await logAudit('approved_transfer', 'stock_transfers', transfer.id, { transfer_no: transfer.transfer_no });
      } else if (type === 'reject') {
        const { error: e } = await supabase
          .from('stock_transfers')
          .update({ status: 'rejected', approved_by: profile?.id ?? null })
          .eq('id', transfer.id);
        if (e) throw e;
        success('Transfer rejected');
        await logAudit('rejected_transfer', 'stock_transfers', transfer.id, { transfer_no: transfer.transfer_no });
      } else if (type === 'complete') {
        for (const item of transfer.items) {
          const { data: fromInv } = await supabase
            .from('inventory')
            .select('id,quantity')
            .eq('branch_id', transfer.from_branch_id)
            .eq('variant_id', item.variant_id)
            .maybeSingle();
          if (fromInv) {
            const newFromQty = Math.max(0, fromInv.quantity - item.qty);
            await supabase.from('inventory').update({ quantity: newFromQty }).eq('id', fromInv.id);
            await supabase.from('inventory_movements').insert({
              variant_id: item.variant_id,
              branch_id: transfer.from_branch_id,
              movement_type: 'transfer_out',
              quantity_change: -item.qty,
              quantity_after: newFromQty,
              reference_id: transfer.id,
              reference_type: 'stock_transfers',
              note: `Transfer ${transfer.transfer_no} out`,
              created_by: profile?.id ?? null,
            });
          }
          const { data: toInv } = await supabase
            .from('inventory')
            .select('id,quantity')
            .eq('branch_id', transfer.to_branch_id)
            .eq('variant_id', item.variant_id)
            .maybeSingle();
          if (toInv) {
            const newToQty = toInv.quantity + item.qty;
            await supabase.from('inventory').update({ quantity: newToQty }).eq('id', toInv.id);
            await supabase.from('inventory_movements').insert({
              variant_id: item.variant_id,
              branch_id: transfer.to_branch_id,
              movement_type: 'transfer_in',
              quantity_change: item.qty,
              quantity_after: newToQty,
              reference_id: transfer.id,
              reference_type: 'stock_transfers',
              note: `Transfer ${transfer.transfer_no} in`,
              created_by: profile?.id ?? null,
            });
          } else {
            await supabase.from('inventory').insert({
              branch_id: transfer.to_branch_id,
              variant_id: item.variant_id,
              quantity: item.qty,
            });
            await supabase.from('inventory_movements').insert({
              variant_id: item.variant_id,
              branch_id: transfer.to_branch_id,
              movement_type: 'transfer_in',
              quantity_change: item.qty,
              quantity_after: item.qty,
              reference_id: transfer.id,
              reference_type: 'stock_transfers',
              note: `Transfer ${transfer.transfer_no} in`,
              created_by: profile?.id ?? null,
            });
          }
        }
        const { error: e } = await supabase
          .from('stock_transfers')
          .update({ status: 'completed' })
          .eq('id', transfer.id);
        if (e) throw e;
        success('Transfer completed — stock moved');
        await logAudit('completed_transfer', 'stock_transfers', transfer.id, { transfer_no: transfer.transfer_no });
      }
      setConfirmAction(null);
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmMessage = confirmAction
    ? confirmAction.type === 'approve'
      ? `Approve transfer ${confirmAction.transfer.transfer_no}?`
      : confirmAction.type === 'reject'
      ? `Reject transfer ${confirmAction.transfer.transfer_no}? This cannot be undone.`
      : `Complete transfer ${confirmAction.transfer.transfer_no}? Stock will be moved from ${branchName(confirmAction.transfer.from_branch_id)} to ${branchName(confirmAction.transfer.to_branch_id)}.`
    : '';

  const confirmLabel = confirmAction
    ? confirmAction.type === 'approve' ? 'Approve' : confirmAction.type === 'reject' ? 'Reject' : 'Complete'
    : 'Confirm';

  const stats = useMemo(() => ({
    pending: transfers.filter((t) => t.status === 'pending').length,
    approved: transfers.filter((t) => t.status === 'approved').length,
    completed: transfers.filter((t) => t.status === 'completed').length,
    rejected: transfers.filter((t) => t.status === 'rejected').length,
  }), [transfers]);

  return (
    <PageContainer>
      <PageHeader
        title="Stock Transfers"
        subtitle="Move inventory between branches with approval workflow"
        action={<Button onClick={() => setShowForm(true)}><Plus size={16} /> New Transfer</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4"><p className="text-xs text-slate-500">Pending</p><p className="text-xl font-bold text-amber-600">{stats.pending}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Approved</p><p className="text-xl font-bold text-blue-600">{stats.approved}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Completed</p><p className="text-xl font-bold text-emerald-600">{stats.completed}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Rejected</p><p className="text-xl font-bold text-red-600">{stats.rejected}</p></Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search transfer no, branch, product..." className="flex-1 min-w-[200px]" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Filter by status"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <Card><TableSkeleton /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={load} /></Card>
      ) : paged.length === 0 ? (
        <Card><EmptyState message="No transfers found. Create a new stock transfer to move inventory between branches." actionLabel="New Transfer" onAction={() => setShowForm(true)} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {paged.map((t) => (
              <div key={t.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="text-slate-600 dark:text-slate-300" size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{t.transfer_no}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {branchName(t.from_branch_id)} → {branchName(t.to_branch_id)} · {formatDate(t.created_at)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created by {userName(t.created_by)}
                        {t.approved_by && t.status !== 'pending' && ` · ${t.status === 'rejected' ? 'Rejected' : 'Approved'} by ${userName(t.approved_by)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={statusColor(t.status)}>{t.status}</Badge>
                    {t.status === 'pending' && (
                      <>
                        <Button size="sm" variant="success" onClick={() => setConfirmAction({ type: 'approve', transfer: t })}>
                          <Check size={14} /> Approve
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirmAction({ type: 'reject', transfer: t })} aria-label="Reject">
                          <X size={14} />
                        </Button>
                      </>
                    )}
                    {t.status === 'approved' && (
                      <Button size="sm" onClick={() => setConfirmAction({ type: 'complete', transfer: t })}>
                        <Truck size={14} /> Complete
                      </Button>
                    )}
                  </div>
                </div>
                {t.note && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-1.5">"{t.note}"</p>}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
                  {t.items.map((i, idx) => (
                    <Badge key={idx} color="slate">
                      {i.name} (Sz {i.size}){i.color ? ` · ${i.color}` : ''} × {i.qty}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </Card>
      )}

      {showForm && (
        <TransferForm
          branches={branches}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); success('Transfer created successfully'); }}
          createdBy={profile?.id}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        message={confirmMessage}
        confirmLabel={confirmLabel}
        variant={confirmAction?.type === 'approve' ? 'success' : 'danger'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </PageContainer>
  );
}

function TransferForm({
  branches,
  onClose,
  onSaved,
  createdBy,
}: {
  branches: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  createdBy?: string;
}) {
  const { error } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ variant_id: string; name: string; size: string; color: string | null; qty: number; stock: number }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const fromStock = async (bid: string) => {
    setFrom(bid);
    setLines([]);
    setTo('');
    if (!bid) return;
    setLoadingStock(true);
    try {
      const { data: inv, error: ie } = await supabase
        .from('inventory')
        .select('variant_id,quantity')
        .eq('branch_id', bid)
        .gt('quantity', 0);
      if (ie) throw ie;
      const vIds = (inv ?? []).map((i) => i.variant_id);
      if (vIds.length === 0) return;
      const { data: variants, error: ve } = await supabase
        .from('product_variants')
        .select('id,product_id,size,barcode,sku')
        .in('id', vIds);
      if (ve) throw ve;
      const pIds = [...new Set((variants ?? []).map((v) => v.product_id))];
      const { data: products, error: pe } = await supabase
        .from('products')
        .select('id,name,color')
        .in('id', pIds);
      if (pe) throw pe;
      const pMap = new Map((products ?? []).map((p) => [p.id, p]));
      const stockMap = new Map((inv ?? []).map((i) => [i.variant_id, i.quantity]));
      setLines(
        (variants ?? []).map((v) => ({
          variant_id: v.id,
          name: pMap.get(v.product_id)?.name ?? '?',
          size: v.size,
          color: pMap.get(v.product_id)?.color ?? null,
          qty: 0,
          stock: stockMap.get(v.id) ?? 0,
        }))
      );
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load stock');
    } finally {
      setLoadingStock(false);
    }
  };

  const filtered = lines.filter(
    (l) => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.size.includes(search) || (l.color?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  const selectedCount = lines.filter((l) => l.qty > 0).length;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!from) e.from = 'Select a source branch';
    if (!to) e.to = 'Select a destination branch';
    if (from && to && from === to) e.to = 'Destination must differ from source';
    if (lines.filter((l) => l.qty > 0).length === 0) e.items = 'Add at least one item to transfer';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const transfer_no = genReceiptNo('TR');
      const items = lines.filter((l) => l.qty > 0);
      const { data: t, error: te } = await supabase
        .from('stock_transfers')
        .insert({
          transfer_no,
          from_branch_id: from,
          to_branch_id: to,
          status: 'pending',
          created_by: createdBy ?? null,
          note: note.trim() || null,
        })
        .select()
        .single();
      if (te) throw te;
      if (t) {
        const { error: ie } = await supabase
          .from('stock_transfer_items')
          .insert(items.map((i) => ({ transfer_id: t.id, variant_id: i.variant_id, qty: i.qty })));
        if (ie) throw ie;
        await logAudit('created_transfer', 'stock_transfers', t.id, { transfer_no, from, to, items: items.length });
      }
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to create transfer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New Stock Transfer" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Select
              label="From Branch"
              value={from}
              onChange={fromStock}
              options={[{ value: '', label: '— select source —' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
              required
            />
            {errs.from && <p className="text-xs text-red-500 mt-1">{errs.from}</p>}
          </div>
          <div>
            <Select
              label="To Branch"
              value={to}
              onChange={setTo}
              options={[{ value: '', label: '— select destination —' }, ...branches.filter((b) => b.id !== from).map((b) => ({ value: b.id, label: b.name }))]}
              required
            />
            {errs.to && <p className="text-xs text-red-500 mt-1">{errs.to}</p>}
          </div>
        </div>

        {from && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SearchInput value={search} onChange={setSearch} placeholder="Filter products..." className="flex-1 min-w-[180px]" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedCount} selected · {totalQty} units
              </span>
            </div>

            {loadingStock ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                <Package size={32} className="mx-auto mb-2 opacity-40" />
                No stock available at source branch.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((l) => (
                  <div key={l.variant_id} className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{l.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Size {l.size}{l.color ? ` · ${l.color}` : ''} · <span className="text-emerald-600 font-medium">{l.stock} available</span>
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={l.stock}
                      value={l.qty || ''}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.variant_id === l.variant_id
                              ? { ...x, qty: Math.min(l.stock, Math.max(0, Number(e.target.value) || 0)) }
                              : x
                          )
                        )
                      }
                      className="w-20 text-center px-2 py-1.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="0"
                      aria-label={`Transfer quantity for ${l.name} size ${l.size}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <Input label="Notes (optional)" value={note} onChange={setNote} placeholder="Reason for transfer, special instructions..." />
        {errs.items && <p className="text-xs text-red-500">{errs.items}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !from || !to}>
            {saving ? <Spinner /> : 'Create Transfer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
