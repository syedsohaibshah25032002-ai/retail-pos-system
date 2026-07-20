import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from '../components/ui';
import { Plus, Store, Edit2, Trash2 } from 'lucide-react';
import { useToast } from '../lib/toast';

type Branch = {
  id: string;
  name: string;
  type: 'warehouse' | 'shop' | 'online';
  address: string | null;
  phone: string | null;
  is_main: boolean;
};

export function Branches() {
  const { success } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [stockView, setStockView] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').order('created_at');
    setBranches(data ?? []);
    // count stock per branch
    const { data: inv } = await supabase.from('inventory').select('branch_id,quantity');
    const map: Record<string, number> = {};
    (inv ?? []).forEach((i: any) => { map[i.branch_id] = (map[i.branch_id] ?? 0) + i.quantity; });
    setStockView(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const del = async (b: Branch) => {
    if (b.is_main) { alert('Cannot delete the main branch.'); return; }
    if (!confirm(`Delete branch ${b.name}?`)) return;
    await supabase.from('branches').delete().eq('id', b.id);
    success('Branch deleted');
    load();
  };

  const typeColor = (t: string) => (t === 'warehouse' ? 'blue' : t === 'online' ? 'violet' : 'green') as any;

  return (
    <PageContainer>
      <PageHeader
        title="Branches"
        subtitle="Manage warehouses, shops, and online stores"
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} className="inline mr-1" /> New Branch</Button>}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : branches.length === 0 ? (
        <Card><EmptyState message="No branches yet." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Store className="text-slate-600" size={20} />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(b); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => del(b)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-slate-900">{b.name}</h3>
                {b.is_main && <Badge color="amber">Main</Badge>}
              </div>
              <Badge color={typeColor(b.type)}>{b.type}</Badge>
              <div className="mt-3 space-y-1 text-sm text-slate-500">
                {b.address && <p>{b.address}</p>}
                {b.phone && <p>{b.phone}</p>}
                <p className="pt-2 border-t border-slate-100 mt-2">
                  <span className="font-medium text-slate-700">{stockView[b.id] ?? 0}</span> units in stock
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && (
        <BranchForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Branch saved'); }} />
      )}
    </PageContainer>
  );
}

function BranchForm({ editing, onClose, onSaved }: { editing: Branch | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? 'shop');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [isMain, setIsMain] = useState(editing?.is_main ?? false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    if (editing) {
      await supabase.from('branches').update({ name, type, address, phone, is_main: isMain }).eq('id', editing.id);
    } else {
      await supabase.from('branches').insert({ name, type, address, phone, is_main: isMain });
    }
    setSaving(false);
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Branch' : 'New Branch'}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} placeholder="Shop 1" required />
        <Select label="Type" value={type} onChange={(v) => setType(v as Branch['type'])} options={[{ value: 'warehouse', label: 'Warehouse' }, { value: 'shop', label: 'Shop' }, { value: 'online', label: 'Online Store' }]} />
        <Input label="Address" value={address} onChange={setAddress} />
        <Input label="Phone" value={phone} onChange={setPhone} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} className="rounded" />
          Main / Head Office branch
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name}>{saving ? <Spinner className="mx-auto" /> : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}
