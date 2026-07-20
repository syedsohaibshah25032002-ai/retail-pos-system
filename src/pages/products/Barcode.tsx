import { useRef, useEffect, useState } from 'react';
import { Modal, Button } from '../../components/ui';
import { drawBarcode } from '../../lib/utils';
import { Download, Printer } from 'lucide-react';

export function BarcodeModal({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 300;
      canvasRef.current.height = 100;
      drawBarcode(canvasRef.current, code, code);
    }
  }, [code]);

  const download = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${code}.png`;
    a.click();
  };

  const print = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const w = window.open('', '', 'width=400,height=300');
    if (!w) return;
    w.document.write(`<html><head><title>Barcode ${code}</title><style>body{font-family:monospace;text-align:center;padding:8px;}img{width:300px;}h3{margin:4px 0;font-size:12px;}</style></head><body><h3>${name}</h3><img src="${dataUrl}"/><script>window.print();window.close();</script></body></html>`);
    w.document.close();
  };

  return (
    <Modal open onClose={onClose} title="Barcode Label" size="sm">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">{name}</p>
        <canvas ref={canvasRef} className="mx-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white" />
        <p className="text-xs text-slate-500 mt-2 font-mono">{code}</p>
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={print}><Printer size={16} className="inline mr-1" /> Print</Button>
        <Button className="flex-1" onClick={download}><Download size={16} className="inline mr-1" /> Download PNG</Button>
      </div>
    </Modal>
  );
}

type LabelItem = { code: string; name: string; size: string };

export function BulkBarcodeModal({ items, onClose }: { items: LabelItem[]; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    items.forEach((it, i) => {
      const c = refs.current[i];
      if (c) {
        c.width = 240;
        c.height = 80;
        drawBarcode(c, it.code, it.code);
      }
    });
    setReady(true);
  }, [items]);

  const printAll = () => {
    const w = window.open('', '', 'width=800,height=600');
    if (!w) return;
    const imgs = items.map((it, i) => {
      const c = refs.current[i];
      const url = c ? c.toDataURL('image/png') : '';
      return `<div style="display:inline-block;width:260px;margin:8px;border:1px dashed #ccc;padding:8px;text-align:center;font-family:monospace;">
        <div style="font-size:11px;font-weight:bold;margin-bottom:2px;">${it.name}</div>
        <div style="font-size:9px;color:#666;">Size: ${it.size}</div>
        <img src="${url}" style="width:240px;"/>
        <div style="font-size:9px;">${it.code}</div>
      </div>`;
    }).join('');
    w.document.write(`<html><head><title>Bulk Barcode Labels</title><style>body{padding:8px;}@media print{.no-print{display:none;}}</style></head><body>${imgs}<div class="no-print"><button onclick="window.print()">Print</button></div><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const downloadPdf = () => {
    // Simple: open print dialog (browser "Save as PDF")
    printAll();
  };

  return (
    <Modal open onClose={onClose} title={`Bulk Barcode Labels (${items.length})`} size="lg">
      <div className="flex gap-2 mb-4">
        <Button variant="secondary" onClick={printAll}><Printer size={16} className="inline mr-1" /> Print All</Button>
        <Button onClick={downloadPdf}><Download size={16} className="inline mr-1" /> Download PDF</Button>
      </div>
      <div className="max-h-96 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((it, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-center bg-white">
            <p className="text-xs font-medium text-slate-900 truncate">{it.name}</p>
            <p className="text-[10px] text-slate-500">Size: {it.size}</p>
            <canvas ref={(el) => { refs.current[i] = el; }} className="mx-auto" />
          </div>
        ))}
      </div>
      {!ready && <p className="text-xs text-slate-400 mt-2">Rendering barcodes…</p>}
    </Modal>
  );
}
