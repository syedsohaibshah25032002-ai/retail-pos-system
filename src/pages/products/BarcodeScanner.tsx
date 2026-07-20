import { useRef, useEffect, useState, useCallback } from 'react';
import { Modal, Button, Badge, Spinner } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  ScanLine,
  Camera,
  Keyboard,
  CheckCircle2,
  XCircle,
  Search,
  Package,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

type ScanResult = {
  status: 'idle' | 'searching' | 'found' | 'not_found' | 'error';
  barcode: string;
  product?: {
    product_id: string;
    variant_id: string;
    name: string;
    brand: string | null;
    category: string | null;
    color: string | null;
    size: string;
    sku: string | null;
    barcode: string;
    selling_price: number;
    purchase_price: number;
    image_url: string | null;
    total_stock: number;
    branch_stock: number;
    is_active: boolean;
  };
  error?: string;
};

type HistoryEntry = {
  barcode: string;
  found: boolean;
  productName?: string;
  timestamp: Date;
};

export function BarcodeScannerModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'camera' | 'scanner'>('scanner');
  const [manualInput, setManualInput] = useState('');
  const [result, setResult] = useState<ScanResult>({ status: 'idle', barcode: '' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // USB scanner: listens for rapid keypresses ending with Enter
  const scannerBufferRef = useRef<string>('');
  const scannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookupBarcode = useCallback(async (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    setResult({ status: 'searching', barcode: cleanCode });
    try {
      // Check product_variants first (most specific), then products
      const { data: variant, error: vErr } = await supabase
        .from('product_variants')
        .select(`
          id, barcode, sku, size,
          products (
            id, name, brand_id, category_id, color, image_url,
            selling_price, purchase_price, is_active, deleted_at,
            brands ( name ),
            categories ( name )
          )
        `)
        .eq('barcode', cleanCode)
        .maybeSingle();

      if (vErr) throw vErr;

      if (variant?.products) {
        const p = Array.isArray(variant.products) ? variant.products[0] : variant.products;
        if (!p || p.deleted_at) {
          setResult({ status: 'not_found', barcode: cleanCode });
          setHistory((h) => [{ barcode: cleanCode, found: false, timestamp: new Date() }, ...h].slice(0, 20));
          return;
        }
        // Fetch stock
        const { data: inv } = await supabase
          .from('inventory')
          .select('quantity, branch_id, branches ( type )')
          .eq('variant_id', variant.id);

        const branchStock = (inv ?? []).filter((i) => (i.branches as any)?.type !== 'warehouse').reduce((s, i) => s + i.quantity, 0);
        const totalStock = (inv ?? []).reduce((s, i) => s + i.quantity, 0);

        const product = {
          product_id: p.id,
          variant_id: variant.id,
          name: p.name,
          brand: (p.brands as any)?.name ?? null,
          category: (p.categories as any)?.name ?? null,
          color: p.color,
          size: variant.size,
          sku: variant.sku,
          barcode: variant.barcode,
          selling_price: Number(p.selling_price) ?? 0,
          purchase_price: Number(p.purchase_price) ?? 0,
          image_url: p.image_url,
          total_stock: totalStock,
          branch_stock: branchStock,
          is_active: p.is_active,
        };
        setResult({ status: 'found', barcode: cleanCode, product });
        setHistory((h) => [{ barcode: cleanCode, found: true, productName: p.name, timestamp: new Date() }, ...h].slice(0, 20));
        return;
      }

      // Check products table directly
      const { data: prod, error: pErr } = await supabase
        .from('products')
        .select('id, name, barcode, color, image_url, selling_price, purchase_price, is_active, deleted_at, brands ( name ), categories ( name )')
        .eq('barcode', cleanCode)
        .is('deleted_at', null)
        .maybeSingle();

      if (pErr) throw pErr;

      if (prod) {
        const product = {
          product_id: prod.id,
          variant_id: '',
          name: prod.name,
          brand: (prod.brands as any)?.name ?? null,
          category: (prod.categories as any)?.name ?? null,
          color: prod.color,
          size: '',
          sku: null,
          barcode: prod.barcode,
          selling_price: Number(prod.selling_price) ?? 0,
          purchase_price: Number(prod.purchase_price) ?? 0,
          image_url: prod.image_url,
          total_stock: 0,
          branch_stock: 0,
          is_active: prod.is_active,
        };
        setResult({ status: 'found', barcode: cleanCode, product });
        setHistory((h) => [{ barcode: cleanCode, found: true, productName: prod.name, timestamp: new Date() }, ...h].slice(0, 20));
        return;
      }

      setResult({ status: 'not_found', barcode: cleanCode });
      setHistory((h) => [{ barcode: cleanCode, found: false, timestamp: new Date() }, ...h].slice(0, 20));
    } catch (err: any) {
      setResult({ status: 'error', barcode: cleanCode, error: err.message ?? 'Lookup failed' });
    }
  }, []);

  // USB scanner listener — detects rapid keystrokes ending with Enter
  useEffect(() => {
    if (mode !== 'scanner') return;
    const handleKey = (e: KeyboardEvent) => {
      // Ignore if typing in the manual input field
      if (document.activeElement === inputRef.current) return;
      if (e.key === 'Enter') {
        if (scannerBufferRef.current.length >= 3) {
          const code = scannerBufferRef.current;
          scannerBufferRef.current = '';
          lookupBarcode(code);
        } else {
          scannerBufferRef.current = '';
        }
        return;
      }
      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
        if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);
        scannerTimerRef.current = setTimeout(() => {
          scannerBufferRef.current = '';
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);
    };
  }, [mode, lookupBarcode]);

  // Camera scanning using BarcodeDetector API
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      detectLoop();
    } catch (err: any) {
      setCameraError(err.message ?? 'Failed to access camera');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const detectLoop = useCallback(async () => {
    if (!cameraActive || !videoRef.current) return;
    const BarcodeDetector = (window as any).BarcodeDetector;
    if (!BarcodeDetector) {
      setCameraError('BarcodeDetector API not supported in this browser. Use the Scanner mode for USB scanners.');
      return;
    }
    const detector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'] });
    const scan = async () => {
      if (!videoRef.current || !streamRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0) {
          const value = codes[0].rawValue;
          if (value) {
            stopCamera();
            lookupBarcode(value);
            return;
          }
        }
      } catch {
        // detection errors are expected between frames
      }
      if (streamRef.current) requestAnimationFrame(scan);
    };
    scan();
  }, [cameraActive, lookupBarcode]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      lookupBarcode(manualInput);
      setManualInput('');
    }
  };

  const reset = () => {
    setResult({ status: 'idle', barcode: '' });
    if (mode === 'scanner') inputRef.current?.focus();
  };

  return (
    <Modal open onClose={onClose} title="Barcode Testing Utility" size="lg">
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { stopCamera(); setMode('scanner'); setResult({ status: 'idle', barcode: '' }); }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            mode === 'scanner'
              ? 'bg-slate-900 text-white dark:bg-emerald-600'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          <Keyboard size={16} /> USB Scanner
        </button>
        <button
          onClick={() => { setMode('camera'); setResult({ status: 'idle', barcode: '' }); }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            mode === 'camera'
              ? 'bg-slate-900 text-white dark:bg-emerald-600'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          <Camera size={16} /> Camera Scan
        </button>
      </div>

      {/* Scanner mode */}
      {mode === 'scanner' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-start gap-2">
            <ScanLine size={18} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm text-emerald-800 dark:text-emerald-300">
              <p className="font-medium">USB Scanner Ready</p>
              <p className="text-xs mt-0.5">Scan any barcode with your USB scanner. It will be detected automatically. You can also type a barcode manually below.</p>
            </div>
          </div>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                ref={inputRef}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type or paste barcode here..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!manualInput.trim()}>Lookup</Button>
          </form>
        </div>
      )}

      {/* Camera mode */}
      {mode === 'camera' && (
        <div className="space-y-4">
          {cameraError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-300">{cameraError}</p>
            </div>
          )}
          <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
            {cameraActive ? (
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            ) : (
              <div className="text-center text-slate-400 py-12">
                <Camera size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Camera is off. Click "Start Camera" to scan.</p>
              </div>
            )}
            {cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2/3 h-1/3 border-2 border-emerald-400 rounded-lg shadow-lg" />
              </div>
            )}
          </div>
          {!cameraActive ? (
            <Button onClick={startCamera} className="w-full"><Camera size={16} className="inline mr-1" /> Start Camera</Button>
          ) : (
            <Button variant="danger" onClick={stopCamera} className="w-full">Stop Camera</Button>
          )}
          <p className="text-xs text-slate-500 text-center">
            Supports CODE128, EAN-13, EAN-8, UPC-A, and Code 39 formats. Point camera at barcode.
          </p>
        </div>
      )}

      {/* Result display */}
      {result.status !== 'idle' && (
        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
          {result.status === 'searching' && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="text-emerald-500" />
              <span className="ml-2 text-sm text-slate-500">Looking up barcode {result.barcode}...</span>
            </div>
          )}

          {result.status === 'found' && result.product && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 size={20} />
                <span className="font-medium text-sm">Product Found</span>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <div className="flex gap-4">
                  {result.product.image_url ? (
                    <img src={result.product.image_url} alt={result.product.name} className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <Package size={24} className="text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{result.product.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.product.brand && <Badge color="blue">{result.product.brand}</Badge>}
                      {result.product.category && <Badge color="violet">{result.product.category}</Badge>}
                      {result.product.size && <Badge color="slate">Size {result.product.size}</Badge>}
                      {result.product.color && <Badge color="orange">{result.product.color}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Barcode</p>
                    <p className="font-mono text-slate-900 dark:text-white">{result.product.barcode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">SKU</p>
                    <p className="font-mono text-slate-900 dark:text-white">{result.product.sku ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Selling Price</p>
                    <p className="font-semibold text-slate-900 dark:text-white">PKR {result.product.selling_price.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Stock</p>
                    <p className={`font-semibold ${result.product.total_stock > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {result.product.total_stock} units
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge color={result.product.is_active ? 'green' : 'red'}>
                    {result.product.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <span className="text-xs text-slate-500">Branch stock: {result.product.branch_stock}</span>
                </div>
              </div>
              <Button variant="secondary" onClick={reset} className="w-full">
                <RotateCcw size={16} className="inline mr-1" /> Scan Another
              </Button>
            </div>
          )}

          {result.status === 'not_found' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <XCircle size={20} />
                <span className="font-medium text-sm">Product Not Found</span>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
                <Package size={40} className="mx-auto text-red-400 mb-2" />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  No product matches barcode
                </p>
                <p className="text-lg font-mono font-bold text-red-600 mt-1">{result.barcode}</p>
                <p className="text-xs text-slate-500 mt-2">
                  This barcode is not in the database. Verify the barcode was generated correctly or add a new product.
                </p>
              </div>
              <Button variant="secondary" onClick={reset} className="w-full">
                <RotateCcw size={16} className="inline mr-1" /> Scan Another
              </Button>
            </div>
          )}

          {result.status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle size={20} />
                <span className="font-medium text-sm">Lookup Error</span>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
              </div>
              <Button variant="secondary" onClick={reset} className="w-full">
                <RotateCcw size={16} className="inline mr-1" /> Try Again
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Scan history */}
      {history.length > 0 && (
        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Scan History ({history.length})</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                <div className="flex items-center gap-2 min-w-0">
                  {h.found ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> : <XCircle size={12} className="text-red-500 shrink-0" />}
                  <span className="font-mono text-slate-600 dark:text-slate-300 truncate">{h.barcode}</span>
                </div>
                <span className="text-slate-400 ml-2 shrink-0">
                  {h.productName ?? 'Not found'} · {h.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
