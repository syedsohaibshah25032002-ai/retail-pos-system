import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { PageContainer, PageHeader, Card, Button, Input, Modal, Badge, Spinner, EmptyState, ErrorState, SearchInput, Pagination, CardSkeleton, ConfirmDialog } from '../components/ui';
import { formatMoney, formatDate } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, Users, CreditCard as Edit2, Award, Phone, Mail, Cake, Trash2 } from 'lucide-react';

type Customer = {
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

const PAGE_SIZE = 12;

export function Customers() {
  const { success, error } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error: e } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (e) throw e;
      setCustomers(data ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || c.mobile?.includes(q) || c.email?.toLowerCase().includes(q));
  }, [customers, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error: e } = await supabase.from('customers').delete().eq('id', confirmDelete.id);
      if (e) throw e;
      success(`Customer "${confirmDelete.name ?? 'Unknown'}" deleted`);
      await logAudit('deleted_customer', 'customers', confirmDelete.id, { name: confirmDelete.name });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to delete customer');
    }
  };

  const tier = (pts: number) => pts >= 5000 ? 'VIP' : pts >= 1000 ? 'Gold' : pts >= 200 ? 'Silver' : 'Bronze';
  const tierColor = (pts: number) => (pts >= 1000 ? 'amber' : pts >= 200 ? 'slate' : 'green') as any;

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        subtitle="CRM with loyalty points and purchase history"
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} className="inline mr-1" /> New Customer</Button>}
      />
      <Card className="p-4 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, mobile, or email..." />
      </Card>
      {loading ? (
        <CardSkeleton count={6} />
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={load} /></Card>
      ) : paged.length === 0 ? (
        <Card><EmptyState message="No customers yet. Add your first customer to start tracking loyalty points and purchase history." actionLabel="New Customer" onAction={() => { setEditing(null); setShowForm(true); }} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paged.map((c) => (
            <Card key={c.id} className="p-5 cursor-pointer hover:shadow-md transition-shadow" >
              <div className="flex items-start justify-between mb-3" onClick={() => setDetail(c)}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                    {(c.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{c.name ?? 'Unknown'}</p>
                    <p className="text-xs text-slate-500">{c.mobile ?? 'No phone'}</p>
                  </div>
                </div>
                <Badge color={tierColor(c.loyalty_points)}>{tier(c.loyalty_points)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm" onClick={() => setDetail(c)}>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Award size={12} /> Points</p>
                  <p className="font-bold text-slate-900">{c.loyalty_points}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500">Total Spent</p>
                  <p className="font-bold text-slate-900">{formatMoney(c.total_spent)}</p>
                </div>
              </div>
              <div className="flex justify-end mt-3 gap-1">
                <button onClick={() => { setEditing(c); setShowForm(true); }} aria-label="Edit customer" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => setConfirmDelete(c)} aria-label="Delete customer" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {!loading && !loadError && filtered.length > PAGE_SIZE && (
        <Card><Pagination page={page} totalPages={totalPages} onPage={setPage} /></Card>
      )}
      {showForm && <CustomerForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Customer saved'); }} />}
      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} />}
      <ConfirmDialog
        open={!!confirmDelete}
        message={confirmDelete ? `Delete customer "${confirmDelete.name ?? 'Unknown'}"? Their loyalty points and purchase history will remain in audit logs.` : ''}
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </PageContainer>
  );
}

function CustomerForm({ editing, onClose, onSaved }: { editing: Customer | null; onClose: () => void; onSaved: () => void }) {
  const { error } = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [mobile, setMobile] = useState(editing?.mobile ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [birthday, setBirthday] = useState(editing?.birthday ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    if (mobile) {
      const { data: dup } = await supabase.from('customers').select('id').eq('mobile', mobile).neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle();
      if (dup) { error('A customer with this mobile number already exists.'); return; }
    }
    setSaving(true);
    try {
      if (editing) {
        const { error: ue } = await supabase.from('customers').update({ name, mobile, email, birthday: birthday || null, notes }).eq('id', editing.id);
        if (ue) throw ue;
      } else {
        const { error: ie } = await supabase.from('customers').insert({ name, mobile, email, birthday: birthday || null, notes });
        if (ie) throw ie;
      }
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Customer' : 'New Customer'}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} required error={errs.name} />
        <Input label="Mobile" value={mobile} onChange={setMobile} placeholder="+92 300 1234567" />
        <Input label="Email" value={email} onChange={setEmail} type="email" error={errs.email} />
        <Input label="Birthday" value={birthday} onChange={setBirthday} type="date" />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name}>{saving ? <Spinner className="mx-auto" /> : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('sales')
        .select('id,receipt_no,total,created_at,status')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setSales(data ?? []);
      setLoading(false);
    })();
  }, [customer.id]);
  return (
    <Modal open onClose={onClose} title="Customer Profile" size="lg">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white text-2xl font-semibold">
          {(customer.name ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-slate-900">{customer.name ?? 'Unknown'}</h3>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">
            {customer.mobile && <span className="flex items-center gap-1"><Phone size={13} /> {customer.mobile}</span>}
            {customer.email && <span className="flex items-center gap-1"><Mail size={13} /> {customer.email}</span>}
            {customer.birthday && <span className="flex items-center gap-1"><Cake size={13} /> {formatDate(customer.birthday)}</span>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-600">Loyalty Points</p>
          <p className="text-2xl font-bold text-emerald-700">{customer.loyalty_points}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-xs text-blue-600">Total Spent</p>
          <p className="text-2xl font-bold text-blue-700">{formatMoney(customer.total_spent)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500">Purchases</p>
          <p className="text-2xl font-bold text-slate-700">{sales.length}</p>
        </div>
      </div>
      <h4 className="font-semibold text-slate-900 mb-2">Purchase History</h4>
      {loading ? <Spinner /> : sales.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No purchases yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {sales.map((s) => (
            <div key={s.id} className="flex justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-800">{s.receipt_no}</span>
                <span className="text-slate-400 ml-2">{formatDate(s.created_at)}</span>
              </div>
              <span className="font-semibold">{formatMoney(Number(s.total))}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export { Users };
