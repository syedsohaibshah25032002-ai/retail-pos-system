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

import JsBarcode from 'jsbarcode';

export function drawBarcode(canvas: HTMLCanvasElement, code: string, label?: string) {
  if (!code) return;
  try {
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: true,
      text: label ?? code,
      font: 'monospace',
      fontOptions: 'bold',
      fontSize: 12,
      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 4,
      background: '#ffffff',
      lineColor: '#000000',
      margin: 10,
      marginTop: 6,
      marginBottom: 4,
    });
  } catch {
    // If CODE128 fails for any reason, show error text on canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff0000';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Invalid barcode', canvas.width / 2, canvas.height / 2);
    }
  }
}

export function downloadHighResBarcode(code: string, filename: string) {
  const canvas = document.createElement('canvas');
  // 300 DPI: scale up 3x from screen resolution
  canvas.width = 900;
  canvas.height = 300;
  try {
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 6,
      height: 180,
      displayValue: true,
      text: code,
      font: 'monospace',
      fontOptions: 'bold',
      fontSize: 36,
      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 12,
      background: '#ffffff',
      lineColor: '#000000',
      margin: 30,
    });
  } catch { return; }
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
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
