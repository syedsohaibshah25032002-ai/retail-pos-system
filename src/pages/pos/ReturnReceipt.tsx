import { useRef, useEffect } from 'react';
import { Printer, CheckCircle2, RotateCcw } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { formatMoney } from '../../lib/utils';

export type ReturnReceiptLine = {
  name: string;
  size: string;
  color: string | null;
  sku: string | null;
  qty: number;
  unit_price: number;
  exchangeName?: string | null;
  exchangeSize?: string | null;
  exchangePrice?: number | null;
};

export type ReturnReceiptData = {
  return_no: string;
  original_receipt_no: string;
  lines: ReturnReceiptLine[];
  refund_amount: number;
  refund_method: string;
  reason: string;
  price_difference: number;
  cashier: string;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
  customer: string | null;
  date: string;
};

export function ReturnReceiptModal({ receipt, onClose }: { receipt: ReturnReceiptData; onClose: () => void }) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (qrRef.current) drawQR(qrRef.current, receipt.return_no);
  }, [receipt.return_no]);

  const handlePrint = () => {
    const printContents = document.getElementById('return-receipt-print')?.innerHTML;
    const w = window.open('', '', 'width=380,height=600');
    if (!w || !printContents) { window.print(); return; }
    w.document.write(`<html><head><title>${receipt.return_no}</title><style>
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
      .thank-you{font-size:13px;font-weight:bold;margin:8px 0 4px;}
      .return-policy{font-size:9px;color:#666;line-height:1.3;margin-top:6px;padding-top:4px;border-top:1px dashed #000;}
      .refund{background:#f0fdf4;padding:6px;border-radius:4px;margin:4px 0;}
    </style></head><body>${printContents}<script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  const dateParts = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).split(',');
  const dateStr = dateParts[0]?.trim() ?? receipt.date;
  const timeStr = dateParts[1]?.trim() ?? '';

  return (
    <Modal open onClose={onClose} title="Return Processed" size="md">
      <div className="text-center mb-4">
        <div className="inline-flex w-14 h-14 rounded-full bg-amber-100 items-center justify-center mb-2">
          <RotateCcw className="text-amber-600" size={30} />
        </div>
        <p className="text-slate-500 text-sm">Return {receipt.return_no}</p>
      </div>

      <div id="return-receipt-print" className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 font-mono text-sm text-slate-900 dark:text-slate-100">
        <div className="text-center mb-3">
          <div className="logo" style={{ width: 40, height: 40, margin: '0 auto 4px', borderRadius: 8, background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18, fontFamily: 'Arial,sans-serif' }}>S</div>
          <p className="store-name" style={{ fontSize: 16, fontWeight: 'bold', margin: '2px 0' }}>{receipt.branchName}</p>
          {receipt.branchAddress && <p className="store-info" style={{ fontSize: 10, color: '#444', lineHeight: 1.4 }}>{receipt.branchAddress}</p>}
          {receipt.branchPhone && <p className="store-info" style={{ fontSize: 10, color: '#444' }}>Tel: {receipt.branchPhone}</p>}
          <p className="store-info" style={{ fontSize: 10, color: '#444' }}>www.soleerp.com</p>
        </div>
        <div className="dashed">
          <p className="receipt-no center" style={{ fontSize: 11, fontWeight: 'bold', textAlign: 'center', margin: '4px 0' }}>RETURN RECEIPT</p>
          <p className="receipt-no center" style={{ fontSize: 11, fontWeight: 'bold', textAlign: 'center', margin: '4px 0' }}>{receipt.return_no}</p>
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Original Inv</span><span>{receipt.original_receipt_no}</span></div>
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Date</span><span>{dateStr}</span></div>
          {timeStr && <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Time</span><span>{timeStr}</span></div>}
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Cashier</span><span>{receipt.cashier}</span></div>
          {receipt.customer && <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Customer</span><span>{receipt.customer}</span></div>}
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Reason</span><span>{receipt.reason}</span></div>
        </div>
        <div className="dashed">
          <p className="bold" style={{ fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>Returned Items</p>
          <table className="w-full">
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400" style={{ fontSize: 10, color: '#444' }}>
                      {l.color ? `${l.color} · ` : ''}Sz {l.size}{l.sku ? ` · ${l.sku}` : ''}
                    </div>
                    <div className="text-xs" style={{ fontSize: 10 }}>{l.qty} x {formatMoney(l.unit_price)}</div>
                    {l.exchangeName && (
                      <div className="text-xs" style={{ fontSize: 10, color: '#0f766e', marginTop: 2 }}>
                        Exchange → {l.exchangeName} (Sz {l.exchangeSize}) @ {formatMoney(l.exchangePrice ?? 0)}
                      </div>
                    )}
                  </td>
                  <td className="r align-top" style={{ textAlign: 'right', verticalAlign: 'top' }}>{formatMoney(l.qty * l.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dashed space-y-1">
          {receipt.price_difference > 0 && (
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Price Difference Due</span><span className="bold" style={{ fontWeight: 'bold' }}>{formatMoney(receipt.price_difference)}</span></div>
          )}
          {receipt.price_difference < 0 && (
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Refund to Customer</span><span className="bold" style={{ fontWeight: 'bold' }}>{formatMoney(-receipt.price_difference)}</span></div>
          )}
          {receipt.price_difference === 0 && (
            <div className="row bold" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>Refund Amount</span><span>{formatMoney(receipt.refund_amount)}</span></div>
          )}
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted" style={{ fontSize: 10, color: '#444' }}>Refund Method</span><span className="bold" style={{ fontWeight: 'bold' }}>{receipt.refund_method}</span></div>
        </div>
        <div className="flex justify-center my-3">
          <canvas ref={qrRef} width={96} height={96} className="rounded border border-slate-200 dark:border-slate-700" />
        </div>
        <p className="thank-you center" style={{ fontSize: 13, fontWeight: 'bold', textAlign: 'center', margin: '8px 0 4px' }}>Return processed successfully</p>
        <div className="return-policy" style={{ fontSize: 9, color: '#666', lineHeight: 1.3, marginTop: 6, paddingTop: 4, borderTop: '1px dashed #000' }}>
          <p className="center" style={{ textAlign: 'center' }}>Items must be in original condition. Exchange within 7 days with receipt.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={handlePrint}>
          <Printer size={16} className="inline mr-1" /> Print Return Receipt
        </Button>
        <Button className="flex-1" onClick={onClose}>Done</Button>
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
