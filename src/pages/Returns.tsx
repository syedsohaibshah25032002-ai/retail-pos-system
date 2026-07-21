import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState, SearchInput } from '../components/ui';
import { formatMoney, formatDateTime, genReceiptNo } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Undo2, CheckCircle2, AlertCircle } from 'lucide-react';

export function Returns() {
  const { profile } = useAuth();
  const { success, error } = useToast();
  const [search, setSearch] = useState('');
  const [sale, setSale] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [showProcess, setShowProcess] = useState(false);
  const [branchId, setBranchId] = useState(profile?.branch_id ?? '');

  const loadReturns = useCallback(async () => {
    const { data } = await supabase.from('sales_returns').select('*,sales(receipt_no,total)').order('created_at', { ascending: false }).limit(20);
    setReturns(data ?? []);
  }, []);

  useEffect(() => {
    loadReturns();
    if (!branchId) {
      supabase.from('branches').select('id,name').order('name').limit(1).maybeSingle().then(({ data: b }) => { if (b) setBranchId(b.id); });
    }
  }, [loadReturns]);

  const findSale = async () => {
    setLoading(true);
    try {
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
        error(`Receipt "${search.trim()}" not found.`);
      }
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to find receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Sales Returns" subtitle="Process returns, exchanges, and refunds by receipt" />
      <Card className="p-4 mb-4">
        <div className="flex gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Enter receipt number (e.g. R-20260101-ABC23)..." className="flex-1" />
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
  const { success, error } = useToast();
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [refundType, setRefundType] = useState('cash');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const refund = (sale.sale_items ?? sale.items ?? []).reduce((a: number, i: any) => a + (returnQty[i.id] ?? 0) * Number(i.unit_price), 0);

  const save = async () => {
    const items = (sale.sale_items ?? sale.items ?? []).filter((i: any) => (returnQty[i.id] ?? 0) > 0);
    if (items.length === 0) { error('Select at least one item to return.'); return; }
    setSaving(true);
    try {
      const return_no = genReceiptNo('RT');
      const { data: ret, error: re } = await supabase.from('sales_returns').insert({
        return_no, original_sale_id: sale.id, refund_amount: refund, refund_type: refundType, reason, branch_id: branchId, created_by: createdBy ?? null,
      }).select().single();
      if (re) throw re;
      if (ret) {
        await supabase.from('sales_return_items').insert(items.map((i: any) => ({ return_id: ret.id, sale_item_id: i.id, qty: returnQty[i.id] })));
      // restock inventory + log movements
      for (const i of items) {
        const { data: inv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', branchId).eq('variant_id', i.variant_id).maybeSingle();
        const retQty = returnQty[i.id];
        if (inv) {
          const newQty = inv.quantity + retQty;
          await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id);
          await supabase.from('inventory_movements').insert({ variant_id: i.variant_id, branch_id: branchId, movement_type: 'return', quantity_change: retQty, quantity_after: newQty, reference_id: ret.id, reference_type: 'sales_returns', note: `Return ${return_no}`, created_by: createdBy ?? null });
        } else {
          await supabase.from('inventory').insert({ branch_id: branchId, variant_id: i.variant_id, quantity: retQty });
          await supabase.from('inventory_movements').insert({ variant_id: i.variant_id, branch_id: branchId, movement_type: 'return', quantity_change: retQty, quantity_after: retQty, reference_id: ret.id, reference_type: 'sales_returns', note: `Return ${return_no}`, created_by: createdBy ?? null });
        }
      }
      }
      success(`Return ${return_no} processed — ${formatMoney(refund)} refunded`);
      await logAudit('processed_return', 'sales_returns', ret.id, { return_no, refund });
      onDone();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to process return');
    } finally {
      setSaving(false);
    }
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
