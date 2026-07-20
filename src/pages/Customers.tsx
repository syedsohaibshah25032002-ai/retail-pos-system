import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PageContainer, PageHeader, Card, Button, Input, Modal, Badge, Spinner, EmptyState } from '../components/ui';
import { formatMoney, formatDate } from '../lib/utils';
import { useToast } from '../lib/toast';
import { Plus, Search, Users, Edit2, Award, Phone, Mail, Cake } from 'lucide-react';

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

export function Customers() {
  const { success } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    setCustomers(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.mobile?.includes(q) || c.email?.toLowerCase().includes(q);
  });

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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, mobile, or email..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
      </Card>
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState message="No customers yet." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
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
              <div className="flex justify-end mt-3">
                <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
                  <Edit2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <CustomerForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Customer saved'); }} />}
      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} />}
    </PageContainer>
  );
}

function CustomerForm({ editing, onClose, onSaved }: { editing: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '');
  const [mobile, setMobile] = useState(editing?.mobile ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [birthday, setBirthday] = useState(editing?.birthday ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    // duplicate check by mobile
    if (mobile) {
      const { data: dup } = await supabase.from('customers').select('id').eq('mobile', mobile).neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle();
      if (dup) { alert('A customer with this mobile already exists.'); setSaving(false); return; }
    }
    setSaving(true);
    if (editing) {
      await supabase.from('customers').update({ name, mobile, email, birthday: birthday || null, notes }).eq('id', editing.id);
    } else {
      await supabase.from('customers').insert({ name, mobile, email, birthday: birthday || null, notes });
    }
    setSaving(false);
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Customer' : 'New Customer'}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} required />
        <Input label="Mobile" value={mobile} onChange={setMobile} />
        <Input label="Email" value={email} onChange={setEmail} type="email" />
        <Input label="Birthday" value={birthday} onChange={setBirthday} type="date" />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1.5">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
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
