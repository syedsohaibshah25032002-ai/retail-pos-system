import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  PageContainer,
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Modal,
  Badge,
  Spinner,
  EmptyState,
  Tabs,
  Tooltip,
} from '../components/ui';
import { formatMoney, genBarcode, genBarcodeFromDB, genSKUFromDB, buildReadableSKU, compressImage, debounce } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { Plus, Search, Package, CreditCard as Edit2, Trash2, Barcode, Layers, Image as ImageIcon, Download, Upload, RefreshCw, LayoutGrid, List, Camera, CheckCircle2, XCircle, AlertTriangle, FileImage } from 'lucide-react';
import { BarcodeModal, BulkBarcodeModal } from './products/Barcode';
import { BarcodeScannerModal } from './products/BarcodeScanner';
import { ScanLine } from 'lucide-react';

type Row = {
  product_id: string;
  name: string;
  brand: string | null;
  brand_id: string | null;
  category: string | null;
  category_id: string | null;
  gender: string | null;
  color: string | null;
  season: string | null;
  style: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  barcode: string | null;
  image_url: string | null;
  variant_id: string;
  size: string;
  variant_barcode: string | null;
  sku: string | null;
  total_stock: number;
  branch_stock: number;
  warehouse_stock: number;
  low_stock_threshold: number;
  reserved: number;
};

const SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
const GENDERS = ['Men', 'Women', 'Kids', 'Unisex'];

type ProductRow = {
  id: string;
  name: string;
  brand_id: string | null;
  category_id: string | null;
  gender: string | null;
  season: string | null;
  style: string | null;
  color: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  barcode: string | null;
  image_url: string | null;
  brands: { name: string }[] | null;
  categories: { name: string }[] | null;
};

type VariantRow = { id: string; product_id: string; size: string; barcode: string | null; sku: string | null };

