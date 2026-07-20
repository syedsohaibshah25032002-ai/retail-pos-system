import { useRef, useEffect } from 'react';
import { Printer, CheckCircle2 } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { formatMoney } from '../../lib/utils';

export type ReceiptLine = {
  variant_id: string;
  name: string;
  size: string;
  color: string | null;
  sku: string | null;
  price: number;
  qty: number;
};

export type ReceiptData = {
  receipt_no: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  discountType: string;
  tax: number;
  taxRate: number;
  total: number;
  method: string;
  cashGiven: number;
  change: number;
  cardRef: string | null;
  customer: string | null;
  customerMobile: string | null;
  loyaltyEarned: number;
  cashier: string;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
  date: string;
};

function drawQR(canvas: HTMLCanvasElement, text: string, size = 96) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Simple deterministic visual QR-like pattern (not a real scannable QR, but a unique receipt fingerprint)
  const grid = 21;
  const cell = size / grid;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  // hash text to bits
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
  const bits: boolean[] = [];
  let x = Math.abs(h);
  for (let i = 0; i < grid * grid; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    bits.push((x >> 16) % 2 === 1);
  }
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      // finder patterns corners
      const finder = (r < 7 && c < 7) || (r < 7 && c >= grid - 7) || (r >= grid - 7 && c < 7);
      if (finder) {
        const inR = r < 7 ? r : r - (grid - 7);
        const inC = c < 7 ? c : c - (grid - 7);
        const onBorder = inR === 0 || inR === 6 || inC === 0 || inC === 6;
        const inner = inR >= 2 && inR <= 4 && inC >= 2 && inC <= 4;
        if (onBorder || inner) ctx.fillRect(c * cell, r * cell, cell, cell);
      } else if (bits[r * grid + c]) {
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }
}

export function ReceiptModal({ receipt, onClose }: { receipt: ReceiptData; onClose: () => void }) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (qrRef.current) drawQR(qrRef.current, receipt.receipt_no);
  }, [receipt.receipt_no]);

  const handlePrint = () => {
    const printContents = document.getElementById('pos-receipt-print')?.innerHTML;
    const w = window.open('', '', 'width=380,height=600');
    if (!w || !printContents) { window.print(); return; }
    w.document.write(`<html><head><title>${receipt.receipt_no}</title><style>
      body{font-family:monospace;font-size:12px;color:#000;padding:8px;}
      *{box-sizing:border-box;}
      .center{text-align:center;}
      .bold{font-weight:bold;}
      .row{display:flex;justify-content:space-between;}
      .dashed{border-top:1px dashed #000;margin:6px 0;padding-top:6px;}
      .muted{color:#444;font-size:10px;}
      table{width:100%;border-collapse:collapse;}
      td{padding:1px 0;vertical-align:top;}
      .r{text-align:right;}
    </style></head><body>${printContents}<script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal open onClose={onClose} title="Sale Completed" size="md">
      <div className="text-center mb-4">
        <div className="inline-flex w-14 h-14 rounded-full bg-emerald-100 items-center justify-center mb-2">
          <CheckCircle2 className="text-emerald-600" size={30} />
        </div>
        <p className="text-slate-500 text-sm">Receipt {receipt.receipt_no}</p>
      </div>

      <div id="pos-receipt-print" className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 font-mono text-sm text-slate-900 dark:text-slate-100">
        <div className="text-center mb-3">
          <p className="font-bold text-base">{receipt.branchName}</p>
          {receipt.branchAddress && <p className="text-xs text-slate-500 dark:text-slate-400">{receipt.branchAddress}</p>}
          {receipt.branchPhone && <p className="text-xs text-slate-500 dark:text-slate-400">Tel: {receipt.branchPhone}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400">{receipt.date}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Cashier: {receipt.cashier}</p>
          {receipt.customer && <p className="text-xs text-slate-500 dark:text-slate-400">Customer: {receipt.customer}</p>}
        </div>
        <div className="dashed">
          <table className="w-full">
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {l.color ? `${l.color} · ` : ''}Sz {l.size}{l.sku ? ` · ${l.sku}` : ''}
                    </div>
                    <div className="text-xs">{l.qty} x {formatMoney(l.price)}</div>
                  </td>
                  <td className="r align-top">{formatMoney(l.price * l.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dashed space-y-1">
          <div className="row"><span>Subtotal</span><span>{formatMoney(receipt.subtotal)}</span></div>
          {receipt.discount > 0 && (
            <div className="row"><span>Discount ({receipt.discountType === 'pct' ? '%' : 'fixed'})</span><span>-{formatMoney(receipt.discount)}</span></div>
          )}
          {receipt.tax > 0 && (
            <div className="row"><span>Tax ({receipt.taxRate}%)</span><span>{formatMoney(receipt.tax)}</span></div>
          )}
          <div className="row bold text-base"><span>TOTAL</span><span>{formatMoney(receipt.total)}</span></div>
        </div>
        <div className="dashed space-y-1">
          <div className="row"><span>Paid ({receipt.method})</span><span>{formatMoney(receipt.cashGiven || receipt.total)}</span></div>
          {receipt.change > 0 && <div className="row"><span>Change</span><span>{formatMoney(receipt.change)}</span></div>}
          {receipt.cardRef && <div className="row muted"><span>Card Ref</span><span>{receipt.cardRef}</span></div>}
        </div>
        {receipt.loyaltyEarned > 0 && (
          <p className="text-center text-xs mt-2 text-emerald-600">+{receipt.loyaltyEarned} loyalty points earned</p>
        )}
        <div className="flex justify-center my-3">
          <canvas ref={qrRef} width={96} height={96} className="rounded border border-slate-200 dark:border-slate-700" />
        </div>
        <p className="text-center text-xs mt-2 text-slate-400 dark:text-slate-500">Thank you for shopping with us!</p>
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={handlePrint}>
          <Printer size={16} className="inline mr-1" /> Print
        </Button>
        <Button className="flex-1" onClick={onClose}>New Sale</Button>
      </div>
    </Modal>
  );
}
