import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PageContainer, PageHeader, Card, Select, Spinner, Badge, Button } from '../components/ui';
import { formatMoney, formatDate } from '../lib/utils';
import { useToast } from '../lib/toast';
import { BarChart3, TrendingUp, Package, Wallet, Store, Download } from 'lucide-react';

type Period = 'today' | 'week' | 'month' | 'year';

export function Reports() {
  const { success } = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const now = new Date();
      let start = new Date(now);
      if (period === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (period === 'week') { start = new Date(now); start.setDate(now.getDate() - 7); }
      else if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (period === 'year') start = new Date(now.getFullYear(), 0, 1);
      const startISO = start.toISOString();

      const [sales, items, expenses, inv, branches, products] = await Promise.all([
        supabase.from('sales').select('id,branch_id,total,created_at,status').gte('created_at', startISO),
        supabase.from('sale_items').select('qty,line_total,variant_id,sale_id'),
        supabase.from('expenses').select('amount,branch_id,category,expense_date').gte('expense_date', startISO.slice(0, 10)),
        supabase.from('inventory').select('quantity,low_stock_threshold,variant_id,branch_id'),
        supabase.from('branches').select('id,name'),
        supabase.from('products').select('id,name,purchase_price,selling_price'),
      ]);

      const validSales = (sales.data ?? []).filter((s) => s.status !== 'returned');
      const saleIds = new Set(validSales.map((s) => s.id));
      const branchMap = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
      const prodMap = new Map((products.data ?? []).map((p) => [p.id, p.name]));

      // variant -> product
      const vIds = [...new Set((items.data ?? []).map((i) => i.variant_id))];
      const { data: variants } = await supabase.from('product_variants').select('id,product_id,size').in('id', vIds);
      const vToP = new Map((variants ?? []).map((v) => [v.id, v.product_id]));

      // sales totals
      const totalSales = validSales.reduce((a, s) => a + Number(s.total), 0);
      // profit
      let cost = 0;
      const prodQty = new Map<string, number>();
      const prodRev = new Map<string, number>();
      for (const it of items.data ?? []) {
        if (!saleIds.has(it.sale_id)) continue;
        const pid = vToP.get(it.variant_id);
        if (!pid) continue;
        const p = (products.data ?? []).find((x) => x.id === pid);
        cost += Number(p?.purchase_price ?? 0) * it.qty;
        prodQty.set(pid, (prodQty.get(pid) ?? 0) + it.qty);
        prodRev.set(pid, (prodRev.get(pid) ?? 0) + Number(it.line_total));
      }
      const grossProfit = totalSales - cost;

      // expenses
      const totalExpenses = (expenses.data ?? []).reduce((a, e) => a + Number(e.amount), 0);
      const netProfit = grossProfit - totalExpenses;

      // branch performance
      const branchSales = new Map<string, number>();
      for (const s of validSales) branchSales.set(s.branch_id, (branchSales.get(s.branch_id) ?? 0) + Number(s.total));
      const branchPerf = [...branchSales.entries()].map(([bid, t]) => ({ name: branchMap.get(bid) ?? '?', total: t })).sort((a, b) => b.total - a.total);

      // top products
      const topProducts = [...prodQty.entries()]
        .map(([pid, qty]) => ({ name: prodMap.get(pid) ?? '?', qty, revenue: prodRev.get(pid) ?? 0 }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8);

      // inventory valuation
      const stockValue = (inv.data ?? []).reduce((a, i) => {
        const pid = vToP.get(i.variant_id);
        const p = (products.data ?? []).find((x) => x.id === pid);
        return a + Number(p?.purchase_price ?? 0) * i.quantity;
      }, 0);
      const totalUnits = (inv.data ?? []).reduce((a, i) => a + i.quantity, 0);
      const lowStock = (inv.data ?? []).filter((i) => i.quantity > 0 && i.quantity <= i.low_stock_threshold).length;
      const outStock = (inv.data ?? []).filter((i) => i.quantity === 0).length;

      // expense by category
      const expByCat = new Map<string, number>();
      for (const e of expenses.data ?? []) expByCat.set(e.category, (expByCat.get(e.category) ?? 0) + Number(e.amount));

      setData({ totalSales, grossProfit, totalExpenses, netProfit, branchPerf, topProducts, stockValue, totalUnits, lowStock, outStock, expByCat: [...expByCat.entries()].sort((a, b) => b[1] - a[1]) });
      setLoading(false);
    })();
  }, [period]);

  const maxBranch = Math.max(...(data?.branchPerf.map((b: any) => b.total) ?? [1]), 1);
  const maxTop = Math.max(...(data?.topProducts.map((p: any) => p.qty) ?? [1]), 1);
  const maxExp = Math.max(...(data?.expByCat.map((e: any) => e[1]) ?? [1]), 1);

  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = ['Report,Value'];
    lines.push(`Total Sales,${data.totalSales}`);
    lines.push(`Gross Profit,${data.grossProfit}`);
    lines.push(`Total Expenses,${data.totalExpenses}`);
    lines.push(`Net Profit,${data.netProfit}`);
    lines.push('');
    lines.push('Branch,Sales');
    data.branchPerf.forEach((b: any) => lines.push(`${b.name},${b.total}`));
    lines.push('');
    lines.push('Product,Qty,Revenue');
    data.topProducts.forEach((p: any) => lines.push(`${p.name},${p.qty},${p.revenue}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${period}.csv`; a.click();
    success('Report exported');
  };

  return (
    <PageContainer>
      <PageHeader title="Reports" subtitle="Sales, inventory, profit, and branch analytics" action={<Button variant="secondary" onClick={exportCsv}><Download size={16} className="inline mr-1" /> Export CSV</Button>} />
      <div className="mb-4">
        <Select value={period} onChange={(v) => setPeriod(v as Period)} options={[
          { value: 'today', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' }, { value: 'year', label: 'This Year' },
        ]} className="w-48" />
      </div>
      {loading || !data ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard icon={TrendingUp} label="Total Sales" value={formatMoney(data.totalSales)} tone="emerald" />
            <MetricCard icon={BarChart3} label="Gross Profit" value={formatMoney(data.grossProfit)} tone="blue" />
            <MetricCard icon={Wallet} label="Total Expenses" value={formatMoney(data.totalExpenses)} tone="amber" />
            <MetricCard icon={TrendingUp} label="Net Profit" value={formatMoney(data.netProfit)} tone={data.netProfit >= 0 ? 'violet' : 'red'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Store size={16} /> Branch Comparison</h3>
              {data.branchPerf.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No sales in this period.</p> : (
                <div className="space-y-3">
                  {data.branchPerf.map((b: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1"><span className="font-medium text-slate-700">{b.name}</span><span className="text-slate-600">{formatMoney(b.total)}</span></div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" style={{ width: `${(b.total / maxBranch) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Package size={16} /> Top Products</h3>
              {data.topProducts.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No sales in this period.</p> : (
                <div className="space-y-2.5">
                  {data.topProducts.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm"><span className="font-medium text-slate-700 truncate">{p.name}</span><span className="text-slate-500 ml-2">{p.qty} sold</span></div>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(p.qty / maxTop) * 100}%` }} /></div>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{formatMoney(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Inventory Summary</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3"><p className="text-xs text-slate-500 dark:text-slate-400">Total Units</p><p className="text-xl font-bold text-slate-900 dark:text-white">{data.totalUnits}</p></div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3"><p className="text-xs text-slate-500 dark:text-slate-400">Stock Value (cost)</p><p className="text-xl font-bold text-slate-900 dark:text-white">{formatMoney(data.stockValue)}</p></div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3"><p className="text-xs text-amber-600 dark:text-amber-400">Low Stock</p><p className="text-xl font-bold text-amber-700 dark:text-amber-300">{data.lowStock}</p></div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3"><p className="text-xs text-red-600 dark:text-red-400">Out of Stock</p><p className="text-xl font-bold text-red-700 dark:text-red-300">{data.outStock}</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Expenses by Category</h3>
              {data.expByCat.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No expenses in this period.</p> : (
                <div className="space-y-2.5">
                  {data.expByCat.map(([cat, amt]: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1"><span className="font-medium text-slate-700">{cat}</span><span className="text-slate-600">{formatMoney(amt)}</span></div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(amt / maxExp) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </PageContainer>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: 'emerald' | 'blue' | 'amber' | 'violet' | 'red' }) {
  const tones = { emerald: 'from-emerald-500 to-emerald-600', blue: 'from-blue-500 to-blue-600', amber: 'from-amber-500 to-amber-600', violet: 'from-violet-500 to-violet-600', red: 'from-red-500 to-red-600' };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center`}><Icon className="text-white" size={18} /></div>
      </div>
    </Card>
  );
}

export { Badge, formatDate };
