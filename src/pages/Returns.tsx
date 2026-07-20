import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from '../components/ui';
import { formatMoney, formatDateTime, genReceiptNo } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Search, Undo2, CheckCircle2 } from 'lucide-react';

export function Returns() {
  const { profile } = useAuth();
  const { success } = useToast();
  const [search, setSearch] = useState('');
  const [sale, setSale] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [showProcess, setShowProcess] = useState(false);
  const [branchId, setBranchId] = useState(profile?.branch_id ?? '');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sales_returns').select('*,sales(receipt_no,total)').order('created_at', { ascending: false }).limit(20);
      setReturns(data ?? []);
      if (!branchId) {
        const { data: b } = await supabase.from('branches').select('id,name').order('name').limit(1).maybeSingle();
        if (b) setBranchId(b.id);
      }
    })();
  }, []);

  const findSale = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sales')
      .select('id,receipt_no,branch_id,total,status,created_at,sale_items(id,variant_id,qty,unit_price,line_total)')
      .eq('receipt_no', search.trim())
      .maybeSingle();
    if (data) {
      const vIds = (data.sale_items ?? []).map((i: any) => i.variant_id);
      const { data: variants } = await supabase.from('product_variants').select('id,product_id,size').in('id', vIds);
      const pIds = [...new Set((variants ?? []).map((v: any) => v.product_id))];
      const { data: products } = await supabase.from('products').select('id,name').in('id', pIds);
      const pMap = new Map((products ?? []).map((p: any) => [p.id, p.name]));
      const vMap = new Map((variants ?? []).map((v: any) => [v.id, { name: pMap.get(v.product_id) ?? '?', size: v.size }]));
      setSale({ ...data, items: (data.sale_items ?? []).map((i: any) => ({ ...i, ...vMap.get(i.variant_id) })) });
      setShowProcess(true);
    } else {
      alert('Receipt not found.');
    }
    setLoading(false);
  };

  return (
    <PageContainer>
      <PageHeader title="Sales Returns" subtitle="Process returns, exchanges, and refunds by receipt" />
      <Card className="p-4 mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findSale()} placeholder="Enter receipt number (e.g. R-20260101-ABC23)..." className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <Button onClick={findSale} disabled={loading || !search}>{loading ? <Spinner /> : 'Find Receipt'}</Button>
        </div>
      </Card>
      <h3 className="font-semibold text-slate-900 mb-2">Recent Returns</h3>
      {returns.length === 0 ? <Card><EmptyState message="No returns processed yet." /></Card> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Return No</th>
                <th className="text-left px-4 py-3 font-medium">Original Receipt</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.return_no}</td>
                  <td className="px-4 py-3 text-slate-600">{r.sales?.receipt_no ?? '-'}</td>
                  <td className="px-4 py-3"><Badge color="amber">{r.refund_type}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(Number(r.refund_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {showProcess && sale && (
        <ProcessReturnModal sale={sale} branchId={branchId} createdBy={profile?.id} onClose={() => { setShowProcess(false); setSale(null); setSearch(''); }} onDone={async () => {
          setShowProcess(false); setSale(null); setSearch('');
          const { data } = await supabase.from('sales_returns').select('*,sales(receipt_no,total)').order('created_at', { ascending: false }).limit(20);
          setReturns(data ?? []);
        }} />
      )}
    </PageContainer>
  );
}

function ProcessReturnModal({ sale, branchId, createdBy, onClose, onDone }: { sale: any; branchId: string; createdBy?: string; onClose: () => void; onDone: () => void }) {
  const { success } = useToast();
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [refundType, setRefundType] = useState('cash');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const refund = (sale.sale_items ?? sale.items ?? []).reduce((a: number, i: any) => a + (returnQty[i.id] ?? 0) * Number(i.unit_price), 0);

  const save = async () => {
    const items = (sale.sale_items ?? sale.items ?? []).filter((i: any) => (returnQty[i.id] ?? 0) > 0);
    if (items.length === 0) { alert('Select items to return.'); return; }
    setSaving(true);
    const return_no = genReceiptNo('RT');
    const { data: ret } = await supabase.from('sales_returns').insert({
      return_no, original_sale_id: sale.id, refund_amount: refund, refund_type: refundType, reason, branch_id: branchId, created_by: createdBy ?? null,
    }).select().single();
    if (ret) {
      await supabase.from('sales_return_items').insert(items.map((i: any) => ({ return_id: ret.id, sale_item_id: i.id, qty: returnQty[i.id] })));
      // restock inventory
      for (const i of items) {
        const { data: inv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', branchId).eq('variant_id', i.variant_id).maybeSingle();
        if (inv) await supabase.from('inventory').update({ quantity: inv.quantity + returnQty[i.id] }).eq('id', inv.id);
        else await supabase.from('inventory').insert({ branch_id: branchId, variant_id: i.variant_id, quantity: returnQty[i.id] });
      }
    }
    setSaving(false);
    success(`Return ${return_no} processed`);
    await logAudit('processed_return', 'sales_returns', ret.id, { return_no, refund });
    onDone();
  };

  return (
    <Modal open onClose={onClose} title={`Process Return — ${sale.receipt_no}`} size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-lg p-3 flex justify-between text-sm">
          <span className="text-slate-500">Original Total</span>
          <span className="font-semibold">{formatMoney(Number(sale.total))}</span>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(sale.sale_items ?? sale.items ?? []).map((i: any) => (
            <div key={i.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-800">{i.name} (Size {i.size})</p>
                <p className="text-xs text-slate-500">Sold: {i.qty} @ {formatMoney(Number(i.unit_price))}</p>
              </div>
              <input type="number" min={0} max={i.qty} value={returnQty[i.id] ?? ''} onChange={(e) => setReturnQty((p) => ({ ...p, [i.id]: Math.min(i.qty, Math.max(0, Number(e.target.value))) }))} placeholder="0" className="w-20 text-center px-2 py-1 border border-slate-200 rounded-md text-sm" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Refund Type" value={refundType} onChange={setRefundType} options={[{ value: 'cash', label: 'Cash Refund' }, { value: 'credit', label: 'Store Credit' }, { value: 'exchange', label: 'Exchange' }]} />
          <Input label="Reason" value={reason} onChange={setReason} />
        </div>
        <div className="flex justify-between items-center bg-emerald-50 rounded-lg p-3">
          <span className="text-sm text-emerald-700">Refund Amount</span>
          <span className="text-xl font-bold text-emerald-700">{formatMoney(refund)}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={save} disabled={saving}>{saving ? <Spinner className="mx-auto" /> : <><CheckCircle2 size={16} className="inline mr-1" />Process Return</>}</Button>
        </div>
      </div>
    </Modal>
  );
}

export { Undo2 };