export function Products() {
  const { success, error } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [barcodeItem, setBarcodeItem] = useState<{ code: string; name: string } | null>(null);
  const [bulkItems, setBulkItems] = useState<{ code: string; name: string; size: string }[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const fileImportRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b, c, brs, sup] = await Promise.all([
        supabase
          .from('products')
          .select('id,name,brand_id,category_id,gender,season,style,color,purchase_price,selling_price,tax_rate,barcode,image_url,brands(name),categories(name)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase.from('brands').select('id,name').order('name'),
        supabase.from('categories').select('id,name').order('name'),
        supabase.from('branches').select('id,name,type').order('type').order('name'),
        supabase.from('suppliers').select('id,name').order('name'),
      ]);
      setBrands(b.data ?? []);
      setCategories(c.data ?? []);
      setBranches(brs.data ?? []);
      setSuppliers(sup.data ?? []);
      const products = (p.data ?? []) as ProductRow[];
      const productIds = products.map((pr) => pr.id);
      if (productIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const [{ data: variants }, { data: inv }] = await Promise.all([
        supabase.from('product_variants').select('id,product_id,size,barcode,sku').in('product_id', productIds).order('size'),
        supabase.from('inventory').select('variant_id,branch_id,quantity,low_stock_threshold'),
      ]);
      const vByProduct = new Map<string, VariantRow[]>();
      (variants ?? []).forEach((v) => {
        const arr = vByProduct.get(v.product_id) ?? [];
        arr.push(v);
        vByProduct.set(v.product_id, arr);
      });
      const warehouseIds = new Set((brs.data ?? []).filter((x) => x.type === 'warehouse').map((x) => x.id));
      const invByVariant = new Map<string, { total: number; branch: number; warehouse: number; low: number }>();
      (inv ?? []).forEach((i) => {
        const cur = invByVariant.get(i.variant_id) ?? { total: 0, branch: 0, warehouse: 0, low: i.low_stock_threshold };
        cur.total += i.quantity;
        if (warehouseIds.has(i.branch_id)) cur.warehouse += i.quantity;
        else cur.branch += i.quantity;
        cur.low = Math.max(cur.low, i.low_stock_threshold);
        invByVariant.set(i.variant_id, cur);
      });
      const flat: Row[] = [];
      products.forEach((pr) => {
        const vs = vByProduct.get(pr.id) ?? [];
        if (vs.length === 0) {
          flat.push(rowFrom(pr, '', '', null, null, 0, 0, 0, 0, 0));
        } else {
          vs.forEach((v) => {
            const st = invByVariant.get(v.id) ?? { total: 0, branch: 0, warehouse: 0, low: 5 };
            flat.push(rowFrom(pr, v.id, v.size, v.barcode, v.sku, st.total, st.branch, st.warehouse, st.low, 0));
          });
        }
      });
      setRows(flat);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.brand?.toLowerCase().includes(q) ||
      r.category?.toLowerCase().includes(q) ||
      r.color?.toLowerCase().includes(q) ||
      r.size.toLowerCase().includes(q) ||
      r.barcode?.includes(q) ||
      r.variant_barcode?.includes(q) ||
      r.sku?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const del = async (r: Row) => {
    if (!confirm(`Delete ${r.name}${r.size ? ' (size ' + r.size + ')' : ''}? This will soft-delete the product and hide it from POS. All variants, inventory, barcodes, and price history will be removed.`)) return;
    try {
      await supabase.from('products').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', r.product_id);
      await supabase.from('price_history').delete().eq('product_id', r.product_id);
      await supabase.from('product_images').delete().eq('product_id', r.product_id);
      await supabase.from('product_variants').delete().eq('product_id', r.product_id);
      await supabase.rpc('cleanup_orphaned_brands');
      await supabase.rpc('cleanup_orphaned_categories');
      success('Product deleted and hidden from POS');
      await logAudit('deleted_product', 'products', r.product_id, { name: r.name, size: r.size });
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Brand', 'Category', 'Gender', 'Color', 'Size', 'SKU', 'Barcode', 'Cost', 'Price', 'Tax%', 'Total Stock', 'Branch Stock', 'Warehouse Stock', 'Status'];
    const rows = filtered.map((r) => [
      r.name, r.brand ?? '', r.category ?? '', r.gender ?? '', r.color ?? '', r.size, r.sku ?? '', r.variant_barcode ?? r.barcode ?? '',
      r.purchase_price, r.selling_price, r.tax_rate, r.total_stock, r.branch_stock, r.warehouse_stock,
      r.total_stock <= 0 ? 'Out' : r.total_stock <= r.low_stock_threshold ? 'Low' : 'OK',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Exported ${rows.length} products`);
  };

  const importCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) { error('CSV must have a header row and at least one data row'); return; }
    const parseLine = (line: string): string[] => {
      const cells: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { cells.push(cur); cur = ''; }
        else { cur += ch; }
      }
      cells.push(cur);
      return cells.map((c) => c.trim());
    };
    const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
    const idx = (name: string) => headers.findIndex((h) => h.includes(name));
    let imported = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      const pName = cols[idx('name')] ?? '';
      if (!pName) { skipped++; continue; }
      const barcode = cols[idx('barcode')] ?? '';
      if (barcode) {
        const { data: existing } = await supabase.from('product_variants').select('id').eq('barcode', barcode).maybeSingle();
        if (existing) { skipped++; continue; }
      }
      const brandName = cols[idx('brand')] ?? '';
      const catName = cols[idx('category')] ?? '';
      let brandId: string | null = null;
      let catId: string | null = null;
      if (brandName) {
        const { data: b } = await supabase.from('brands').select('id').eq('name', brandName).maybeSingle();
        if (b) brandId = b.id;
        else { const { data: nb } = await supabase.from('brands').insert({ name: brandName }).select().single(); brandId = nb?.id ?? null; }
      }
      if (catName) {
        const { data: c } = await supabase.from('categories').select('id').eq('name', catName).maybeSingle();
        if (c) catId = c.id;
        else { const { data: nc } = await supabase.from('categories').insert({ name: catName }).select().single(); catId = nc?.id ?? null; }
      }
      const finalBarcode = barcode || await genBarcodeFromDB();
      const finalSku = cols[idx('sku')] || await genSKUFromDB(pName);
      const size = cols[idx('size')] || 'OS';
      const { data: prod } = await supabase.from('products').insert({
        name: pName, brand_id: brandId, category_id: catId,
        purchase_price: Number(cols[idx('cost')]) || 0,
        selling_price: Number(cols[idx('price')]) || 0,
        tax_rate: Number(cols[idx('tax')]) || 0,
        barcode: finalBarcode, is_active: true,
      }).select().single();
      if (prod) {
        await supabase.from('product_variants').insert({ product_id: prod.id, size, barcode: finalBarcode, sku: finalSku });
        imported++;
      }
    }
    success(`Imported ${imported} products, skipped ${skipped} duplicates`);
    await load();
  };

  const delBrand = async (id: string, name: string) => {
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('brand_id', id).is('deleted_at', null);
    if (count && count > 0) { error(`Cannot delete "${name}" — ${count} product(s) still use this brand.`); return; }
    if (!confirm(`Delete brand "${name}"?`)) return;
    const { error: e } = await supabase.from('brands').delete().eq('id', id);
    if (e) { error(e.message); return; }
    success('Brand deleted'); await load();
  };

  const delCat = async (id: string, name: string) => {
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id).is('deleted_at', null);
    if (count && count > 0) { error(`Cannot delete "${name}" — ${count} product(s) still use this category.`); return; }
    if (!confirm(`Delete category "${name}"?`)) return;
    const { error: e } = await supabase.from('categories').delete().eq('id', id);
    if (e) { error(e.message); return; }
    success('Category deleted'); await load();
  };

  const printBulk = () => {
    const items = filtered
      .filter((r) => r.variant_barcode)
      .map((r) => ({ code: r.variant_barcode!, name: r.name, size: r.size, color: r.color, price: r.selling_price }));
    if (items.length === 0) { error('No barcodes available to print'); return; }
    setBulkItems(items);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Products"
        subtitle="Inventory matrix with barcodes, stock levels, and POS sync"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setShowScanner(true)}><ScanLine size={16} className="inline mr-1" /> Test Barcode</Button>
            <Button variant="secondary" onClick={printBulk}><Layers size={16} className="inline mr-1" /> Bulk Barcodes</Button>
            <Button variant="secondary" onClick={exportCSV}><Download size={16} className="inline mr-1" /> Export CSV</Button>
            <Button variant="secondary" onClick={() => fileImportRef.current?.click()}><Upload size={16} className="inline mr-1" /> Import CSV</Button>
            <input ref={fileImportRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ''; }} />
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              <button onClick={() => setViewMode('table')} className={`px-2.5 py-2 ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}><List size={16} /></button>
              <button onClick={() => setViewMode('grid')} className={`px-2.5 py-2 ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}><LayoutGrid size={16} /></button>
            </div>
            <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} className="inline mr-1" /> New Product</Button>
          </div>
        }
      />
      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, brand, category, color, size, SKU, or barcode..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </Card>
      {loading ? (
        <Card className="p-8">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState message="No products yet. Click 'New Product' to add your first item." /></Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((r, i) => {
            const out = r.total_stock <= 0;
            const low = r.total_stock > 0 && r.total_stock <= r.low_stock_threshold;
            return (
              <Card key={i} className="p-4 hover:shadow-lg transition-shadow group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {r.variant_barcode && (
                      <Tooltip label="View barcode">
                        <button onClick={() => setBarcodeItem({ code: r.variant_barcode!, name: r.name })} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded">
                          <Barcode size={15} />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip label="Edit">
                      <button onClick={() => { setEditing(r); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                        <Edit2 size={15} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Delete">
                      <button onClick={() => del(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">
                        <Trash2 size={15} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{r.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.brand ?? 'No brand'} · {r.category ?? 'No category'}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge color="slate">Sz {r.size}</Badge>
                  {r.color && <Badge color="orange">{r.color}</Badge>}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-1">SKU: {r.sku ?? '-'}</p>
                <p className="text-[10px] text-slate-400 font-mono">BC: {r.variant_barcode ?? r.barcode ?? '-'}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="font-bold text-slate-900 dark:text-white">{formatMoney(r.selling_price)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Stock: {r.total_stock}</span>
                    {out ? <Badge color="red">Out</Badge> : low ? <Badge color="amber">Low</Badge> : <Badge color="green">OK</Badge>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Product</th>
                  <th className="text-left px-4 py-3 font-medium">Brand</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Color</th>
                  <th className="text-left px-4 py-3 font-medium">Size</th>
                  <th className="text-left px-4 py-3 font-medium">SKU</th>
                  <th className="text-left px-4 py-3 font-medium">Barcode</th>
                  <th className="text-right px-4 py-3 font-medium">Cost</th>
                  <th className="text-right px-4 py-3 font-medium">Price</th>
                  <th className="text-right px-4 py-3 font-medium">Margin</th>
                  <th className="text-right px-4 py-3 font-medium">Branch</th>
                  <th className="text-right px-4 py-3 font-medium">Warehouse</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((r, i) => {
                  const out = r.total_stock <= 0;
                  const low = r.total_stock > 0 && r.total_stock <= r.low_stock_threshold;
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.image_url ? (
                            <img src={r.image_url} alt={r.name} className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                              <ImageIcon size={14} className="text-slate-400" />
                            </div>
                          )}
                          <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.brand ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.category ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.color ?? '-'}</td>
                      <td className="px-4 py-3">{r.size ? <Badge color="slate">{r.size}</Badge> : '-'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.sku ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.variant_barcode ?? r.barcode ?? '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatMoney(r.purchase_price)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">{formatMoney(r.selling_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{formatMoney(r.selling_price - r.purchase_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.branch_stock}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.warehouse_stock}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{r.total_stock}</td>
                      <td className="px-4 py-3 text-center">
                        {out ? <Badge color="red">Out</Badge> : low ? <Badge color="amber">Low</Badge> : <Badge color="green">OK</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {r.variant_barcode && (
                            <button onClick={() => setBarcodeItem({ code: r.variant_barcode!, name: r.name })} title="View Barcode" className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors">
                              <Barcode size={15} />
                            </button>
                          )}
                          <button onClick={() => { setEditing(r); setShowForm(true); }} title="Edit" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => del(r)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <ProductForm
          editing={editing}
          brands={brands}
          categories={categories}
          branches={branches}
          suppliers={suppliers}
          onDeleteBrand={delBrand}
          onDeleteCategory={delCat}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); success('Product saved'); }}
        />
      )}
      {barcodeItem && <BarcodeModal code={barcodeItem.code} name={barcodeItem.name} onClose={() => setBarcodeItem(null)} />}
      {bulkItems.length > 0 && <BulkBarcodeModal items={bulkItems} onClose={() => setBulkItems([])} />}
      {showScanner && <BarcodeScannerModal onClose={() => setShowScanner(false)} />}
    </PageContainer>
  );
}

function rowFrom(pr: ProductRow, vid: string, size: string, vbar: string | null, sku: string | null, total: number, branch: number, warehouse: number, low: number, reserved: number): Row {
  return {
    product_id: pr.id,
    name: pr.name,
    brand: pr.brands?.[0]?.name ?? null,
    brand_id: pr.brand_id,
    category: pr.categories?.[0]?.name ?? null,
    category_id: pr.category_id,
    gender: pr.gender,
    color: pr.color,
    season: pr.season,
    style: pr.style,
    purchase_price: Number(pr.purchase_price),
    selling_price: Number(pr.selling_price),
    tax_rate: Number(pr.tax_rate ?? 0),
    barcode: pr.barcode,
    image_url: pr.image_url,
    variant_id: vid,
    size,
    variant_barcode: vbar,
    sku,
    total_stock: total,
    branch_stock: branch,
    warehouse_stock: warehouse,
    low_stock_threshold: low,
    reserved,
  };
}

function ProductForm({
  editing,
  brands,
  categories,
  branches,
  suppliers,
  onDeleteBrand,
  onDeleteCategory,
  onClose,
  onSaved,
}: {
  editing: Row | null;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; type: string }[];
  suppliers: { id: string; name: string }[];
  onDeleteBrand: (id: string, name: string) => void;
  onDeleteCategory: (id: string, name: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { error } = useToast();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [name, setName] = useState(editing?.name ?? '');
  const [brandId, setBrandId] = useState(editing?.brand_id ?? '');
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? '');
  const [gender, setGender] = useState(editing?.gender ?? '');
  const [color, setColor] = useState(editing?.color ?? '');
  const [season, setSeason] = useState(editing?.season ?? '');
  const [style, setStyle] = useState(editing?.style ?? '');
  const [purchase, setPurchase] = useState(editing ? String(editing.purchase_price) : '');
  const [selling, setSelling] = useState(editing ? String(editing.selling_price) : '');
  const [tax, setTax] = useState(editing ? String(editing.tax_rate) : '0');
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [sizes, setSizes] = useState<string[]>(editing?.size ? [editing.size] : ['40']);
  const [stockQty, setStockQty] = useState('0');
  const [perSizeStock, setPerSizeStock] = useState<Record<string, string>>({});
  const [branchId, setBranchId] = useState(profile?.branch_id ?? '');
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [minStock, setMinStock] = useState('3');
  const [maxStock, setMaxStock] = useState('100');
  const [barcode, setBarcode] = useState(editing?.variant_barcode ?? editing?.barcode ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [saving, setSaving] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newCat, setNewCat] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'checking' | 'unique' | 'duplicate'>('idle');
  const [barcodeDuplicateName, setBarcodeDuplicateName] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const warehouseBranches = branches.filter((b) => b.type === 'warehouse');
  const shopBranches = branches.filter((b) => b.type !== 'warehouse');

  const toggleSize = (s: string) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const genNewBarcode = async () => {
    try { setBarcode(await genBarcodeFromDB()); setBarcodeStatus('unique'); } catch { /* ignore */ }
  };

  const genNewSKU = async () => {
    try {
      const brandName = brands.find((b) => b.id === brandId)?.name ?? newBrand;
      setSku(await buildReadableSKU(brandName || null, color || null, sizes[0] || null, name || null));
    } catch { try { setSku(await genSKUFromDB(name || 'PRD')); } catch { /* ignore */ } }
  };

  // Live barcode duplicate detection (debounced)
  const checkBarcode = useCallback(
    debounce(async (code: string) => {
      if (!code || code.length < 4) { setBarcodeStatus('idle'); return; }
      setBarcodeStatus('checking');
      const { data: existingP } = await supabase
        .from('products')
        .select('id, name')
        .eq('barcode', code)
        .is('deleted_at', null)
        .maybeSingle();
      if (existingP && existingP.id !== (editing?.product_id ?? '')) {
        setBarcodeStatus('duplicate');
        setBarcodeDuplicateName(existingP.name);
        return;
      }
      const { data: existingV } = await supabase
        .from('product_variants')
        .select('id, product_id, products(name)')
        .eq('barcode', code)
        .maybeSingle();
      if (existingV && existingV.id !== (editing?.variant_id ?? '')) {
        setBarcodeStatus('duplicate');
        setBarcodeDuplicateName((existingV as any).products?.name ?? 'another variant');
        return;
      }
      setBarcodeStatus('unique');
      setBarcodeDuplicateName(null);
    }, 400),
    [editing, brands]
  );

  useEffect(() => {
    if (barcode) checkBarcode(barcode);
    else setBarcodeStatus('idle');
  }, [barcode]);

  // Auto-generate readable SKU when brand, color, or size changes (only for new products)
  useEffect(() => {
    if (!editing && (brandId || color || sizes.length > 0) && !sku) {
      genNewSKU();
    }
  }, [brandId, color, sizes, sku, editing]);

  // Auto-save draft to localStorage
  useEffect(() => {
    const draft = { name, brandId, categoryId, gender, color, season, style, purchase, selling, tax, barcode, sku, sizes, stockQty, branchId, supplierId };
    localStorage.setItem('product-form-draft', JSON.stringify(draft));
  }, [name, brandId, categoryId, gender, color, season, style, purchase, selling, tax, barcode, sku, sizes, stockQty, branchId, supplierId]);

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const compressed = await compressImage(file, 600, 0.8);
      setImageUrl(compressed);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    else if (name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (!brandId && !newBrand.trim()) e.brand = 'Brand is required — select one or type a new name';
    if (!categoryId && !newCat.trim()) e.category = 'Category is required — select one or type a new name';
    if (!editing && sizes.length === 0) e.sizes = 'Select at least one size';
    if (purchase && Number(purchase) < 0) e.purchase = 'Cost cannot be negative';
    if (selling && Number(selling) < 0) e.selling = 'Price cannot be negative';
    if (!editing && !branchId) e.branch = 'Select a branch for stock location';
    if (barcodeStatus === 'duplicate') e.barcode = `Barcode already in use by "${barcodeDuplicateName}"`;
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let finalBarcode = barcode;
      if (!finalBarcode) {
        finalBarcode = await genBarcodeFromDB();
      } else {
        const { data: existingP } = await supabase
          .from('products')
          .select('id, name')
          .eq('barcode', finalBarcode)
          .is('deleted_at', null)
          .maybeSingle();
        if (existingP && existingP.id !== (editing?.product_id ?? '')) {
          throw new Error(`Barcode ${finalBarcode} is already assigned to "${existingP.name}". Generate a new barcode.`);
        }
        const { data: existingV } = await supabase
          .from('product_variants')
          .select('id, product_id')
          .eq('barcode', finalBarcode)
          .maybeSingle();
        if (existingV && existingV.id !== (editing?.variant_id ?? '')) {
          throw new Error(`Barcode ${finalBarcode} is already assigned to another variant. Generate a new barcode.`);
        }
      }
      let finalSku = sku;
      if (!finalSku) {
        const brandName = brands.find((b) => b.id === brandId)?.name ?? newBrand;
        try { finalSku = await buildReadableSKU(brandName || null, color || null, sizes[0] || null, name); }
        catch { finalSku = await genSKUFromDB(name); }
      } else {
        const { data: existingSku } = await supabase
          .from('product_variants')
          .select('id')
          .eq('sku', finalSku)
          .maybeSingle();
        if (existingSku && existingSku.id !== (editing?.variant_id ?? '')) {
          // Auto-regenerate if duplicate
          const brandName = brands.find((b) => b.id === brandId)?.name ?? newBrand;
          try { finalSku = await buildReadableSKU(brandName || null, color || null, sizes[0] || null, name); }
          catch { finalSku = await genSKUFromDB(name); }
        }
      }

      let bId = brandId;
      let cId = categoryId;
      if (newBrand.trim()) {
        const { data, error: be } = await supabase.from('brands').insert({ name: newBrand.trim() }).select().single();
        if (be) throw be;
        bId = data?.id ?? '';
      }
      if (newCat.trim()) {
        const { data, error: ce } = await supabase.from('categories').insert({ name: newCat.trim() }).select().single();
        if (ce) throw ce;
        cId = data?.id ?? '';
      }
      const payload = {
        name: name.trim(),
        brand_id: bId || null,
        category_id: cId || null,
        supplier_id: supplierId || null,
        gender: gender || null,
        color: color || null,
        season: season || null,
        style: style || null,
        purchase_price: Number(purchase) || 0,
        selling_price: Number(selling) || 0,
        tax_rate: Number(tax) || 0,
        barcode: finalBarcode,
        image_url: imageUrl || null,
        min_stock: Number(minStock) || 0,
        max_stock: Number(maxStock) || 0,
        reorder_level: Number(reorderLevel) || 5,
        is_active: true,
      };
      let productId = editing?.product_id ?? '';
      if (editing) {
        const { error: ue } = await supabase.from('products').update(payload).eq('id', productId);
        if (ue) throw ue;
      } else {
        const { data, error: ie } = await supabase.from('products').insert(payload).select().single();
        if (ie) throw ie;
        productId = data?.id ?? '';
      }
      if (!productId) throw new Error('Failed to create product');

      const qty = Number(stockQty) || 0;
      const low = Number(reorderLevel) || 5;
      const min = Number(minStock) || 3;
      const effectiveLow = Math.min(low, min);

      await supabase.from('price_history').insert({
        product_id: productId,
        purchase_price: Number(purchase) || 0,
        selling_price: Number(selling) || 0,
        changed_by: profile?.id ?? null,
      });

      if (editing?.variant_id) {
        const { error: ve } = await supabase
          .from('product_variants')
          .update({ size: sizes[0] ?? editing.size, barcode: finalBarcode, sku: finalSku })
          .eq('id', editing.variant_id);
        if (ve) throw ve;
        const qty = Number(perSizeStock[sizes[0] ?? editing.size] ?? stockQty) || 0;
        if (branchId && qty > 0) {
          const { data: exInv } = await supabase.from('inventory').select('id,quantity').eq('branch_id', branchId).eq('variant_id', editing.variant_id).maybeSingle();
          if (exInv) {
            const newQty = exInv.quantity + qty;
            await supabase.from('inventory').update({ quantity: newQty, low_stock_threshold: effectiveLow }).eq('id', exInv.id);
            await supabase.from('inventory_movements').insert({ variant_id: editing.variant_id, branch_id: branchId, movement_type: 'manual', quantity_change: qty, quantity_after: newQty, note: 'Stock adjustment on edit', created_by: profile?.id ?? null });
          } else {
            await supabase.from('inventory').insert({ branch_id: branchId, variant_id: editing.variant_id, quantity: qty, low_stock_threshold: effectiveLow });
            await supabase.from('inventory_movements').insert({ variant_id: editing.variant_id, branch_id: branchId, movement_type: 'opening', quantity_change: qty, quantity_after: qty, note: 'Opening stock on edit', created_by: profile?.id ?? null });
          }
        }
      } else {
        const variantRows: { product_id: string; size: string; barcode: string; sku: string }[] = [];
        for (const s of sizes) {
          const vBarcode = await genBarcodeFromDB();
          const vBrandName = brands.find((b) => b.id === brandId)?.name ?? newBrand;
          let vSku: string;
          try { vSku = await buildReadableSKU(vBrandName || null, color || null, s, name); }
          catch { vSku = await genSKUFromDB(name); }
          variantRows.push({ product_id: productId, size: s, barcode: vBarcode, sku: vSku });
        }
        const { data: newVariants, error: ve } = await supabase.from('product_variants').insert(variantRows).select('id,size');
        if (ve) throw ve;
        const invRows: { branch_id: string; variant_id: string; quantity: number; low_stock_threshold: number }[] = [];
        const movRows: { variant_id: string; branch_id: string; movement_type: string; quantity_change: number; quantity_after: number; note: string; created_by: string | null }[] = [];
        (newVariants ?? []).forEach((v) => {
          const vQty = Number(perSizeStock[v.size] ?? stockQty) || 0;
          if (branchId && vQty >= 0) {
            invRows.push({ branch_id: branchId, variant_id: v.id, quantity: vQty, low_stock_threshold: effectiveLow });
            movRows.push({ variant_id: v.id, branch_id: branchId, movement_type: 'opening', quantity_change: vQty, quantity_after: vQty, note: 'Opening stock', created_by: profile?.id ?? null });
          }
          if (warehouseId && warehouseId !== branchId && vQty >= 0) {
            invRows.push({ branch_id: warehouseId, variant_id: v.id, quantity: vQty, low_stock_threshold: effectiveLow });
            movRows.push({ variant_id: v.id, branch_id: warehouseId, movement_type: 'opening', quantity_change: vQty, quantity_after: vQty, note: 'Opening stock (warehouse)', created_by: profile?.id ?? null });
          }
        });
        if (invRows.length > 0) {
          const { error: ie2 } = await supabase.from('inventory').insert(invRows);
          if (ie2) throw ie2;
        }
        if (movRows.length > 0) {
          await supabase.from('inventory_movements').insert(movRows);
        }
      }
      localStorage.removeItem('product-form-draft');
      await logAudit(editing ? 'updated_product' : 'created_product', 'products', productId, { name, sizes });
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: 'general', label: 'General' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'variants', label: 'Variants' },
    { key: 'advanced', label: 'Advanced' },
  ];

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Product' : 'New Product'} size="lg">
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="max-h-[60vh] overflow-y-auto pr-1 pt-4">
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <Input label="Product Name" value={name} onChange={setName} placeholder="Nike Air Max" required error={errs.name} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Select label="Brand" value={brandId} onChange={setBrandId} options={[{ value: '', label: '— select —' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} required />
                {brandId && <button type="button" onClick={() => { const b = brands.find((x) => x.id === brandId); if (b) onDeleteBrand(b.id, b.name); }} className="text-xs text-red-500 hover:text-red-700 mt-1">Delete this brand</button>}
                {errs.brand && <p className="text-xs text-red-500 mt-1">{errs.brand}</p>}
              </div>
              <div>
                <Select label="Category" value={categoryId} onChange={setCategoryId} options={[{ value: '', label: '— select —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} required />
                {categoryId && <button type="button" onClick={() => { const c = categories.find((x) => x.id === categoryId); if (c) onDeleteCategory(c.id, c.name); }} className="text-xs text-red-500 hover:text-red-700 mt-1">Delete this category</button>}
                {errs.category && <p className="text-xs text-red-500 mt-1">{errs.category}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <input placeholder="or new brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              <input placeholder="or new category" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Select label="Gender" value={gender} onChange={setGender} options={[{ value: '', label: '—' }, ...GENDERS.map((g) => ({ value: g, label: g }))]} />
              <Input label="Color" value={color} onChange={setColor} placeholder="Black" />
              <Input label="Season" value={season} onChange={setSeason} placeholder="Summer 2026" />
            </div>
            <Input label="Style" value={style} onChange={setStyle} placeholder="Running" />
            <Select label="Supplier" value={supplierId} onChange={setSupplierId} options={[{ value: '', label: '— select —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Product Image</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-colors ${dragOver ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-300 dark:border-slate-600'}`}
              >
                {imageUrl ? (
                  <div className="relative inline-block">
                    <img src={imageUrl} alt="Preview" className="w-32 h-32 rounded-lg object-cover mx-auto" />
                    <button onClick={() => setImageUrl('')} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">×</button>
                  </div>
                ) : uploadingImage ? (
                  <div className="py-4"><Spinner /></div>
                ) : (
                  <div className="py-4">
                    <FileImage size={32} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500">Drag & drop image here, or</p>
                    <div className="flex gap-2 justify-center mt-2">
                      <Button variant="secondary" size="sm" onClick={() => fileImageRef.current?.click()}><Upload size={14} className="inline mr-1" /> Upload</Button>
                      <Button variant="secondary" size="sm" onClick={() => cameraRef.current?.click()}><Camera size={14} className="inline mr-1" /> Camera</Button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP — auto-compressed</p>
                  </div>
                )}
                <input ref={fileImageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
              </div>
            </div>
          </div>
        )}

        {/* PRICING TAB */}
        {activeTab === 'pricing' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Input label="Cost Price (PKR)" value={purchase} onChange={setPurchase} type="number" error={errs.purchase} required />
              <Input label="Selling Price (PKR)" value={selling} onChange={setSelling} type="number" error={errs.selling} required />
              <Input label="Tax Rate (%)" value={tax} onChange={setTax} type="number" />
            </div>
            {Number(purchase) > 0 && Number(selling) > 0 && (
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Margin per unit</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(Number(selling) - Number(purchase))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Margin %</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {(((Number(selling) - Number(purchase)) / Number(selling)) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax amount</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formatMoney((Number(selling) * Number(tax)) / 100)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Reorder Level" value={reorderLevel} onChange={setReorderLevel} type="number" />
              <Input label="Minimum Stock" value={minStock} onChange={setMinStock} type="number" />
              <Input label="Max Stock" value={maxStock} onChange={setMaxStock} type="number" />
              <Input label="Default Opening Qty" value={stockQty} onChange={setStockQty} type="number" />
            </div>
            {!editing && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Select label="Branch (stock location)" value={branchId} onChange={setBranchId} options={[{ value: '', label: '— select —' }, ...shopBranches.map((b) => ({ value: b.id, label: b.name }))]} required />
                    {errs.branch && <p className="text-xs text-red-500 mt-1">{errs.branch}</p>}
                  </div>
                  <Select label="Warehouse (optional)" value={warehouseId} onChange={setWarehouseId} options={[{ value: '', label: '— none —' }, ...warehouseBranches.map((b) => ({ value: b.id, label: b.name }))]} />
                </div>
                {sizes.length > 1 && (
                  <div>
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Per-Size Opening Stock</span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {sizes.map((s) => (
                        <div key={s}>
                          <label className="block text-xs text-slate-500 mb-0.5">Size {s}</label>
                          <input type="number" min="0" value={perSizeStock[s] ?? stockQty} onChange={(e) => setPerSizeStock((p) => ({ ...p, [s]: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-center text-slate-900 dark:text-white" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* BARCODE TAB */}
        {activeTab === 'barcode' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Barcode <span className="text-red-500">*</span></label>
              <div className="flex gap-1">
                <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Auto-generated on save" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white" />
                <Button variant="secondary" size="sm" onClick={genNewBarcode}><Barcode size={14} /></Button>
              </div>
              {barcodeStatus === 'checking' && <p className="text-xs text-slate-400 mt-1">Checking uniqueness...</p>}
              {barcodeStatus === 'unique' && barcode && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Barcode is unique</p>}
              {barcodeStatus === 'duplicate' && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> Barcode already in use by "{barcodeDuplicateName}"</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={genNewBarcode} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded">Generate New</button>
                    <button onClick={() => setBarcode('')} className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded">Edit Barcode</button>
                  </div>
                </div>
              )}
              {errs.barcode && <p className="text-xs text-red-500 mt-1">{errs.barcode}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">SKU</label>
              <div className="flex gap-1">
                <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Auto-generated (e.g. NIK-BLK-40)" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white" />
                <Button variant="secondary" size="sm" onClick={genNewSKU}><RefreshCw size={14} /></Button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Format: BRAND-COLOR-SIZE (e.g. NIK-BLK-40)</p>
            </div>
            {barcode && (
              <div className="text-center p-4 bg-white dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                <canvas ref={(el) => { if (el) { import('../lib/utils').then(({ drawBarcode }) => drawBarcode(el, barcode, barcode)); } }} className="mx-auto" />
                <p className="text-xs text-slate-500 mt-2 font-mono">{barcode}</p>
              </div>
            )}
          </div>
        )}

        {/* VARIANTS TAB */}
        {activeTab === 'variants' && (
          <div className="space-y-4">
            {!editing ? (
              <>
                <div>
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sizes (color/size matrix) <span className="text-red-500">*</span></span>
                  <div className="flex flex-wrap gap-2">
                    {SIZES.map((s) => (
                      <button key={s} type="button" onClick={() => toggleSize(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${sizes.includes(s) ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-slate-400'}`}>{s}</button>
                    ))}
                  </div>
                  {errs.sizes && <p className="text-xs text-red-500 mt-1">{errs.sizes}</p>}
                </div>
                <p className="text-xs text-slate-500">Each size will get its own unique barcode and SKU. Stock can be set per-size in the Inventory tab.</p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Current variant: <strong>Size {editing.size}</strong></p>
                  <p className="text-xs text-slate-400 mt-1">SKU: {editing.sku ?? '-'}</p>
                  <p className="text-xs text-slate-400">Barcode: {editing.variant_barcode ?? '-'}</p>
                </div>
                <Input label="Change size to" value={sizes[0] ?? ''} onChange={(v) => setSizes(v ? [v] : [])} placeholder={editing.size} />
              </div>
            )}
          </div>
        )}

        {/* ADVANCED TAB */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <Input label="Style" value={style} onChange={setStyle} placeholder="Running" />
            <Input label="Season" value={season} onChange={setSeason} placeholder="Summer 2026" />
            <Input label="Gender" value={gender} onChange={setGender} placeholder="Men / Women / Kids / Unisex" />
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3">
              <p className="text-xs text-slate-500">Product ID: {editing?.product_id ?? '(new)'}</p>
              <p className="text-xs text-slate-500">Variant ID: {editing?.variant_id ?? '(new)'}</p>
              <p className="text-xs text-slate-400 mt-2">A draft of this form is auto-saved to your browser.</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || !name.trim() || barcodeStatus === 'duplicate'}>
          {saving ? <Spinner className="mx-auto" /> : editing ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </Modal>
  );
}

export { Package };
