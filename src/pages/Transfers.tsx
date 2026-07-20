import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Select, Modal, Badge, Spinner, EmptyState } from '../components/ui';
import { formatDate, genReceiptNo } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, ArrowLeftRight, Check, X } from 'lucide-react';

type Transfer = {
  id: string;
  transfer_no: string;
  from_branch_id: string;
  to_branch_id: string;
  status: string;
  note: string | null;
  created_at: string;
  items: { variant_id: string; qty: number; name: string; size: string }[];
};

export function Transfers() {
  const { profile } = useAuth();
  const { success } = useToast();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [t, b] = await Promise.all([
      supabase.from('stock_transfers').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('id,name').order('name'),
    ]);
    setBranches(b.data ?? []);
    const ids = (t.data ?? []).map((x) => x.id);
    const { data: items } = await supabase.from('stock_transfer_items').select('transfer_id,variant_id,qty').in('transfer_id', ids);
    const vIds = [...new Set((items ?? []).map((i: any) => i.variant_id))];
    const { data: variants } = await supabase.from('product_variants').select('id,product_id,size').in('id', vIds);
    const pIds = [...new Set((variants ?? []).map((v: any) => v.product_id))];
    const { data: products } = await supabase.from('products').select('id,name').in('id', pIds);
    const pMap = new Map((products ?? []).map((p: any) => [p.id, p.name]));
    const vMap = new Map((variants ?? []).map((v: any) => [v.id, { name: pMap.get(v.product_id) ?? '?', size: v.size }]));
    const itemsByT = new Map<string, any[]>();
    (items ?? []).forEach((i: any) => {
      const arr = itemsByT.get(i.transfer_id) ?? [];
      arr.push({ variant_id: i.variant_id, qty: i.qty, ...vMap.get(i.variant_id) });
      itemsByT.set(i.transfer_id, arr);
    });
    setTransfers((t.data ?? []).map((x: any) => ({ ...x, items: itemsByT.get(x.id) ?? [] })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '?';
  const statusColor = (s: string) => (s === 'completed' ? 'green' : s === 'approved' ? 'blue' : s === 'rejected' ? 'red' : 'amber') as any;

  const approve = async (t: Transfer) => {
    await supabase.from('stock_transfers').update({ status: 'approved', approved_by: profile?.id }).eq('id', t.id);
    success('Transfer approved');
    await logAudit('approved_transfer', 'stock_transfers', t.id, { transfer_no: t.transfer_no });
    load();
  };

  const reject = async (t: Transfer) => {
    await supabase.from('stock_transfers').update({ status: 'rejected', approved_by: profile?.id }).eq('id', t.id);
    success('Transfer rejected');
    await logAudit('rejected_transfer', 'stock_transfers', t.id, { transfer_no: t.transfer_no });
    load();
  };

  const complete = async (t: Transfer) => {
    // move stock: decrement from_branch, increment to_branch + log movements
    for (const item of t.items) {
      const { data: fromInv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', t.from_branch_id).eq('variant_id', item.variant_id).maybeSingle();
      if (fromInv) {
        const newFromQty = Math.max(0, fromInv.quantity - item.qty);
        await supabase.from('inventory').update({ quantity: newFromQty }).eq('id', fromInv.id);
        await supabase.from('inventory_movements').insert({ variant_id: item.variant_id, branch_id: t.from_branch_id, movement_type: 'transfer_out', quantity_change: -item.qty, quantity_after: newFromQty, reference_id: t.id, reference_type: 'stock_transfers', note: `Transfer ${t.transfer_no} out`, created_by: profile?.id ?? null });
      }
      const { data: toInv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', t.to_branch_id).eq('variant_id', item.variant_id).maybeSingle();
      if (toInv) {
        const newToQty = toInv.quantity + item.qty;
        await supabase.from('inventory').update({ quantity: newToQty }).eq('id', toInv.id);
        await supabase.from('inventory_movements').insert({ variant_id: item.variant_id, branch_id: t.to_branch_id, movement_type: 'transfer_in', quantity_change: item.qty, quantity_after: newToQty, reference_id: t.id, reference_type: 'stock_transfers', note: `Transfer ${t.transfer_no} in`, created_by: profile?.id ?? null });
      } else {
        await supabase.from('inventory').insert({ branch_id: t.to_branch_id, variant_id: item.variant_id, quantity: item.qty });
        await supabase.from('inventory_movements').insert({ variant_id: item.variant_id, branch_id: t.to_branch_id, movement_type: 'transfer_in', quantity_change: item.qty, quantity_after: item.qty, reference_id: t.id, reference_type: 'stock_transfers', note: `Transfer ${t.transfer_no} in`, created_by: profile?.id ?? null });
      }
    }
    await supabase.from('stock_transfers').update({ status: 'completed' }).eq('id', t.id);
    success('Transfer completed — stock moved');
    await logAudit('completed_transfer', 'stock_transfers', t.id, { transfer_no: t.transfer_no });
    load();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Stock Transfers"
        subtitle="Move inventory between branches with approval workflow"
        action={<Button onClick={() => setShowForm(true)}><Plus size={16} className="inline mr-1" /> New Transfer</Button>}
      />
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : transfers.length === 0 ? (
        <Card><EmptyState message="No transfers yet." /></Card>
      ) : (
        <div className="space-y-3">
          {transfers.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                    <ArrowLeftRight className="text-slate-600" size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{t.transfer_no}</p>
                    <p className="text-sm text-slate-500">
                      {branchName(t.from_branch_id)} → {branchName(t.to_branch_id)} · {formatDate(t.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={statusColor(t.status)}>{t.status}</Badge>
                  {t.status === 'pending' && (
                    <>
                      <Button size="sm" variant="success" onClick={() => approve(t)}><Check size={14} className="inline mr-1" />Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => reject(t)}><X size={14} /></Button>
                    </>
                  )}
                  {t.status === 'approved' && (
                    <Button size="sm" onClick={() => complete(t)}>Complete Transfer</Button>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                {t.items.map((i, idx) => (
                  <Badge key={idx} color="slate">{i.name} (Sz {i.size}) × {i.qty}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <TransferForm branches={branches} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Transfer created'); }} createdBy={profile?.id} />}
    </PageContainer>
  );
}

function TransferForm({ branches, onClose, onSaved, createdBy }: { branches: { id: string; name: string }[]; onClose: () => void; onSaved: () => void; createdBy?: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ variant_id: string; name: string; size: string; qty: number; stock: number }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const fromStock = async (bid: string) => {
    setFrom(bid);
    setLines([]);
    if (!bid) return;
    const { data: inv } = await supabase.from('inventory').select('variant_id,quantity').eq('branch_id', bid).gt('quantity', 0);
    const vIds = (inv ?? []).map((i: any) => i.variant_id);
    if (vIds.length === 0) return;
    const { data: variants } = await supabase.from('product_variants').select('id,product_id,size').in('id', vIds);
    const pIds = [...new Set((variants ?? []).map((v: any) => v.product_id))];
    const { data: products } = await supabase.from('products').select('id,name').in('id', pIds);
    const pMap = new Map((products ?? []).map((p: any) => [p.id, p.name]));
    const stockMap = new Map((inv ?? []).map((i: any) => [i.variant_id, i.quantity]));
    setLines((variants ?? []).map((v: any) => ({ variant_id: v.id, name: pMap.get(v.product_id) ?? '?', size: v.size, qty: 0, stock: stockMap.get(v.id) ?? 0 })));
  };

  const filtered = lines.filter((l) => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.size.includes(search));

  const save = async () => {
    if (!from || !to || from === to) { alert('Pick distinct branches.'); return; }
    const items = lines.filter((l) => l.qty > 0);
    if (items.length === 0) { alert('Add at least one item.'); return; }
    setSaving(true);
    const transfer_no = genReceiptNo('T');
    const { data: t } = await supabase.from('stock_transfers').insert({
      transfer_no, from_branch_id: from, to_branch_id: to, status: 'pending', created_by: createdBy ?? null, note,
    }).select().single();
    if (t) {
      await supabase.from('stock_transfer_items').insert(items.map((i) => ({ transfer_id: t.id, variant_id: i.variant_id, qty: i.qty })));
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="New Stock Transfer" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select label="From Branch" value={from} onChange={fromStock} options={[{ value: '', label: '— select —' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
          <Select label="To Branch" value={to} onChange={setTo} options={[{ value: '', label: '— select —' }, ...branches.filter((b) => b.id !== from).map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        {from && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter items..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No stock at source branch.</p>
              ) : filtered.map((l) => (
                <div key={l.variant_id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{l.name}</p>
                    <p className="text-xs text-slate-500">Size {l.size} · {l.stock} available</p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={l.stock}
                    value={l.qty || ''}
                    onChange={(e) => setLines((prev) => prev.map((x) => x.variant_id === l.variant_id ? { ...x, qty: Math.min(l.stock, Math.max(0, Number(e.target.value))) } : x))}
                    className="w-20 text-center px-2 py-1 border border-slate-200 rounded-md text-sm"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Spinner className="mx-auto" /> : 'Create Transfer'}</Button>
        </div>
      </div>
    </Modal>
  );
}
