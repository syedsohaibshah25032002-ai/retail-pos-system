import { useRef, useEffect, useState } from 'react';
import { Modal, Button, Select, Input, Badge } from '../../components/ui';
import { drawBarcode, downloadHighResBarcode } from '../../lib/utils';
import { Download, Printer, FileText, CheckCircle2, XCircle, RefreshCw, Check, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';

const LABEL_SIZES = [
  { key: '50x25', w: 50, h: 25, label: '50×25 mm (Small)' },
  { key: '38x25', w: 38, h: 25, label: '38×25 mm (Small)' },
  { key: '60x40', w: 60, h: 40, label: '60×40 mm (Medium)' },
  { key: '100x50', w: 100, h: 50, label: '100×50 mm (Large)' },
  { key: 'custom', w: 60, h: 30, label: 'Custom' },
];

const PRINTER_PRESETS = [
  { key: 'thermal', label: 'Thermal Printer (58mm)', cssWidth: '58mm' },
  { key: 'roll', label: 'Roll Printer (80mm)', cssWidth: '80mm' },
  { key: 'a4', label: 'A4 Sheet (210mm)', cssWidth: '210mm' },
  { key: 'custom', label: 'Custom Size', cssWidth: '100mm' },
];

const MM_TO_PX = 3.7795;

export function BarcodeModal({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [printer, setPrinter] = useState('thermal');

  useEffect(() => {
    if (canvasRef.current && code) {
      drawBarcode(canvasRef.current, code, code);
    }
  }, [code]);

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
    const preset = PRINTER_PRESETS.find((p) => p.key === printer) ?? PRINTER_PRESETS[0];
    const w = window.open('', '', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Barcode ${code}</title><style>
      @page{size:${preset.cssWidth} auto;margin:2mm;}
      body{font-family:Arial,sans-serif;text-align:center;padding:4mm;}
      img{max-width:${preset.cssWidth};height:auto;}
      h3{margin:4px 0;font-size:10px;}
      .code{font-family:monospace;font-size:9px;margin-top:2px;}
    </style></head><body><h3>${name}</h3><img src="${dataUrl}"/><p class="code">${code}</p><script>window.print();window.close();</script></body></html>`);
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
      <div className="mt-4">
        <Select label="Printer" value={printer} onChange={setPrinter} options={PRINTER_PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="secondary" className="flex-1" onClick={print}><Printer size={16} className="inline mr-1" /> Print</Button>
        <Button className="flex-1" onClick={download}><Download size={16} className="inline mr-1" /> PNG (300 DPI)</Button>
      </div>
    </Modal>
  );
}

type LabelItem = { code: string; name: string; size: string; color?: string | null; price?: number | null };

export function BulkBarcodeModal({ items, onClose }: { items: LabelItem[]; onClose: () => void }) {
  const { success } = useToast();
  const [ready, setReady] = useState(false);
  const [labelSize, setLabelSize] = useState('50x25');
  const [customW, setCustomW] = useState('60');
  const [customH, setCustomH] = useState('30');
  const [qtyPerItem, setQtyPerItem] = useState('1');
  const [showPrice, setShowPrice] = useState(true);
  const [printer, setPrinter] = useState('thermal');
  const [progress, setProgress] = useState(0);
  const [action, setAction] = useState<string>('');
  const [verifiedCount, setVerifiedCount] = useState<{ ok: number; bad: number } | null>(null);
  const [regenerated, setRegenerated] = useState<string[]>([]);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);

  const sizeDef = LABEL_SIZES.find((s) => s.key === labelSize) ?? LABEL_SIZES[0];
  const labelW = labelSize === 'custom' ? Number(customW) || 60 : sizeDef.w;
  const labelH = labelSize === 'custom' ? Number(customH) || 30 : sizeDef.h;
  const pxW = Math.round(labelW * MM_TO_PX);
  const pxH = Math.round(labelH * MM_TO_PX);

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
    const preset = PRINTER_PRESETS.find((p) => p.key === printer) ?? PRINTER_PRESETS[0];
    const w = window.open('', '', 'width=800,height=600');
    if (!w) return;
    const labels = expandedItems.map((it, i) => {
      const c = refs.current[i];
      const url = c ? c.toDataURL('image/png') : '';
      return buildLabelHtml(it, url);
    }).join('');
    w.document.write(`<html><head><title>Bulk Barcode Labels</title><style>
      @page{size:${preset.cssWidth} auto;margin:5mm;}
      body{padding:5mm;}
      @media print{.no-print{display:none;}}
    </style></head><body>${labels}<div class="no-print" style="text-align:center;margin-top:10px;"><button onclick="window.print()">Print</button></div><script>setTimeout(()=>window.print(),500);</script></body></html>`);
    w.document.close();
  };

  const downloadAllPng = async () => {
    setAction('Downloading PNGs...');
    for (let i = 0; i < expandedItems.length; i++) {
      const c = refs.current[i];
      if (c && expandedItems[i].code) {
        const url = c.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `barcode-${expandedItems[i].code}-${i + 1}.png`;
        a.click();
        setProgress(Math.round(((i + 1) / expandedItems.length) * 100));
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    setAction('');
    setProgress(0);
    success(`Downloaded ${expandedItems.length} PNGs`);
  };

  const verifySelected = async () => {
    setAction('Verifying barcodes...');
    let ok = 0, bad = 0;
    for (let i = 0; i < items.length; i++) {
      const { data } = await supabase.from('product_variants').select('id').eq('barcode', items[i].code).maybeSingle();
      if (data) ok++; else bad++;
      setProgress(Math.round(((i + 1) / items.length) * 100));
    }
    setVerifiedCount({ ok, bad });
    setAction('');
    setProgress(0);
    success(`${ok} verified, ${bad} not found in database`);
  };

  const regenerateSelected = async () => {
    setAction('Regenerating barcodes...');
    const regen: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const newBc = await supabase.rpc('next_barcode');
      if (newBc.data) {
        const { data: variant } = await supabase.from('product_variants').select('id').eq('barcode', items[i].code).maybeSingle();
        if (variant) {
          await supabase.from('product_variants').update({ barcode: newBc.data }).eq('id', variant.id);
          regen.push(newBc.data);
        }
      }
      setProgress(Math.round(((i + 1) / items.length) * 100));
    }
    setRegenerated(regen);
    setAction('');
    setProgress(0);
    success(`Regenerated ${regen.length} barcodes`);
  };

  return (
    <Modal open onClose={onClose} title={`Bulk Barcode Tools (${expandedItems.length})`} size="lg">
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
        <Select label="Printer" value={printer} onChange={setPrinter} options={PRINTER_PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 pb-2">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
          Show Price
        </label>
      </div>

      {/* Bulk action buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="secondary" size="sm" onClick={regenerateSelected} disabled={!!action}><RefreshCw size={14} className="inline mr-1" /> Regenerate Selected</Button>
        <Button variant="secondary" size="sm" onClick={verifySelected} disabled={!!action}><ShieldCheck size={14} className="inline mr-1" /> Verify Selected</Button>
        <Button variant="secondary" size="sm" onClick={printAll}><Printer size={14} className="inline mr-1" /> Print Selected</Button>
        <Button variant="secondary" size="sm" onClick={printAll}><FileText size={14} className="inline mr-1" /> Export PDF</Button>
        <Button size="sm" onClick={downloadAllPng} disabled={!!action}><Download size={14} className="inline mr-1" /> Download PNGs</Button>
      </div>

      {/* Progress indicator */}
      {action && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-600 dark:text-slate-300">{action}</span>
            <span className="text-slate-500">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Verification results */}
      {verifiedCount && (
        <div className="flex gap-2 mb-4">
          <Badge color="green">{verifiedCount.ok} verified</Badge>
          {verifiedCount.bad > 0 && <Badge color="red">{verifiedCount.bad} not found</Badge>}
        </div>
      )}
      {regenerated.length > 0 && (
        <div className="mb-4 text-xs text-emerald-600">
          <Check size={12} className="inline mr-1" /> {regenerated.length} barcodes regenerated with new sequential codes.
        </div>
      )}

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
      {!ready && <p className="text-xs text-slate-400 mt-2">Rendering barcodes...</p>}
    </Modal>
  );
}
