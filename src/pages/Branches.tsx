import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge,
  Spinner, EmptyState, ErrorState, ConfirmDialog, SearchInput, Pagination, CardSkeleton,
} from '../components/ui';
import { formatMoney, formatNumber } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, Store, CreditCard as Edit2, Trash2, Phone, Mail, MapPin, Star, User, Package } from 'lucide-react';

type Branch = {
  id: string;
  name: string;
  type: 'warehouse' | 'shop' | 'online';
  address: string | null;
  phone: string | null;
  email: string | null;
  manager: string | null;
  is_main: boolean;
  is_active: boolean;
  created_at: string;
};

const PAGE_SIZE = 9;

export function Branches() {
  const { success, error } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, { qty: number; value: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [{ data: b, error: be }, { data: inv, error: ie }] = await Promise.all([
        supabase.from('branches').select('*').order('created_at'),
        supabase.from('inventory').select('branch_id,quantity,variant_id'),
      ]);
      if (be) throw be;
      if (ie) throw ie;
      setBranches((b ?? []) as Branch[]);
      const vIds = [...new Set((inv ?? []).map((i) => i.variant_id))];
      let priceMap = new Map<string, number>();
      if (vIds.length > 0) {
        const { data: variants } = await supabase.from('product_variants').select('id,product_id').in('id', vIds);
        const pIds = [...new Set((variants ?? []).map((v) => v.product_id))];
        if (pIds.length > 0) {
          const { data: products } = await supabase.from('products').select('id,purchase_price').in('id', pIds);
          priceMap = new Map((products ?? []).map((p) => [p.id, Number(p.purchase_price) || 0]));
        }
      }
      const map: Record<string, { qty: number; value: number }> = {};
      (inv ?? []).forEach((i: any) => {
        const cur = map[i.branch_id] ?? { qty: 0, value: 0 };
        cur.qty += i.quantity;
        const price = priceMap.get(i.variant_id) ?? 0;
        cur.value += price * i.quantity;
        map[i.branch_id] = cur;
      });
      setStockMap(map);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return branches.filter((b) => {
      const matchSearch = !q || b.name.toLowerCase().includes(q) || (b.manager?.toLowerCase().includes(q) ?? false) || (b.address?.toLowerCase().includes(q) ?? false);
      const matchType = typeFilter === 'all' || b.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [branches, search, typeFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error: e } = await supabase.from('branches').delete().eq('id', confirmDelete.id);
      if (e) throw e;
      success(`Branch "${confirmDelete.name}" deleted`);
      await logAudit('deleted_branch', 'branches', confirmDelete.id, { name: confirmDelete.name });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to delete branch');
    }
  };

  const typeColor = (t: string) => (t === 'warehouse' ? 'blue' : t === 'online' ? 'violet' : 'green') as 'blue' | 'violet' | 'green';

  return (
    <PageContainer>
      <PageHeader
        title="Branches"
        subtitle="Manage warehouses, shops, and online stores"
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> New Branch</Button>}
      />

      <Card className="p-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, manager, or address..." className="flex-1 min-w-[200px]" />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            aria-label="Filter by type"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
          >
            <option value="all">All Types</option>
            <option value="shop">Shop</option>
            <option value="warehouse">Warehouse</option>
            <option value="online">Online</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <CardSkeleton count={6} />
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={load} /></Card>
      ) : paged.length === 0 ? (
        <Card><EmptyState message="No branches found. Create your first branch to start managing inventory locations." actionLabel="New Branch" onAction={() => { setEditing(null); setShowForm(true); }} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map((b) => (
              <Card key={b.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${b.type === 'warehouse' ? 'bg-blue-100 dark:bg-blue-900/30' : b.type === 'online' ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                      <Store className={b.type === 'warehouse' ? 'text-blue-600' : b.type === 'online' ? 'text-violet-600' : 'text-emerald-600'} size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{b.name}</h3>
                        {b.is_main && <Star size={14} className="text-amber-500 fill-amber-500" />}
                      </div>
                      <Badge color={typeColor(b.type)}>{b.type}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(b); setShowForm(true); }} aria-label="Edit branch" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => setConfirmDelete(b)} aria-label="Delete branch" disabled={b.is_main} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {b.manager && (
                    <div className="flex items-center gap-2"><User size={14} className="text-slate-400 shrink-0" /><span>Manager: {b.manager}</span></div>
                  )}
                  {b.phone && (
                    <div className="flex items-center gap-2"><Phone size={14} className="text-slate-400 shrink-0" /><span>{b.phone}</span></div>
                  )}
                  {b.email && (
                    <div className="flex items-center gap-2"><Mail size={14} className="text-slate-400 shrink-0" /><span className="truncate">{b.email}</span></div>
                  )}
                  {b.address && (
                    <div className="flex items-center gap-2"><MapPin size={14} className="text-slate-400 shrink-0" /><span className="truncate">{b.address}</span></div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><Package size={14} /> Stock Units</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatNumber(stockMap[b.id]?.qty ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Inventory Value</span>
                    <span className="font-medium text-orange-600">{formatMoney(stockMap[b.id]?.value ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Status</span>
                    {b.is_active
                      ? <Badge color="green">Active</Badge>
                      : <Badge color="red">Inactive</Badge>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card><Pagination page={page} totalPages={totalPages} onPage={setPage} /></Card>
        </>
      )}

      {showForm && (
        <BranchForm
          editing={editing}
          branches={branches}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); success('Branch saved successfully'); }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        message={confirmDelete ? `Delete branch "${confirmDelete.name}"? All inventory records for this branch will be orphaned. This action cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </PageContainer>
  );
}

function BranchForm({
  editing,
  branches,
  onClose,
  onSaved,
}: {
  editing: Branch | null;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { error } = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? 'shop');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [manager, setManager] = useState(editing?.manager ?? '');
  const [isMain, setIsMain] = useState(editing?.is_main ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    else if (name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    if (phone && phone.replace(/\D/g, '').length < 7) e.phone = 'Phone number is too short';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isMain && !editing?.is_main) {
        await supabase.from('branches').update({ is_main: false }).eq('is_main', true);
      }
      const payload = {
        name: name.trim(),
        type,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        manager: manager.trim() || null,
        is_main: isMain,
        is_active: isActive,
      };
      if (editing) {
        const { error: e } = await supabase.from('branches').update(payload).eq('id', editing.id);
        if (e) throw e;
        await logAudit('updated_branch', 'branches', editing.id, { name });
      } else {
        const { data, error: e } = await supabase.from('branches').insert(payload).select().single();
        if (e) throw e;
        await logAudit('created_branch', 'branches', data?.id ?? '', { name });
      }
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Branch' : 'New Branch'}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} placeholder="Shop 1" required error={errs.name} />
        <Select label="Type" value={type} onChange={(v) => setType(v as Branch['type'])} options={[{ value: 'shop', label: 'Shop' }, { value: 'warehouse', label: 'Warehouse' }, { value: 'online', label: 'Online Store' }]} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Manager" value={manager} onChange={setManager} placeholder="John Doe" />
          <Input label="Phone" value={phone} onChange={setPhone} placeholder="+92 300 1234567" error={errs.phone} />
        </div>
        <Input label="Email" value={email} onChange={setEmail} placeholder="branch@store.com" error={errs.email} />
        <Input label="Address" value={address} onChange={setAddress} placeholder="123 Main St, City" />
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500" />
            <Star size={14} className={isMain ? 'text-amber-500 fill-amber-500' : 'text-slate-400'} />
            Default / Main branch
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500" />
            Active (visible in dropdowns and POS)
          </label>
        </div>
        {isMain && !editing?.is_main && branches.some((b) => b.is_main) && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            Setting this as main will unset the current main branch.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Spinner /> : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
