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
      body{font-family:'Courier New',monospace;font-size:12px;color:#000;padding:8px;width:320px;margin:0 auto;}
      *{box-sizing:border-box;}
      .center{text-align:center;}
      .bold{font-weight:bold;}
      .row{display:flex;justify-content:space-between;}
      .dashed{border-top:1px dashed #000;margin:6px 0;padding-top:6px;}
      .muted{color:#444;font-size:10px;}
      table{width:100%;border-collapse:collapse;}
      td{padding:1px 0;vertical-align:top;}
      .r{text-align:right;}
      .logo{width:40px;height:40px;margin:0 auto 4px;border-radius:8px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;font-family:Arial,sans-serif;}
      .store-name{font-size:16px;font-weight:bold;margin:2px 0;}
      .store-info{font-size:10px;color:#444;line-height:1.4;}
      .receipt-no{font-size:11px;font-weight:bold;margin:4px 0;}
      .section-label{font-size:9px;text-transform:uppercase;color:#666;margin-bottom:2px;}
      .thank-you{font-size:13px;font-weight:bold;margin:8px 0 4px;}
      .return-policy{font-size:9px;color:#666;line-height:1.3;margin-top:6px;padding-top:4px;border-top:1px dashed #000;}
    </style></head><body>${printContents}<script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  const dateParts = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).split(',');
  const dateStr = dateParts[0]?.trim() ?? receipt.date;
  const timeStr = dateParts[1]?.trim() ?? '';

  return (
    <Modal open onClose={onClose} title="Sale Completed" size="md">
      <div className="text-center mb-4">
        <div className="inline-flex w-14 h-14 rounded-full bg-emerald-100 items-center justify-center mb-2">
          <CheckCircle2 className="text-emerald-600" size={30} />
        </div>
        <p className="text-slate-500 text-sm">Receipt {receipt.receipt_no}</p>
      </div>

      <div id="pos-receipt-print" className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 font-mono text-sm text-slate-900 dark:text-slate-100">
        {/* Store header */}
        <div className="text-center mb-3">
          <div className="logo" style={{ width: 40, height: 40, margin: '0 auto 4px', borderRadius: 8, background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18, fontFamily: 'Arial,sans-serif' }}>S</div>
          <p className="store-name" style={{ fontSize: 16, fontWeight: 'bold', margin: '2px 0' }}>{receipt.branchName}</p>
          {receipt.branchAddress && <p className="store-info" style={{ fontSize: 10, color: '#444', lineHeight: 1.4 }}>{receipt.branchAddress}</p>}
          {receipt.branchPhone && <p className="store-info" style={{ fontSize: 10, color: '#444' }}>Tel: {receipt.branchPhone}</p>}
          <p className="store-info" style={{ fontSize: 10, color: '#444' }}>www.soleerp.com</p>
        </div>
        <div className="dashed">
          <p className="receipt-no center" style={{ fontSize: 11, fontWeight: 'bold', textAlign: 'center', margin: '4px 0' }}>Receipt: {receipt.receipt_no}</p>
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Date</span><span>{dateStr}</span></div>
          {timeStr && <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Time</span><span>{timeStr}</span></div>}
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Cashier</span><span>{receipt.cashier}</span></div>
          {receipt.customer && <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Customer</span><span>{receipt.customer}</span></div>}
          {receipt.customerMobile && <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Mobile</span><span>{receipt.customerMobile}</span></div>}
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Payment</span><span>{receipt.method}</span></div>
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
            <div className="row"><span>Tax ({receipt.taxRate.toFixed(1)}%)</span><span>{formatMoney(receipt.tax)}</span></div>
          )}
          <div className="row bold text-base"><span>TOTAL</span><span>{formatMoney(receipt.total)}</span></div>
        </div>
        <div className="dashed space-y-1">
          <div className="row"><span>Paid ({receipt.method})</span><span>{formatMoney(receipt.cashGiven || receipt.total)}</span></div>
          {receipt.change > 0 && <div className="row"><span>Change</span><span>{formatMoney(receipt.change)}</span></div>}
          {receipt.cardRef && <div className="row muted"><span>Ref</span><span>{receipt.cardRef}</span></div>}
        </div>
        {receipt.loyaltyEarned > 0 && (
          <p className="text-center text-xs mt-2 text-emerald-600">+{receipt.loyaltyEarned} loyalty points earned</p>
        )}
        <div className="flex justify-center my-3">
          <canvas ref={qrRef} width={96} height={96} className="rounded border border-slate-200 dark:border-slate-700" />
        </div>
        <p className="thank-you center" style={{ fontSize: 13, fontWeight: 'bold', textAlign: 'center', margin: '8px 0 4px' }}>Thank you for shopping with us!</p>
        <div className="return-policy" style={{ fontSize: 9, color: '#666', lineHeight: 1.3, marginTop: 6, paddingTop: 4, borderTop: '1px dashed #000' }}>
          <p className="center" style={{ textAlign: 'center' }}>Return Policy: Items can be exchanged within 7 days with original receipt and packaging. No refunds on sale items.</p>
        </div>
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

function drawQR(canvas: HTMLCanvasElement, text: string, size = 96) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const grid = 21;
  const cell = size / grid;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
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
