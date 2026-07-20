export function formatMoney(n: number): string {
  const value = Math.round((n || 0) * 100) / 100;
  return 'PKR ' + new Intl.NumberFormat('en-PK').format(value);
}

export function formatMoneyShort(n: number): string {
  const v = n || 0;
  if (Math.abs(v) >= 1000000) return 'PKR ' + (v / 1000000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1000) return 'PKR ' + (v / 1000).toFixed(1) + 'K';
  return 'PKR ' + new Intl.NumberFormat('en-PK').format(Math.round(v));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-PK').format(n || 0);
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(d: string | Date): string {
  return new Date(d).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

export function genReceiptNo(prefix = 'R'): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export function genBarcode(): string {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

export function drawBarcode(canvas: HTMLCanvasElement, code: string, label?: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (!code) return;
  // Code128-like visual barcode: deterministic bars from code digits
  const bars: number[] = [];
  for (let i = 0; i < code.length; i++) {
    const d = code.charCodeAt(i);
    bars.push((d % 3) + 1, ((d >> 2) % 3) + 1, ((d >> 4) % 3) + 1, ((d >> 6) % 3) + 1);
  }
  // quiet zone + start
  const barAreaW = W - 8;
  const unit = barAreaW / (bars.reduce((a, b) => a + b, 0) + 4);
  let x = 4;
  ctx.fillStyle = '#000000';
  // start bar
  ctx.fillRect(x, 4, unit * 2, H - (label ? 18 : 8));
  x += unit * 3;
  for (let i = 0; i < bars.length; i++) {
    const w = unit * bars[i];
    if (i % 2 === 0) ctx.fillRect(x, 4, w, H - (label ? 18 : 8));
    x += w + unit;
  }
  // end bar
  ctx.fillRect(x, 4, unit * 2, H - (label ? 18 : 8));
  if (label) {
    ctx.fillStyle = '#000000';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H - 4);
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateRange(period: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);
  let label = period;
  switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      label = 'Today';
      break;
    case 'yesterday':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      label = 'Yesterday';
      break;
    case '7days':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      label = 'Last 7 Days';
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      label = 'This Month';
      break;
    case 'lastmonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      label = 'Last Month';
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      label = 'This Year';
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }
  return { start, end, label };
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
