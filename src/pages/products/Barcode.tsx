import { useRef, useEffect, useState } from 'react';
import { Modal, Button, Select, Input } from '../../components/ui';
import { drawBarcode, downloadHighResBarcode } from '../../lib/utils';
import { Download, Printer, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import JsBarcode from 'jsbarcode';

const LABEL_SIZES = [
  { key: '50x25', w: 50, h: 25, label: '50×25 mm' },
  { key: '38x25', w: 38, h: 25, label: '38×25 mm' },
  { key: '100x50', w: 100, h: 50, label: '100×50 mm' },
  { key: 'custom', w: 60, h: 30, label: 'Custom' },
];

// mm to pixels at 96 DPI for screen rendering
const MM_TO_PX = 3.7795;

export function BarcodeModal({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (canvasRef.current && code) {
      drawBarcode(canvasRef.current, code, code);
    }
  }, [code]);

  // Verify the generated barcode matches what's in the database
  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data: pMatch } = await supabase.from('products').select('id').eq('barcode', code).maybeSingle();
      if (pMatch) { setVerified(true); return; }
      const { data: vMatch } = await supabase.from('product_variants').select('id').eq('barcode', code).maybeSingle();
      setVerified(!!vMatch);
    })();
  }, [code]);

  const download = () => downloadHighResBarcode(code, `barcode-${code}.png`);

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
        {verified !== null && (
          <p className={`text-xs mt-1 flex items-center justify-center gap-1 ${verified ? 'text-emerald-600' : 'text-red-600'}`}>
            {verified ? <><CheckCircle2 size={14} /> Barcode verified in database</> : <><XCircle size={14} /> Barcode not found in database</>}
          </p>
        )}
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={print}><Printer size={16} className="inline mr-1" /> Print</Button>
        <Button className="flex-1" onClick={download}><Download size={16} className="inline mr-1" /> Download PNG (300 DPI)</Button>
      </div>
    </Modal>
  );
}

type LabelItem = { code: string; name: string; size: string; color?: string | null; price?: number | null };

export function BulkBarcodeModal({ items, onClose }: { items: LabelItem[]; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [labelSize, setLabelSize] = useState('50x25');
  const [customW, setCustomW] = useState('60');
  const [customH, setCustomH] = useState('30');
  const [qtyPerItem, setQtyPerItem] = useState('1');
  const [showPrice, setShowPrice] = useState(true);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);

  const sizeDef = LABEL_SIZES.find((s) => s.key === labelSize) ?? LABEL_SIZES[0];
  const labelW = labelSize === 'custom' ? Number(customW) || 60 : sizeDef.w;
  const labelH = labelSize === 'custom' ? Number(customH) || 30 : sizeDef.h;
  const pxW = Math.round(labelW * MM_TO_PX);
  const pxH = Math.round(labelH * MM_TO_PX);

  // Expand items by quantity
  const expandedItems = items.flatMap((it) =>
    Array.from({ length: Math.max(1, Number(qtyPerItem) || 1) }, () => it)
  );

  useEffect(() => {
    expandedItems.forEach((it, i) => {
      const c = refs.current[i];
      if (c && it.code) {
        c.width = pxW;
        c.height = pxH;
        drawBarcode(c, it.code, it.code);
      }
    });
    setReady(true);
  }, [expandedItems.length, pxW, pxH]);

  const buildLabelHtml = (it: LabelItem, dataUrl: string) => {
    const priceLine = showPrice && it.price != null ? `<div style="font-size:9px;font-weight:bold;">PKR ${it.price.toFixed(0)}</div>` : '';
    return `<div style="display:inline-block;width:${labelW}mm;height:${labelH}mm;margin:2mm;border:1px dashed #ccc;padding:1mm;text-align:center;font-family:Arial,sans-serif;overflow:hidden;">
      <div style="font-size:7px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name}</div>
      <div style="font-size:6px;color:#666;">${it.size ? 'Sz ' + it.size : ''}${it.color ? ' · ' + it.color : ''}</div>
      <img src="${dataUrl}" style="max-width:${labelW - 4}mm;max-height:${labelH * 0.55}mm;"/>
      ${priceLine}
    </div>`;
  };

  const printAll = () => {
    const w = window.open('', '', 'width=800,height=600');
    if (!w) return;
    const labels = expandedItems.map((it, i) => {
      const c = refs.current[i];
      const url = c ? c.toDataURL('image/png') : '';
      return buildLabelHtml(it, url);
    }).join('');
    w.document.write(`<html><head><title>Bulk Barcode Labels</title><style>@page{size:auto;margin:5mm;}body{padding:5mm;}@media print{.no-print{display:none;}}</style></head><body>${labels}<div class="no-print" style="text-align:center;margin-top:10px;"><button onclick="window.print()">Print</button></div><script>setTimeout(()=>window.print(),500);</script></body></html>`);
    w.document.close();
  };

  const downloadPdf = () => {
    // Browser print dialog -> Save as PDF
    printAll();
  };

  const downloadAllPng = () => {
    expandedItems.forEach((it, i) => {
      const c = refs.current[i];
      if (c && it.code) {
        const url = c.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `barcode-${it.code}-${i + 1}.png`;
        a.click();
      }
    });
  };

  return (
    <Modal open onClose={onClose} title={`Bulk Barcode Labels (${expandedItems.length})`} size="lg">
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <Select
          label="Label Size"
          value={labelSize}
          onChange={setLabelSize}
          options={LABEL_SIZES.map((s) => ({ value: s.key, label: s.label }))}
        />
        {labelSize === 'custom' && (
          <>
            <Input label="Width (mm)" value={customW} onChange={setCustomW} type="number" />
            <Input label="Height (mm)" value={customH} onChange={setCustomH} type="number" />
          </>
        )}
        <Input label="Qty per item" value={qtyPerItem} onChange={setQtyPerItem} type="number" />
        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 pb-2">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
          Show Price
        </label>
      </div>
      <div className="flex gap-2 mb-4">
        <Button variant="secondary" onClick={printAll}><Printer size={16} className="inline mr-1" /> Print All</Button>
        <Button variant="secondary" onClick={downloadPdf}><FileText size={16} className="inline mr-1" /> Download PDF</Button>
        <Button onClick={downloadAllPng}><Download size={16} className="inline mr-1" /> Download PNGs</Button>
      </div>
      <div className="max-h-96 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
        {expandedItems.map((it, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-center bg-white">
            <p className="text-xs font-medium text-slate-900 truncate">{it.name}</p>
            <p className="text-[10px] text-slate-500">{it.size ? 'Sz ' + it.size : ''}{it.color ? ' · ' + it.color : ''}</p>
            {showPrice && it.price != null && <p className="text-[10px] font-bold text-slate-900">PKR {it.price.toFixed(0)}</p>}
            <canvas ref={(el) => { refs.current[i] = el; }} className="mx-auto" />
          </div>
        ))}
      </div>
      {!ready && <p className="text-xs text-slate-400 mt-2">Rendering barcodes…</p>}
    </Modal>
  );
}
