import { lazy, Suspense, useEffect, useState } from 'react';
import { useDashboardData } from '../lib/use-dashboard';
import { useApp } from '../lib/app-context';
import { useAuth } from '../lib/auth';
import { PageContainer, Card, Badge, Button } from '../components/ui';
import { useToast } from '../lib/toast';
import { formatMoney, formatMoneyShort, formatNumber, pctChange, formatDateTime, formatDate } from '../lib/utils';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Package, AlertTriangle, ArrowLeftRight,
  ClipboardList, Users, Banknote, Receipt, ShoppingCart, BarChart3, ArrowUpRight,
  ArrowDownRight, RefreshCw, Activity, Store, Award, Truck, Undo2,
  UserPlus, Package as PackageIcon, Circle, FileDown, FileSpreadsheet, Printer, Clock, Eye,
  Database, Server, Cloud, Wifi, Sun, CloudRain, Zap, Target, Star, Ruler, AlertCircle,
  ShoppingCart as CartIcon, RefreshCw as RefreshIcon, Sparkles, ChevronUp, ChevronDown,
  Settings2, GripVertical,
} from 'lucide-react';
import type { NavKey } from '../components/AppShell';

const SalesChart = lazy(() => import('./dashboard/SalesChart'));
const WeatherWidget = lazy(() => import('./dashboard/WeatherWidget'));

type WidgetKey =
  | 'systemStatus' | 'pendingApprovals' | 'salesTarget' | 'smartAlerts' | 'aiInsights'
  | 'topCashiers' | 'loyaltySummary' | 'supplierSummary' | 'liveFeed' | 'weather'
  | 'branchHealth' | 'cashDrawerStatus' | 'inventoryHealth';

const ALL_WIDGETS: { key: WidgetKey; label: string }[] = [
  { key: 'systemStatus', label: 'System Status' },
  { key: 'pendingApprovals', label: 'Pending Approvals' },
  { key: 'salesTarget', label: 'Today Target' },
  { key: 'smartAlerts', label: 'Smart Alerts' },
  { key: 'aiInsights', label: 'AI Insights' },
  { key: 'topCashiers', label: 'Top Cashiers' },
  { key: 'loyaltySummary', label: 'Loyalty Summary' },
  { key: 'supplierSummary', label: 'Supplier Summary' },
  { key: 'liveFeed', label: 'Live Sales Feed' },
  { key: 'weather', label: 'Weather' },
  { key: 'branchHealth', label: 'Branch Health' },
  { key: 'cashDrawerStatus', label: 'Cash Drawer Status' },
  { key: 'inventoryHealth', label: 'Inventory Health' },
];

