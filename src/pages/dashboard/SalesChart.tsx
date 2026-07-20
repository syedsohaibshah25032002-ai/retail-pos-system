import { useState } from 'react';
import type { ChartPoint } from '../../lib/use-dashboard';
import { formatMoneyShort, formatMoney, formatDate } from '../../lib/utils';
import { BarChart2, LineChart as LineChartIcon } from 'lucide-react';

type Metric = 'sales' | 'revenue' | 'profit' | 'transactions';

export function SalesChart({ data }: { data: ChartPoint[] }) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
  const [metric, setMetric] = useState<Metric>('sales');
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(...data.map((c) => c[metric] as number), 1);
  const hasData = data.some((c) => c[metric] > 0);

  const metrics: { key: Metric; label: string; color: string }[] = [
    { key: 'sales', label: 'Sales', color: '#10b981' },
    { key: 'revenue', label: 'Revenue', color: '#3b82f6' },
    { key: 'profit', label: 'Profit', color: '#8b5cf6' },
    { key: 'transactions', label: 'Transactions', color: '#f59e0b' },
  ];
  const active = metrics.find((m) => m.key === metric)!;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">Sales Performance</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
            {metrics.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${metric === m.key ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
            <button onClick={() => setChartType('bar')} className={`p-1.5 rounded-md ${chartType === 'bar' ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`}><BarChart2 size={15} className={chartType === 'bar' ? 'text-slate-900 dark:text-white' : 'text-slate-400'} /></button>
            <button onClick={() => setChartType('line')} className={`p-1.5 rounded-md ${chartType === 'line' ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`}><LineChartIcon size={15} className={chartType === 'line' ? 'text-slate-900 dark:text-white' : 'text-slate-400'} /></button>
          </div>
        </div>
      </div>

      <div className="relative">
        {!hasData ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
            <BarChart2 size={40} className="mb-2 opacity-40" />
            <p className="text-sm">No Sales Data</p>
          </div>
        ) : (
        <>
        {hover !== null && data[hover] && (
          <div className="absolute z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs pointer-events-none" style={{ left: `${(hover / Math.max(data.length - 1, 1)) * 100}%`, top: 0, transform: 'translateX(-50%)' }}>
            <p className="font-semibold text-slate-900 dark:text-white mb-1.5">{formatDate(data[hover].date)}</p>
            <p className="text-slate-600 dark:text-slate-300">Sales: <span className="font-medium">{formatMoney(data[hover].sales)}</span></p>
            <p className="text-slate-600 dark:text-slate-300">Revenue: <span className="font-medium">{formatMoney(data[hover].revenue)}</span></p>
            <p className="text-slate-600 dark:text-slate-300">Profit: <span className="font-medium">{formatMoney(data[hover].profit)}</span></p>
            <p className="text-slate-600 dark:text-slate-300">Transactions: <span className="font-medium">{data[hover].transactions}</span></p>
            <p className="text-slate-600 dark:text-slate-300">AOV: <span className="font-medium">{formatMoney(data[hover].aov)}</span></p>
          </div>
        )}

        {chartType === 'bar' ? (
          <div className="flex items-end justify-between gap-1.5 h-48 mt-8">
            {data.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="w-full flex-1 flex items-end relative">
                  <div className="w-full rounded-t-md transition-all group-hover:opacity-80" style={{ height: `${(d[metric] / max) * 100}%`, minHeight: d[metric] > 0 ? '3px' : '0', backgroundColor: active.color }}>
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-slate-600 opacity-0 group-hover:opacity-100 whitespace-nowrap">{formatMoneyShort(d[metric])}</span>
                  </div>
                </div>
                <span className="text-xs text-slate-400 truncate">{d.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 relative mt-4">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={data.map((d, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${100 - (d[metric] / max) * 90}`).join(' ')} fill="none" stroke={active.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              {data.map((d, i) => {
                const x = (i / Math.max(data.length - 1, 1)) * 100;
                const y = 100 - (d[metric] / max) * 90;
                return <circle key={i} cx={x} cy={y} r={hover === i ? 2.5 : 1.5} fill={active.color} vectorEffect="non-scaling-stroke" className="transition-all" />;
              })}
            </svg>
            <div className="absolute inset-0 flex">
              {data.map((d, i) => <div key={i} className="flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />)}
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between pointer-events-none">
              {data.map((d, i) => <span key={i} className="text-xs text-slate-400">{d.label}</span>)}
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

export default SalesChart;