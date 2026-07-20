import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from '../components/ui';
import { formatMoney, formatDate, genReceiptNo } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, Truck, CreditCard as Edit2, Trash2, Package, Check } from 'lucide-react';

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
};

type PO = {
  id: string;
  po_no: string;
  supplier_id: string;
  branch_id: string;
  status: string;
  total: number;
  note: string | null;
  created_at: string;
  items: { variant_id: string; qty: number; unit_cost: number; line_total: number; name: string; size: string }[];
};

export function Suppliers() {
  const { success } = useToast();
  const { profile } = useAuth();
  const [tab, setTab] = useState<'suppliers' | 'pos'>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPO, setShowPO] = useState(false);

  const load = async () => {
    setLoading(true);
    const [s, p, b] = await Promise.all([
      supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('id,name').order('name'),
    ]);
    setSuppliers(s.data ?? []);
    setBranches(b.data ?? []);
    const ids = (p.data ?? []).map((x) => x.id);
    const { data: items } = await supabase.from('purchase_order_items').select('po_id,variant_id,qty,unit_cost,line_total').in('po_id', ids);
    const vIds = [...new Set((items ?? []).map((i: any) => i.variant_id))];
    const { data: variants } = await supabase.from('product_variants').select('id,product_id,size').in('id', vIds);
    const pIds = [...new Set((variants ?? []).map((v: any) => v.product_id))];
    const { data: products } = await supabase.from('products').select('id,name').in('id', pIds);
    const pMap = new Map((products ?? []).map((p: any) => [p.id, p.name]));
    const vMap = new Map((variants ?? []).map((v: any) => [v.id, { name: pMap.get(v.product_id) ?? '?', size: v.size }]));
    const byPO = new Map<string, any[]>();
    (items ?? []).forEach((i: any) => {
      const arr = byPO.get(i.po_id) ?? [];
      arr.push({ ...i, ...vMap.get(i.variant_id) });
      byPO.set(i.po_id, arr);
    });
    setPos((p.data ?? []).map((x: any) => ({ ...x, items: byPO.get(x.id) ?? [] })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const delSupplier = async (s: Supplier) => {
    if (!confirm(`Delete supplier ${s.name}?`)) return;
    await supabase.from('suppliers').delete().eq('id', s.id);
    success('Supplier deleted');
    load();
  };

  const receivePO = async (po: PO) => {
    // add stock to receiving branch + log movements
    for (const item of po.items) {
      const { data: inv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', po.branch_id).eq('variant_id', item.variant_id).maybeSingle();
      if (inv) {
        const newQty = inv.quantity + item.qty;
        await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
        await supabase.from('inventory_movements').insert({ variant_id: item.variant_id, branch_id: po.branch_id, movement_type: 'purchase', quantity_change: item.qty, quantity_after: newQty, reference_id: po.id, reference_type: 'purchase_orders', note: `PO ${po.po_no} received`, created_by: profile?.id ?? null });
      } else {
        await supabase.from('inventory').insert({ branch_id: po.branch_id, variant_id: item.variant_id, quantity: item.qty });
        await supabase.from('inventory_movements').insert({ variant_id: item.variant_id, branch_id: po.branch_id, movement_type: 'purchase', quantity_change: item.qty, quantity_after: item.qty, reference_id: po.id, reference_type: 'purchase_orders', note: `PO ${po.po_no} received`, created_by: profile?.id ?? null });
      }
    }
    await supabase.from('purchase_orders').update({ status: 'received' }).eq('id', po.id);
    success('PO received — stock added');
    await logAudit('received_po', 'purchase_orders', po.id, { po_no: po.po_no });
    load();
  };

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '?';
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '?';
  const statusColor = (s: string) => (s === 'received' ? 'green' : s === 'ordered' ? 'blue' : s === 'partial' ? 'amber' : 'slate') as any;

  return (
    <PageContainer>
      <PageHeader
        title="Suppliers & Purchase Orders"
        subtitle="Manage vendors, POs, and goods receiving"
        action={tab === 'suppliers'
          ? <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} className="inline mr-1" /> New Supplier</Button>
          : <Button onClick={() => setShowPO(true)}><Plus size={16} className="inline mr-1" /> New PO</Button>}
      />
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('suppliers')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'suppliers' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Suppliers</button>
        <button onClick={() => setTab('pos')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'pos' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Purchase Orders</button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : tab === 'suppliers' ? (
        suppliers.length === 0 ? <Card><EmptyState message="No suppliers yet." /></Card> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((s) => (
              <Card key={s.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><Truck className="text-slate-600" size={20} /></div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(s); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"><Edit2 size={15} /></button>
                    <button onClick={() => delSupplier(s)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={15} /></button>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-900">{s.name}</h3>
                {s.contact_person && <p className="text-sm text-slate-500">{s.contact_person}</p>}
                <div className="mt-2 text-sm text-slate-500 space-y-0.5">
                  {s.phone && <p>{s.phone}</p>}
                  {s.email && <p>{s.email}</p>}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
                  <span className="text-slate-500">Outstanding balance</span>
                  <span className={`font-semibold ${Number(s.balance) > 0 ? 'text-red-600' : 'text-slate-700'}`}>{formatMoney(s.balance)}</span>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : pos.length === 0 ? <Card><EmptyState message="No purchase orders yet." /></Card> : (
        <div className="space-y-3">
          {pos.map((po) => (
            <Card key={po.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package className="text-slate-600" size={18} /></div>
                  <div>
                    <p className="font-semibold text-slate-900">{po.po_no}</p>
                    <p className="text-sm text-slate-500">{supplierName(po.supplier_id)} → {branchName(po.branch_id)} · {formatDate(po.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={statusColor(po.status)}>{po.status}</Badge>
                  <span className="font-semibold">{formatMoney(po.total)}</span>
                  {(po.status === 'ordered' || po.status === 'partial') && <Button size="sm" variant="success" onClick={() => receivePO(po)}><Check size={14} className="inline mr-1" />Receive</Button>}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                {po.items.map((i, idx) => <Badge key={idx} color="slate">{i.name} (Sz {i.size}) × {i.qty} @ {formatMoney(i.unit_cost)}</Badge>)}
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <SupplierForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Supplier saved'); }} />}
      {showPO && <POForm suppliers={suppliers} branches={branches} onClose={() => setShowPO(false)} onSaved={() => { setShowPO(false); load(); success('Purchase order created'); }} />}
    </PageContainer>
  );
}

function SupplierForm({ editing, onClose, onSaved }: { editing: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '');
  const [contact, setContact] = useState(editing?.contact_person ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    if (editing) await supabase.from('suppliers').update({ name, contact_person: contact, phone, email, address }).eq('id', editing.id);
    else await supabase.from('suppliers').insert({ name, contact_person: contact, phone, email, address });
    setSaving(false);
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Supplier' : 'New Supplier'}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} required />
        <Input label="Contact Person" value={contact} onChange={setContact} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={phone} onChange={setPhone} />
          <Input label="Email" value={email} onChange={setEmail} type="email" />
        </div>
        <Input label="Address" value={address} onChange={setAddress} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name}>{saving ? <Spinner className="mx-auto" /> : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function POForm({ suppliers, branches, onClose, onSaved }: { suppliers: Supplier[]; branches: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ variant_id: string; name: string; size: string; cost: number; qty: number }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: variants } = await supabase.from('product_variants').select('id,product_id,size').order('size');
      const pIds = [...new Set((variants ?? []).map((v: any) => v.product_id))];
      const { data: products } = await supabase.from('products').select('id,name,purchase_price').in('id', pIds);
      const pMap = new Map((products ?? []).map((p: any) => [p.id, p]));
      setLines((variants ?? []).map((v: any) => ({ variant_id: v.id, name: pMap.get(v.product_id)?.name ?? '?', size: v.size, cost: Number(pMap.get(v.product_id)?.purchase_price ?? 0), qty: 0 })));
    })();
  }, []);

  const filtered = lines.filter((l) => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.size.includes(search));
  const total = lines.reduce((a, l) => a + l.cost * l.qty, 0);

  const save = async () => {
    if (!supplierId || !branchId) { alert('Select supplier and branch.'); return; }
    const items = lines.filter((l) => l.qty > 0);
    if (items.length === 0) { alert('Add at least one item.'); return; }
    setSaving(true);
    const po_no = genReceiptNo('PO');
    const { data: po } = await supabase.from('purchase_orders').insert({ po_no, supplier_id: supplierId, branch_id: branchId, status: 'ordered', total, note }).select().single();
    if (po) {
      await supabase.from('purchase_order_items').insert(items.map((i) => ({ po_id: po.id, variant_id: i.variant_id, qty: i.qty, unit_cost: i.cost, line_total: i.cost * i.qty })));
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="New Purchase Order" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Supplier" value={supplierId} onChange={setSupplierId} options={[{ value: '', label: '— select —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
          <Select label="Receiving Branch" value={branchId} onChange={setBranchId} options={[{ value: '', label: '— select —' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter products..." className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
          {filtered.map((l) => (
            <div key={l.variant_id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-0">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{l.name}</p>
                <p className="text-xs text-slate-500">Size {l.size}</p>
              </div>
              <input type="number" value={l.cost || ''} onChange={(e) => setLines((p) => p.map((x) => x.variant_id === l.variant_id ? { ...x, cost: Number(e.target.value) } : x))} className="w-24 text-center px-2 py-1 border border-slate-200 rounded-md text-sm mr-2" placeholder="cost" />
              <input type="number" min={0} value={l.qty || ''} onChange={(e) => setLines((p) => p.map((x) => x.variant_id === l.variant_id ? { ...x, qty: Math.max(0, Number(e.target.value)) } : x))} className="w-20 text-center px-2 py-1 border border-slate-200 rounded-md text-sm" placeholder="qty" />
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">PO Total</span>
          <span className="text-xl font-bold text-slate-900">{formatMoney(total)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Spinner className="mx-auto" /> : 'Create PO'}</Button>
        </div>
      </div>
    </Modal>
  );
}