export function Dashboard({ onNavigate }: { onNavigate: (k: NavKey) => void }) {
  const d = useDashboardData();
  const { lastUpdated } = useApp();
  const { profile } = useAuth();
  const { success } = useToast();
  const [autoRefresh, setAutoRefresh] = useState<'off' | '30' | '60' | '300'>('off');
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<WidgetKey>>(() => {
    try {
      const saved = localStorage.getItem(`dash-widgets-${profile?.id ?? 'default'}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showPersonalize, setShowPersonalize] = useState(false);

  useEffect(() => {
    if (autoRefresh === 'off') return;
    const ms = Number(autoRefresh) * 1000;
    const id = setInterval(() => d.refresh(), ms);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const toggleWidget = (k: WidgetKey) => {
    setHiddenWidgets((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      localStorage.setItem(`dash-widgets-${profile?.id ?? 'default'}`, JSON.stringify([...n]));
      return n;
    });
  };
  const isVisible = (k: WidgetKey) => !hiddenWidgets.has(k);

  const exportCsv = () => {
    const rows: string[] = ['Section,Metric,Value'];
    rows.push(`KPI,Today's Sales,${d.todaySales}`);
    rows.push(`KPI,Today's Profit,${d.todayProfit}`);
    rows.push(`KPI,Monthly Sales,${d.monthSales}`);
    rows.push(`KPI,Monthly Profit,${d.monthProfit}`);
    rows.push(`KPI,Inventory Value,${d.inventoryValue}`);
    rows.push(`KPI,Low Stock,${d.lowStockCount}`);
    rows.push(`KPI,Pending Transfers,${d.pendingTransfers}`);
    rows.push(`KPI,Pending POs,${d.pendingPOs}`);
    rows.push(`KPI,Today's Customers,${d.todayCustomers}`);
    rows.push(`KPI,Cash in Drawer,${d.cashInDrawer}`);
    rows.push(`KPI,Today's Expenses,${d.todayExpenses}`);
    rows.push(`KPI,Transactions,${d.todayTransactions}`);
    rows.push(`Profit,Gross Margin %,${d.grossMarginPct.toFixed(1)}`);
    rows.push(`Profit,Net Margin %,${d.netMarginPct.toFixed(1)}`);
    rows.push(`Profit,Operating Margin %,${d.operatingMarginPct.toFixed(1)}`);
    rows.push(`Profit,Expense Ratio %,${d.expenseRatioPct.toFixed(1)}`);
    rows.push(`Returns,Today,${d.todayReturns}`);
    rows.push(`Returns,Monthly,${d.monthReturns}`);
    rows.push(`Returns,Refund Amount,${d.refundAmount}`);
    rows.push(`Returns,Return %,${d.returnPct.toFixed(1)}`);
    rows.push(`Target,Today Target,${d.salesTarget.todayTarget}`);
    rows.push(`Target,Today Achievement %,${d.salesTarget.todayPct.toFixed(1)}`);
    rows.push(`Target,Month Target,${d.salesTarget.monthTarget}`);
    rows.push(`Target,Month Achievement %,${d.salesTarget.monthPct.toFixed(1)}`);
    d.branchPerf.forEach((b) => rows.push(`Branch,${b.name} Sales,${b.sales}`));
    d.payments.forEach((p) => rows.push(`Payment,${p.method},${p.amount}`));
    d.topCashiers.forEach((c) => rows.push(`Cashier,${c.name},${c.sales}`));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    success('Excel/CSV exported');
  };

  const exportPdf = () => { window.print(); success('Print dialog opened (save as PDF)'); };
  const printDashboard = () => window.print();

  return (
    <PageContainer>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1"><Circle size={8} className="text-emerald-500 fill-emerald-500 animate-pulse" /> Live</span>
            · Last updated {formatDateTime(lastUpdated)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={autoRefresh} onChange={(e) => setAutoRefresh(e.target.value as any)} className="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300" title="Auto refresh interval">
            <option value="off">Manual</option>
            <option value="30">30 sec</option>
            <option value="60">1 min</option>
            <option value="300">5 min</option>
          </select>
          <button onClick={d.refresh} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowPersonalize(!showPersonalize)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700" title="Personalize dashboard">
            <Settings2 size={14} /> Customize
          </button>
          <Button variant="secondary" size="sm" onClick={exportCsv}><FileSpreadsheet size={14} className="inline mr-1" /> Excel</Button>
          <Button variant="secondary" size="sm" onClick={exportPdf}><FileDown size={14} className="inline mr-1" /> PDF</Button>
          <Button variant="secondary" size="sm" onClick={printDashboard}><Printer size={14} className="inline mr-1" /> Print</Button>
        </div>
      </div>

      {/* Personalization panel */}
      {showPersonalize && (
        <Card className="p-4 mb-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Show / Hide Widgets</h3>
            <button onClick={() => setShowPersonalize(false)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_WIDGETS.map((w) => (
              <button key={w.key} onClick={() => toggleWidget(w.key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isVisible(w.key) ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-700 dark:border-slate-600'}`}>
                {isVisible(w.key) ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {w.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {d.loading ? <DashboardSkeleton /> : d.error ? (
        <Card className="p-6 text-center text-red-600">Error loading dashboard: {d.error}</Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            <KpiCard label="Today's Sales" value={formatMoney(d.todaySales)} icon={DollarSign} color="emerald" change={pctChange(d.todaySales, d.prevDaySales)} prevValue={formatMoney(d.prevDaySales)} prevLabel="Yesterday" onClick={() => onNavigate('reports')} trend={d.chartData.slice(-7).map((c) => c.sales)} />
            <KpiCard label="Today's Profit" value={formatMoney(d.todayProfit)} icon={TrendingUp} color="blue" change={pctChange(d.todayProfit, d.prevDayProfit)} prevValue={formatMoney(d.prevDayProfit)} prevLabel="Yesterday" onClick={() => onNavigate('reports')} trend={d.chartData.slice(-7).map((c) => c.profit)} />
            <KpiCard label="Monthly Sales" value={formatMoney(d.monthSales)} icon={BarChart3} color="emerald" change={pctChange(d.monthSales, d.prevMonthSales)} prevValue={formatMoney(d.prevMonthSales)} prevLabel="Last Month" onClick={() => onNavigate('reports')} trend={d.chartData.slice(-7).map((c) => c.sales)} />
            <KpiCard label="Monthly Profit" value={formatMoney(d.monthProfit)} icon={ArrowUpRight} color="blue" change={pctChange(d.monthProfit, d.prevMonthProfit)} prevValue={formatMoney(d.prevMonthProfit)} prevLabel="Last Month" onClick={() => onNavigate('reports')} trend={d.chartData.slice(-7).map((c) => c.profit)} />
            <KpiCard label="Inventory Value" value={formatMoney(d.inventoryValue)} icon={Package} color="orange" onClick={() => onNavigate('inventory')} trend={d.chartData.slice(-7).map((c) => c.sales)} />
            <KpiCard label="Low Stock" value={formatNumber(d.lowStockCount)} icon={AlertTriangle} color="amber" onClick={() => onNavigate('inventory')} />
            <KpiCard label="Pending Transfers" value={formatNumber(d.pendingTransfers)} icon={ArrowLeftRight} color="violet" onClick={() => onNavigate('transfers')} />
            <KpiCard label="Pending POs" value={formatNumber(d.pendingPOs)} icon={ClipboardList} color="violet" onClick={() => onNavigate('purchase_orders')} />
            <KpiCard label="Today's Customers" value={formatNumber(d.todayCustomers)} icon={Users} color="emerald" onClick={() => onNavigate('customers')} />
            <KpiCard label="Cash in Drawer" value={formatMoney(d.cashInDrawer)} icon={Banknote} color="emerald" onClick={() => onNavigate('reports')} />
            <KpiCard label="Today's Expenses" value={formatMoney(d.todayExpenses)} icon={Wallet} color="red" onClick={() => onNavigate('expenses')} />
            <KpiCard label="Transactions" value={formatNumber(d.todayTransactions)} icon={Receipt} color="slate" onClick={() => onNavigate('reports')} />
          </div>

          {/* NEW: System Status + Weather + Sales Target */}
          {isVisible('systemStatus') || isVisible('weather') || isVisible('salesTarget') ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              {isVisible('systemStatus') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Database size={16} className="text-emerald-500" /> System Status</h3>
                  <div className="space-y-2 text-sm">
                    <StatusRow icon={Database} label="Database" value={d.systemStatus.database} ok />
                    <StatusRow icon={Server} label="Server" value={d.systemStatus.server} ok />
                    <StatusRow icon={Wifi} label="Realtime Sync" value={d.systemStatus.realtime} ok />
                    <StatusRow icon={Cloud} label="Cloud Backup" value={d.systemStatus.cloudBackup} ok />
                    <p className="text-xs text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-700 mt-1.5">Last Backup: {formatDateTime(d.systemStatus.lastBackup)}</p>
                  </div>
                </Card>
              )}
              {isVisible('weather') && (
                <Suspense fallback={<div className="p-5 bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-slate-700 rounded-xl border border-slate-200 dark:border-slate-700"><div className="h-20 animate-pulse" /></div>}>
                  <WeatherWidget />
                </Suspense>
              )}
              {isVisible('salesTarget') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Target size={16} className="text-violet-500" /> Sales Target</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 dark:text-slate-300">Today</span><span className="font-medium">{formatMoneyShort(d.salesTarget.todaySales)} / {formatMoneyShort(d.salesTarget.todayTarget)}</span></div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${d.salesTarget.todayPct >= 100 ? 'bg-emerald-500' : d.salesTarget.todayPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(d.salesTarget.todayPct, 100)}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{d.salesTarget.todayPct.toFixed(1)}% achieved</p>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 dark:text-slate-300">This Month</span><span className="font-medium">{formatMoneyShort(d.salesTarget.monthSales)} / {formatMoneyShort(d.salesTarget.monthTarget)}</span></div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${d.salesTarget.monthPct >= 100 ? 'bg-emerald-500' : d.salesTarget.monthPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(d.salesTarget.monthPct, 100)}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{d.salesTarget.monthPct.toFixed(1)}% achieved</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ) : null}

          {/* NEW: Smart Alerts + AI Insights */}
          {isVisible('smartAlerts') || isVisible('aiInsights') ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              {isVisible('smartAlerts') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Zap size={16} className="text-amber-500" /> Smart Alerts</h3>
                  {d.smartAlerts.length === 0 ? <EmptyState message="No alerts — everything looks good" /> : (
                    <div className="space-y-2">
                      {d.smartAlerts.map((a) => (
                        <div key={a.id} className={`flex items-start gap-2 p-2.5 rounded-lg ${alertBg(a.type)}`}>
                          <AlertCircle size={16} className={`shrink-0 mt-0.5 ${alertText(a.type)}`} />
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.title}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">{a.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              {isVisible('aiInsights') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Sparkles size={16} className="text-violet-500" /> AI Business Insights</h3>
                  {d.aiInsights.length === 0 ? <EmptyState message="No insights available yet" /> : (
                    <div className="space-y-2.5">
                      {d.aiInsights.map((ins) => (
                        <div key={ins.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                            <InsightIcon icon={ins.icon} />
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-200 pt-1">{ins.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          ) : null}

          {/* NEW: Pending Approvals */}
          {isVisible('pendingApprovals') && (
            <Card className="p-5 mb-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><ClipboardList size={16} className="text-orange-500" /> Pending Approvals</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {d.pendingApprovals.map((pa) => (
                  <button key={pa.id} onClick={() => onNavigate(pa.nav as NavKey)} className="text-left bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 hover:shadow-md transition-shadow border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{pa.type}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{pa.count}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">{pa.label} →</p>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Sales Performance Chart */}
          <Card className="p-5 mb-5">
            <Suspense fallback={<div className="h-64 flex items-center justify-center text-slate-400 text-sm">Loading chart…</div>}>
              <SalesChart data={d.chartData} />
            </Suspense>
          </Card>

          {/* Low Stock + Best Sellers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Low Stock Alerts</h3>
                <button onClick={() => onNavigate('inventory')} className="text-xs text-emerald-600 hover:underline">View all</button>
              </div>
              {d.lowStockItems.length === 0 ? <EmptyState message="All stock levels are healthy" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-slate-400 uppercase">
                      <th className="text-left pb-2 font-medium">Product</th><th className="text-left pb-2 font-medium">Brand</th><th className="text-left pb-2 font-medium">Color</th><th className="text-left pb-2 font-medium">Size</th>
                      <th className="text-right pb-2 font-medium">Current</th><th className="text-right pb-2 font-medium">Min</th><th className="text-left pb-2 font-medium">Supplier</th>
                      <th className="text-right pb-2 font-medium">Lead</th><th className="text-right pb-2 font-medium">Reorder</th><th className="pb-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {d.lowStockItems.map((i, idx) => (
                        <tr key={idx}>
                          <td className="py-2 font-medium text-slate-800 dark:text-slate-200">{i.name}</td>
                          <td className="py-2 text-slate-600 dark:text-slate-300">{i.brand ?? '-'}</td>
                          <td className="py-2 text-slate-600 dark:text-slate-300">{i.color ?? '-'}</td>
                          <td className="py-2"><Badge color="slate">{i.size}</Badge></td>
                          <td className="py-2 text-right text-amber-600 font-semibold">{i.current}</td>
                          <td className="py-2 text-right text-slate-400">{i.minimum}</td>
                          <td className="py-2 text-xs text-slate-500">{i.supplier ?? '-'}</td>
                          <td className="py-2 text-right text-xs text-slate-500">{i.leadTime}d</td>
                          <td className="py-2 text-right text-xs font-semibold text-orange-600">{i.reorderQty}</td>
                          <td className="py-2 text-right"><button onClick={() => onNavigate('purchase_orders')} className="text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300">Reorder</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Award size={16} className="text-emerald-500" /> Best Selling Shoes</h3>
                <button onClick={() => onNavigate('reports')} className="text-xs text-emerald-600 hover:underline">View all</button>
              </div>
              {d.bestSellers.length === 0 ? <EmptyState message="No sales this month yet" /> : (
                <div className="space-y-3">
                  {d.bestSellers.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.brand} · {p.color} · {p.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.sold} sold</p>
                        <p className="text-xs text-slate-400">{p.remaining} left · {formatMoneyShort(p.profit)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* NEW: Top Cashiers + Loyalty + Supplier */}
          {isVisible('topCashiers') || isVisible('loyaltySummary') || isVisible('supplierSummary') ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              {isVisible('topCashiers') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Users size={16} className="text-blue-500" /> Top 5 Cashiers</h3>
                  {d.topCashiers.length === 0 ? <EmptyState message="No cashier data" /> : (
                    <div className="space-y-2.5">
                      {d.topCashiers.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                            <p className="text-xs text-slate-400">{c.transactions} txns · Avg {formatMoneyShort(c.avgBill)}</p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-600">{formatMoneyShort(c.sales)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              {isVisible('loyaltySummary') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Award size={16} className="text-violet-500" /> Loyalty Summary</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Members" value={String(d.loyaltySummary.members)} color="text-violet-600" />
                    <MiniStat label="VIP" value={String(d.loyaltySummary.vip)} color="text-amber-600" />
                    <MiniStat label="Points Issued Today" value={String(d.loyaltySummary.pointsIssuedToday)} color="text-emerald-600" />
                    <MiniStat label="Points Redeemed" value={String(d.loyaltySummary.pointsRedeemedToday)} color="text-blue-600" />
                    <MiniStat label="Active Members" value={String(d.loyaltySummary.activeMembers)} color="text-emerald-600" />
                  </div>
                </Card>
              )}
              {isVisible('supplierSummary') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Truck size={16} className="text-orange-500" /> Supplier Summary</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Total Suppliers" value={String(d.supplierSummary.totalSuppliers)} color="text-slate-600" />
                    <MiniStat label="Pending Payments" value={String(d.supplierSummary.pendingPayments)} color="text-red-600" />
                    <MiniStat label="Outstanding" value={formatMoneyShort(d.supplierSummary.outstandingBalance)} color="text-red-600" />
                    <MiniStat label="Purchase/Month" value={formatMoneyShort(d.supplierSummary.purchaseThisMonth)} color="text-blue-600" />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Recent: {d.supplierSummary.recentSupplier ?? 'None'}</p>
                </Card>
              )}
            </div>
          ) : null}

          {/* NEW: Live Sales Feed + Cash Drawer Status */}
          {isVisible('liveFeed') || isVisible('cashDrawerStatus') ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              {isVisible('liveFeed') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><span className="inline-flex items-center gap-1"><Circle size={8} className="text-emerald-500 fill-emerald-500 animate-pulse" /></span> Live Sales Feed</h3>
                  {d.liveSalesFeed.length === 0 ? <EmptyState message="No sales today" /> : (
                    <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                      {d.liveSalesFeed.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 animate-fade-in">
                          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0"><CartIcon size={15} className="text-emerald-600" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{s.product_name}</p>
                            <p className="text-xs text-slate-400">{s.receipt_no} · {s.cashier_name} · {s.customer_name} · {s.branch_name} · {s.payment_method} · {timeAgo(s.created_at)}</p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-600">{formatMoney(s.total)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              {isVisible('cashDrawerStatus') && (
                <Card className="p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Banknote size={16} className="text-emerald-500" /> Cash Drawer Status</h3>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Opening Cash</span><span className="font-medium">{formatMoney(d.openingCash)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Cash Sales</span><span className="font-medium text-emerald-600">{formatMoney(d.cashSales)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Card Sales</span><span className="font-medium text-blue-600">{formatMoney(d.cardSales)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Digital Payments</span><span className="font-medium text-violet-600">{formatMoney(d.digitalPayments)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Expenses</span><span className="font-medium text-red-600">{formatMoney(d.cashExpenses)}</span></div>
                    <div className="flex justify-between border-t border-slate-100 dark:border-slate-700 pt-2"><span className="font-semibold">Closing Cash</span><span className="font-bold text-slate-900 dark:text-white">{formatMoney(d.closingCash)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Difference</span><span className={`font-bold ${d.cashDifference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(d.cashDifference)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Cashier</span><span className="font-medium">{d.topCashiers[0]?.name ?? '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Status</span><Badge color={d.cashDifference === 0 ? 'green' : 'amber'}>{d.cashDifference === 0 ? 'Balanced' : 'Variance'}</Badge></div>
                  </div>
                </Card>
              )}
            </div>
          ) : null}

          {/* Branch Performance */}
          <Card className="p-5 mb-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Store size={16} className="text-blue-500" /> Branch Performance</h3>
            {d.branchPerf.length === 0 ? <EmptyState message="No branch data" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 uppercase">
                    <th className="text-left pb-2 font-medium">Branch</th><th className="text-right pb-2 font-medium">Sales</th><th className="text-right pb-2 font-medium">Profit</th>
                    <th className="text-right pb-2 font-medium">Expenses</th><th className="text-right pb-2 font-medium">Txns</th><th className="text-right pb-2 font-medium">Customers</th>
                    <th className="text-right pb-2 font-medium">Avg Order</th><th className="text-right pb-2 font-medium">Inv Value</th><th className="text-right pb-2 font-medium">Inv Count</th>
                    <th className="text-right pb-2 font-medium">Open Cash</th><th className="text-right pb-2 font-medium">Close Cash</th><th className="text-right pb-2 font-medium">Pend. Tr</th><th className="text-right pb-2 font-medium">Pend. PO</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {d.branchPerf.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer" onClick={() => onNavigate('branches')}>
                        <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">{b.name}</td>
                        <td className="py-2.5 text-right text-emerald-600 font-medium">{formatMoneyShort(b.sales)}</td>
                        <td className="py-2.5 text-right text-blue-600 font-medium">{formatMoneyShort(b.profit)}</td>
                        <td className="py-2.5 text-right text-red-600">{formatMoneyShort(b.expenses)}</td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{b.transactions}</td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{b.customers}</td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{formatMoneyShort(b.avgOrder)}</td>
                        <td className="py-2.5 text-right text-orange-600">{formatMoneyShort(b.inventoryValue)}</td>
                        <td className="py-2.5 text-right text-slate-500">{b.inventoryCount}</td>
                        <td className="py-2.5 text-right text-slate-500">{formatMoneyShort(b.openingCash)}</td>
                        <td className="py-2.5 text-right text-emerald-600">{formatMoneyShort(b.closingCash)}</td>
                        <td className="py-2.5 text-right text-violet-600">{b.pendingTransfers}</td>
                        <td className="py-2.5 text-right text-violet-600">{b.pendingPOs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* NEW: Branch Health */}
          {isVisible('branchHealth') && (
            <Card className="p-5 mb-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Store size={16} className="text-emerald-500" /> Branch Health Score</h3>
              {d.branchHealth.length === 0 ? <EmptyState message="No branch data" /> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {d.branchHealth.map((b) => (
                    <div key={b.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{b.name}</p>
                        <span className={`w-3 h-3 rounded-full ${b.status === 'green' ? 'bg-emerald-500' : b.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`} />
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full ${b.status === 'green' ? 'bg-emerald-500' : b.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${b.healthPct}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-xs text-slate-500">
                        <div><p className="text-slate-400">Sales</p><p className="font-medium text-slate-700 dark:text-slate-200">{formatMoneyShort(b.sales)}</p></div>
                        <div><p className="text-slate-400">Profit</p><p className="font-medium text-blue-600">{formatMoneyShort(b.profit)}</p></div>
                        <div><p className="text-slate-400">Growth</p><p className={`font-medium ${b.growthPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{b.growthPct.toFixed(0)}%</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Payment Summary + Profit Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Banknote size={16} className="text-emerald-500" /> Payment Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {d.payments.map((p) => (
                  <div key={p.method} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{p.method}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMoneyShort(p.amount)}</p>
                    <p className="text-xs text-slate-400">{p.count} txns</p>
                    <p className="text-xs font-semibold text-emerald-600 mt-0.5">{p.pct.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500" /> Profit Analytics</h3>
              <div className="space-y-3">
                <ProfitRow label="Gross Profit" value={formatMoney(d.grossProfit)} color="text-blue-600" />
                <ProfitRow label="Total Expenses" value={formatMoney(d.totalExpenses)} color="text-red-600" />
                <ProfitRow label="Operating Cost" value={formatMoney(d.operatingCost)} color="text-red-600" />
                <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                  <ProfitRow label="Net Profit" value={formatMoney(d.netProfit)} color={d.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} bold />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <MarginStat label="Gross Margin" value={d.grossMarginPct} />
                  <MarginStat label="Net Margin" value={d.netMarginPct} />
                  <MarginStat label="Operating Margin" value={d.operatingMarginPct} />
                  <MarginStat label="Expense Ratio" value={d.expenseRatioPct} />
                </div>
              </div>
            </Card>
          </div>

          {/* Footwear Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <BrandAnalyticsCard data={d.salesByBrand} />
            <AnalyticsCard title="Sales by Category" data={d.salesByCategory} color="blue" />
            <AnalyticsCard title="Sales by Gender" data={d.salesByGender} color="violet" />
            <AnalyticsCard title="Top Selling Sizes" data={d.salesBySize} color="orange" />
            <AnalyticsCard title="Top Selling Colors" data={d.salesByColor} color="amber" />
            <AnalyticsCard title="Top Selling Seasons" data={d.salesBySeason} color="emerald" />
          </div>

          {/* Customer Analytics + Cash Drawer + Returns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Users size={16} className="text-emerald-500" /> Customer Analytics</h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="New Today" value={String(d.newCustomers)} color="text-emerald-600" />
                <MiniStat label="Returning" value={String(d.returningCustomers)} color="text-blue-600" />
                <MiniStat label="Returning %" value={`${d.returningPct.toFixed(1)}%`} color="text-blue-600" />
                <MiniStat label="VIP" value={String(d.vipCustomers)} color="text-amber-600" />
                <MiniStat label="Loyalty Members" value={String(d.loyaltyMembers)} color="text-violet-600" />
                <MiniStat label="Avg Spending" value={formatMoneyShort(d.avgSpending)} color="text-emerald-600" />
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Banknote size={16} className="text-emerald-500" /> Cash Drawer</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Opening Cash</span><span className="font-medium">{formatMoney(d.openingCash)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Cash Sales</span><span className="font-medium text-emerald-600">{formatMoney(d.cashSales)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Cash Expenses</span><span className="font-medium text-red-600">{formatMoney(d.cashExpenses)}</span></div>
                <div className="flex justify-between border-t border-slate-100 dark:border-slate-700 pt-2"><span className="font-semibold">Closing Cash</span><span className="font-bold text-slate-900 dark:text-white">{formatMoney(d.closingCash)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Difference</span><span className={`font-medium ${d.cashDifference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(d.cashDifference)}</span></div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Undo2 size={16} className="text-red-500" /> Returns Analytics</h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Today's Returns" value={String(d.todayReturns)} color="text-red-600" />
                <MiniStat label="Monthly Returns" value={String(d.monthReturns)} color="text-red-600" />
                <MiniStat label="Refund Amount" value={formatMoneyShort(d.refundAmount)} color="text-red-600" />
                <MiniStat label="Exchanges" value={String(d.exchangeCount)} color="text-amber-600" />
                <MiniStat label="Return %" value={`${d.returnPct.toFixed(1)}%`} color="text-red-600" />
              </div>
            </Card>
          </div>

          {/* NEW: Inventory Health */}
          {isVisible('inventoryHealth') && (
            <Card className="p-5 mb-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Package size={16} className="text-orange-500" /> Inventory Health</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
                <InvStat label="Fast Moving" value={String(d.fastMoving.length)} color="text-emerald-600" />
                <InvStat label="Slow Moving" value={String(d.slowMoving.length)} color="text-amber-600" />
                <InvStat label="Dead Stock" value={String(d.deadStock)} color="text-slate-600" />
                <InvStat label="Out of Stock" value={String(d.outOfStock)} color="text-red-600" />
                <InvStat label="Low Stock" value={String(d.lowStockCount)} color="text-amber-600" />
                <InvStat label="Turnover" value={`${d.inventoryTurnover.toFixed(2)}x`} color="text-blue-600" />
                <InvStat label="Total Pairs" value={formatNumber(d.totalPairs)} color="text-slate-600" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Fast Moving</p>
                  {d.fastMoving.length === 0 ? <p className="text-xs text-slate-400">No data</p> : d.fastMoving.map((f, i) => (
                    <div key={i} className="flex justify-between text-sm py-1"><span className="text-slate-600 dark:text-slate-300">{f.name}</span><span className="text-emerald-600 font-medium">{f.sold}</span></div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Slow Moving (0 sold this month)</p>
                  {d.slowMoving.length === 0 ? <p className="text-xs text-slate-400">No slow items</p> : d.slowMoving.map((s, i) => (
                    <div key={i} className="flex justify-between text-sm py-1"><span className="text-slate-600 dark:text-slate-300">{s.name}</span><span className="text-red-500">{s.remaining} in stock</span></div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Inventory Analytics */}
          <Card className="p-5 mb-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Package size={16} className="text-orange-500" /> Inventory Analytics</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <InvStat label="Warehouse Value" value={formatMoneyShort(d.warehouseStockValue)} color="text-orange-600" />
              <InvStat label="Branch Value" value={formatMoneyShort(d.branchStockValue)} color="text-blue-600" />
              <InvStat label="Total Value" value={formatMoneyShort(d.inventoryValue)} color="text-emerald-600" />
              <InvStat label="Total SKUs" value={String(d.totalSkus)} color="text-slate-600" />
              <InvStat label="Total Pairs" value={formatNumber(d.totalPairs)} color="text-slate-600" />
              <InvStat label="Growth" value={`${d.inventoryGrowthPct.toFixed(1)}%`} color="text-emerald-600" />
              <InvStat label="Out of Stock" value={String(d.outOfStock)} color="text-red-600" />
              <InvStat label="Low Stock" value={String(d.lowStockCount)} color="text-amber-600" />
              <InvStat label="Dead Stock" value={String(d.deadStock)} color="text-slate-600" />
            </div>
          </Card>

          {/* Warehouse + Purchase Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><PackageIcon size={16} className="text-orange-500" /> Warehouse Analytics</h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Pending Receipts" value={String(d.pendingReceipts)} color="text-amber-600" />
                <MiniStat label="Pending Dispatch" value={String(d.pendingDispatch)} color="text-amber-600" />
                <MiniStat label="Pending Transfers" value={String(d.pendingTransfers)} color="text-violet-600" />
                <MiniStat label="Approved Transfers" value={String(d.approvedTransfers)} color="text-emerald-600" />
                <MiniStat label="Rejected Transfers" value={String(d.rejectedTransfers)} color="text-red-600" />
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><ClipboardList size={16} className="text-violet-500" /> Purchase Analytics</h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Pending" value={String(d.poPending)} color="text-amber-600" />
                <MiniStat label="Received" value={String(d.poReceived)} color="text-emerald-600" />
                <MiniStat label="Cancelled" value={String(d.poCancelled)} color="text-red-600" />
                <MiniStat label="Rejected" value={String(d.poRejected)} color="text-red-600" />
                <MiniStat label="Completed" value={String(d.poCompleted)} color="text-emerald-600" />
              </div>
            </Card>
          </div>

          {/* Recent Sales + Activities */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-white">Recent Sales</h3>
                <button onClick={() => onNavigate('reports')} className="text-xs text-emerald-600 hover:underline">View all</button>
              </div>
              {d.recentSales.length === 0 ? <EmptyState message="No sales yet" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-slate-400 uppercase">
                      <th className="text-left pb-2 font-medium">Receipt</th><th className="text-left pb-2 font-medium">Date</th><th className="text-left pb-2 font-medium">Customer</th>
                      <th className="text-left pb-2 font-medium">Cashier</th><th className="text-left pb-2 font-medium">Branch</th><th className="text-left pb-2 font-medium">Pay</th>
                      <th className="text-right pb-2 font-medium">Items</th><th className="text-right pb-2 font-medium">Total</th><th className="text-center pb-2 font-medium">Actions</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {d.recentSales.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="py-2"><Badge color="blue">{s.receipt_no}</Badge></td>
                          <td className="py-2 text-slate-500 text-xs">{formatDateTime(s.created_at)}</td>
                          <td className="py-2 text-slate-600 dark:text-slate-300">{s.customer_name}</td>
                          <td className="py-2 text-slate-600 dark:text-slate-300">{s.cashier_name}</td>
                          <td className="py-2 text-slate-600 dark:text-slate-300 text-xs">{s.branch_name}</td>
                          <td className="py-2"><Badge color="slate">{s.payment_method}</Badge></td>
                          <td className="py-2 text-right text-slate-500">{s.items_count}</td>
                          <td className="py-2 text-right font-semibold text-slate-900 dark:text-white">{formatMoney(Number(s.total))}</td>
                          <td className="py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button title="View" onClick={() => onNavigate('reports')} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500"><Eye size={14} /></button>
                              <button title="Print Receipt" onClick={() => printReceipt(s)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500"><Printer size={14} /></button>
                              <button title="Return" onClick={() => onNavigate('returns')} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-red-500"><Undo2 size={14} /></button>
                              <button title="Exchange" onClick={() => onNavigate('returns')} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-amber-500"><ArrowLeftRight size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Activity size={16} className="text-violet-500" /> Recent Activities</h3>
              {d.activities.length === 0 ? <EmptyState message="No recent activities" /> : (
                <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
                  {d.activities.map((a) => (
                    <div key={a.id} className="flex gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 p-1.5 rounded-lg" onClick={() => onNavigate(activityNav(a.icon))}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activityColor(a.icon).bg}`}>
                        <ActivityIcon icon={a.icon} color={activityColor(a.icon).text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200">{a.user} {a.message}</p>
                        <p className="text-xs text-slate-400">{a.branch !== '-' ? `${a.branch} · ` : ''}{formatDateTime(a.created_at)}</p>
                      </div>
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

function printReceipt(s: any) {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;
  w.document.write(`<html><head><title>${s.receipt_no}</title><style>body{font-family:monospace;padding:12px;font-size:12px}h2{margin:0}.r{text-align:right}.c{text-align:center}hr{border:none;border-top:1px dashed #999;margin:6px 0}</style></head><body>
    <div class="c"><h2>SoleERP</h2><p>Receipt: ${s.receipt_no}<br/>Date: ${formatDateTime(s.created_at)}<br/>Cashier: ${s.cashier_name}<br/>Branch: ${s.branch_name}<br/>Customer: ${s.customer_name}</p></div><hr/>
    <p>Items: ${s.items_count}</p><p class="r">Subtotal: ${formatMoney(Number(s.subtotal ?? s.total))}</p><p class="r">Discount: ${formatMoney(Number(s.discount ?? 0))}</p><p class="r">Tax: ${formatMoney(Number(s.tax ?? 0))}</p><hr/><p class="r"><b>Total: ${formatMoney(Number(s.total))}</b></p><p>Payment: ${s.payment_method}</p><div class="c"><br/>Thank you!</div><script>window.print()</script></body></html>`);
  w.document.close();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
}

function activityNav(icon: string): NavKey {
  switch (icon) {
    case 'sale': return 'reports';
    case 'po': return 'purchase_orders';
    case 'transfer': return 'transfers';
    case 'return': return 'returns';
    case 'customer': return 'customers';
    case 'product': return 'products';
    default: return 'dashboard';
  }
}

function activityColor(icon: string): { bg: string; text: string } {
  switch (icon) {
    case 'sale': return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600' };
    case 'po': return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600' };
    case 'transfer': return { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600' };
    case 'return': return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600' };
    default: return { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500' };
  }
}

function alertBg(type: string): string {
  switch (type) {
    case 'critical': return 'bg-red-50 dark:bg-red-900/20';
    case 'warning': return 'bg-amber-50 dark:bg-amber-900/20';
    case 'info': return 'bg-blue-50 dark:bg-blue-900/20';
    case 'success': return 'bg-emerald-50 dark:bg-emerald-900/20';
    default: return 'bg-slate-50 dark:bg-slate-700/50';
  }
}
function alertText(type: string): string {
  switch (type) {
    case 'critical': return 'text-red-600';
    case 'warning': return 'text-amber-600';
    case 'info': return 'text-blue-600';
    case 'success': return 'text-emerald-600';
    default: return 'text-slate-500';
  }
}

function InsightIcon({ icon }: { icon: string }) {
  const map: Record<string, any> = { 'trend-up': TrendingUp, 'trend-down': TrendingDown, star: Star, ruler: Ruler, alert: AlertCircle, 'shopping-cart': CartIcon, refresh: RefreshIcon };
  const Icon = map[icon] ?? Sparkles;
  return <Icon size={14} className="text-violet-600" />;
}

function StatusRow({ icon: Icon, label, value, ok }: { icon: any; label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Icon size={14} className="text-slate-400" /> {label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-medium ${ok ? 'text-emerald-600' : 'text-slate-600'}`}>
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-400'}`} /> {value}
      </span>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, change, prevValue, prevLabel, onClick, trend }: { label: string; value: string; icon: any; color: string; change?: number; prevValue?: string; prevLabel?: string; onClick?: () => void; trend?: number[] }) {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-500 to-emerald-600', blue: 'from-blue-500 to-blue-600',
    orange: 'from-orange-500 to-orange-600', amber: 'from-amber-500 to-amber-600',
    violet: 'from-violet-500 to-violet-600', red: 'from-red-500 to-red-600', slate: 'from-slate-500 to-slate-600',
  };
  return (
    <button onClick={onClick} className="text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 hover:shadow-md transition-shadow relative overflow-hidden group">
      <div className={`absolute -right-3 -top-3 w-16 h-16 rounded-full bg-gradient-to-br ${colorMap[color]} opacity-10`} />
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center shadow-sm`}>
          <Icon className="text-white" size={16} />
        </div>
        {change !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{value}</p>
      {trend && trend.length > 1 && <MiniTrend data={trend} color={color} />}
      {prevValue && prevLabel && <p className="text-[10px] text-slate-400 mt-1.5">{prevLabel}: {prevValue}</p>}
      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-0.5"><Clock size={9} /> {formatDateTime(new Date())}</p>
    </button>
  );
}

function MiniTrend({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const colorMap: Record<string, string> = { emerald: '#10b981', blue: '#3b82f6', orange: '#f97316', amber: '#f59e0b', violet: '#8b5cf6', red: '#ef4444', slate: '#64748b' };
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${100 - ((v - min) / range) * 90}`).join(' ');
  return (
    <svg className="w-full h-6 mt-1.5" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={colorMap[color] ?? '#64748b'} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function AnalyticsCard({ title, data, color }: { title: string; data: { name: string; total: number; pct: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const colorMap: Record<string, string> = { emerald: 'bg-emerald-500', blue: 'bg-blue-500', violet: 'bg-violet-500', orange: 'bg-orange-500', amber: 'bg-amber-500' };
  return (
    <Card className="p-5">
      <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
      {data.length === 0 ? <EmptyState message="No data" /> : (
        <div className="space-y-2.5">
          {data.slice(0, 6).map((d, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 dark:text-slate-300">{d.name}</span><span className="text-slate-500">{formatMoneyShort(d.total)} · {d.pct.toFixed(1)}%</span></div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${colorMap[color]} rounded-full`} style={{ width: `${(d.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BrandAnalyticsCard({ data }: { data: { name: string; total: number; units: number; pct: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <Card className="p-5">
      <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Sales by Brand</h3>
      {data.length === 0 ? <EmptyState message="No data" /> : (
        <div className="space-y-2.5">
          {data.slice(0, 6).map((d, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 dark:text-slate-300">{d.name}</span><span className="text-slate-500">{formatMoneyShort(d.total)} · {d.pct.toFixed(1)}% · {d.units} units</span></div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(d.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ProfitRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm text-slate-600 dark:text-slate-300 ${bold ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`${bold ? 'text-base font-bold' : 'text-sm font-medium'} ${color}`}>{value}</span>
    </div>
  );
}

function MarginStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white">{value.toFixed(1)}%</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function InvStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ActivityIcon({ icon, color }: { icon: string; color: string }) {
  const icons: Record<string, any> = { sale: ShoppingCart, transfer: ArrowLeftRight, po: Truck, return: Undo2, customer: UserPlus, product: PackageIcon };
  const Icon = icons[icon] ?? Activity;
  return <Icon size={14} className={color} />;
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500"><p className="text-sm">{message}</p></div>;
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
      </div>
      <div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse mb-5" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="h-48 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-48 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </div>
    </>
  );
}
