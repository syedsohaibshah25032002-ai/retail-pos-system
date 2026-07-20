import { useEffect, useState, useMemo, useCallback } from 'react';
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
} from '../components/ui';
import { formatMoney, genBarcode } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { Plus, Search, Package, CreditCard as Edit2, Trash2, Barcode, Layers, Image as ImageIcon } from 'lucide-react';
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
  // stock aggregated across all branches
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
      // Soft-delete the product: mark deleted_at + is_active=false so it disappears from POS
      await supabase.from('products').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', r.product_id);
      // Hard-delete related data: variants (cascades to inventory via FK), price history, images
      await supabase.from('price_history').delete().eq('product_id', r.product_id);
      await supabase.from('product_images').delete().eq('product_id', r.product_id);
      await supabase.from('product_variants').delete().eq('product_id', r.product_id);
      success('Product deleted and hidden from POS');
      await logAudit('deleted_product', 'products', r.product_id, { name: r.name, size: r.size });
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Delete failed');
    }
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
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowScanner(true)}><ScanLine size={16} className="inline mr-1" /> Test Barcode</Button>
            <Button variant="secondary" onClick={printBulk}><Layers size={16} className="inline mr-1" /> Bulk Barcodes</Button>
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
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No products yet. Click 'New Product' to add your first item." />
        ) : (
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
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
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
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.branch_stock}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.warehouse_stock}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{r.total_stock}</td>
                      <td className="px-4 py-3 text-center">
                        {out ? <Badge color="red">Out</Badge> : low ? <Badge color="amber">Low</Badge> : <Badge color="green">OK</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {r.variant_barcode && (
                            <button onClick={() => setBarcodeItem({ code: r.variant_barcode!, name: r.name })} title="View Barcode" className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded">
                              <Barcode size={15} />
                            </button>
                          )}
                          <button onClick={() => { setEditing(r); setShowForm(true); }} title="Edit" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => del(r)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">
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
        )}
      </Card>

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

  const warehouseBranches = branches.filter((b) => b.type === 'warehouse');
  const shopBranches = branches.filter((b) => b.type !== 'warehouse');

  const toggleSize = (s: string) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const genNewBarcode = () => setBarcode(genBarcode());

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name required';
    else if (name.trim().length < 2) e.name = 'Name too short';
    if (!editing && sizes.length === 0) e.sizes = 'Select at least one size';
    if (purchase && Number(purchase) < 0) e.purchase = 'Invalid cost';
    if (selling && Number(selling) < 0) e.selling = 'Invalid price';
    if (!editing && Number(stockQty) < 0) e.stock = 'Invalid stock';
    if (!editing && !branchId) e.branch = 'Select a branch';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Verify barcode uniqueness before saving
      const finalBarcode = barcode || genBarcode();
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
        .select('id, products(name)')
        .eq('barcode', finalBarcode)
        .maybeSingle();
      if (existingV && existingV.id !== (editing?.variant_id ?? '')) {
        throw new Error(`Barcode ${finalBarcode} is already assigned to "${(existingV as any).products?.name ?? 'another variant'}". Generate a new barcode.`);
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

      // Log price history
      await supabase.from('price_history').insert({
        product_id: productId,
        purchase_price: Number(purchase) || 0,
        selling_price: Number(selling) || 0,
        changed_by: profile?.id ?? null,
      });

      if (editing?.variant_id) {
        // update existing variant
        const { error: ve } = await supabase
          .from('product_variants')
          .update({ size: sizes[0] ?? editing.size, barcode: barcode || genBarcode(), sku: sku || null })
          .eq('id', editing.variant_id);
        if (ve) throw ve;
        // upsert inventory for selected branch + log movement
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
        // create variants for each selected size
        const variantRows = sizes.map((s) => ({
          product_id: productId,
          size: s,
          barcode: genBarcode(),
          sku: sku || null,
        }));
        const { data: newVariants, error: ve } = await supabase.from('product_variants').insert(variantRows).select('id,size');
        if (ve) throw ve;
        // create inventory rows for each variant at selected branch + warehouse + log movements
        const invRows: { branch_id: string; variant_id: string; quantity: number; low_stock_threshold: number }[] = [];
        const movRows: { variant_id: string; branch_id: string; movement_type: string; quantity_change: number; quantity_after: number; note: string; created_by: string | null }[] = [];
        (newVariants ?? []).forEach((v) => {
          if (branchId) {
            invRows.push({ branch_id: branchId, variant_id: v.id, quantity: qty, low_stock_threshold: effectiveLow });
            movRows.push({ variant_id: v.id, branch_id: branchId, movement_type: 'opening', quantity_change: qty, quantity_after: qty, note: 'Opening stock', created_by: profile?.id ?? null });
          }
          if (warehouseId && warehouseId !== branchId) {
            invRows.push({ branch_id: warehouseId, variant_id: v.id, quantity: qty, low_stock_threshold: effectiveLow });
            movRows.push({ variant_id: v.id, branch_id: warehouseId, movement_type: 'opening', quantity_change: qty, quantity_after: qty, note: 'Opening stock (warehouse)', created_by: profile?.id ?? null });
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
      await logAudit(editing ? 'updated_product' : 'created_product', 'products', productId, { name, sizes });
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Product' : 'New Product'} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <Input label="Product Name" value={name} onChange={setName} placeholder="Nike Air Max" required error={errs.name} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Select label="Brand" value={brandId} onChange={setBrandId} options={[{ value: '', label: '— select —' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
            {brandId && <button type="button" onClick={() => { const b = brands.find((x) => x.id === brandId); if (b) onDeleteBrand(b.id, b.name); }} className="text-xs text-red-500 hover:text-red-700 mt-1">Delete this brand</button>}
          </div>
          <div>
            <Select label="Category" value={categoryId} onChange={setCategoryId} options={[{ value: '', label: '— select —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
            {categoryId && <button type="button" onClick={() => { const c = categories.find((x) => x.id === categoryId); if (c) onDeleteCategory(c.id, c.name); }} className="text-xs text-red-500 hover:text-red-700 mt-1">Delete this category</button>}
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
        <Input label="Image URL" value={imageUrl} onChange={setImageUrl} placeholder="https://images.pexels.com/..." />
        <div className="grid grid-cols-3 gap-4">
          <Input label="Cost Price" value={purchase} onChange={setPurchase} type="number" error={errs.purchase} />
          <Input label="Selling Price" value={selling} onChange={setSelling} type="number" error={errs.selling} />
          <Input label="Tax Rate (%)" value={tax} onChange={setTax} type="number" />
        </div>
        <Select label="Supplier" value={supplierId} onChange={setSupplierId} options={[{ value: '', label: '— select —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Barcode</label>
            <div className="flex gap-1">
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Auto-generated" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white" />
              <Button variant="secondary" size="sm" onClick={genNewBarcode}><Barcode size={14} /></Button>
            </div>
          </div>
          <Input label="SKU" value={sku} onChange={setSku} placeholder="Optional" />
        </div>
        {!editing && (
          <>
            <div>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sizes (color/size matrix)</span>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => toggleSize(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${sizes.includes(s) ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-slate-400'}`}>{s}</button>
                ))}
              </div>
              {errs.sizes && <p className="text-xs text-red-500 mt-1">{errs.sizes}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Opening Quantity (per size)" value={stockQty} onChange={setStockQty} type="number" error={errs.stock} />
              <Input label="Max Stock" value={maxStock} onChange={setMaxStock} type="number" />
              <Input label="Reorder Level" value={reorderLevel} onChange={setReorderLevel} type="number" />
              <Input label="Minimum Stock" value={minStock} onChange={setMinStock} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Branch (stock location)" value={branchId} onChange={setBranchId} options={[{ value: '', label: '— select —' }, ...shopBranches.map((b) => ({ value: b.id, label: b.name }))]} />
              <Select label="Warehouse (optional)" value={warehouseId} onChange={setWarehouseId} options={[{ value: '', label: '— none —' }, ...warehouseBranches.map((b) => ({ value: b.id, label: b.name }))]} />
            </div>
            {errs.branch && <p className="text-xs text-red-500">{errs.branch}</p>}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-800 pb-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Spinner className="mx-auto" /> : editing ? 'Save Changes' : 'Create Product'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export { Package };
