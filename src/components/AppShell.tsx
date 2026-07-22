import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Package, ScanLine, Store, ArrowLeftRight, Users, Truck,
  Wallet, UserCog, Undo2, BarChart3, LogOut, Footprints, Menu, X, Bell,
  Search, Settings, Moon, Sun, ChevronDown, Warehouse, ClipboardList,
  Calculator, Award, Barcode, FileText, DatabaseBackup, Tag, Percent,
  Receipt, ShoppingCart, Plus, UserPlus, Zap, Activity, ShieldCheck,
  Server, Clock,
} from 'lucide-react';
import { useAuth, canAccess } from '../lib/auth';
import { useApp } from '../lib/app-context';
import { supabase, type Role } from '../lib/supabase';
import { formatDateTime, formatMoney } from '../lib/utils';

type SearchResult = { type: string; id: string; label: string; sub: string; nav: NavKey };

export type NavKey =
  | 'dashboard' | 'products' | 'pos' | 'branches' | 'transfers' | 'customers'
  | 'suppliers' | 'expenses' | 'employees' | 'returns' | 'sales_history' | 'reports'
  | 'inventory' | 'warehouse' | 'purchase_orders' | 'accounting' | 'loyalty'
  | 'barcode_labels' | 'settings' | 'audit_logs' | 'backup' | 'promotions'
  | 'discount_rules' | 'tax';

type NavItem = { key: NavKey; label: string; icon: typeof LayoutDashboard; roles: Role[] | 'all'; group?: string };

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: 'all', group: 'Main' },
  { key: 'pos', label: 'Point of Sale', icon: ScanLine, roles: ['cashier', 'manager'], group: 'Main' },
  { key: 'products', label: 'Products', icon: Package, roles: ['manager', 'warehouse', 'accountant'], group: 'Inventory' },
  { key: 'inventory', label: 'Inventory', icon: Package, roles: ['manager', 'warehouse', 'accountant'], group: 'Inventory' },
  { key: 'warehouse', label: 'Warehouse', icon: Warehouse, roles: ['manager', 'warehouse'], group: 'Inventory' },
  { key: 'transfers', label: 'Stock Transfers', icon: ArrowLeftRight, roles: ['manager', 'warehouse'], group: 'Inventory' },
  { key: 'barcode_labels', label: 'Barcode Labels', icon: Barcode, roles: ['manager', 'warehouse'], group: 'Inventory' },
  { key: 'branches', label: 'Branches', icon: Store, roles: ['manager', 'warehouse', 'accountant'], group: 'Inventory' },
  { key: 'suppliers', label: 'Suppliers & POs', icon: Truck, roles: ['manager', 'warehouse', 'accountant'], group: 'Purchasing' },
  { key: 'purchase_orders', label: 'Purchase Orders', icon: ClipboardList, roles: ['manager', 'warehouse', 'accountant'], group: 'Purchasing' },
  { key: 'customers', label: 'Customers', icon: Users, roles: ['cashier', 'manager', 'accountant'], group: 'CRM' },
  { key: 'loyalty', label: 'Loyalty Program', icon: Award, roles: ['cashier', 'manager', 'accountant'], group: 'CRM' },
  { key: 'returns', label: 'Sales Returns', icon: Undo2, roles: ['cashier', 'manager'], group: 'Sales' },
  { key: 'sales_history', label: 'Sales History', icon: ClipboardList, roles: ['cashier', 'manager', 'accountant'], group: 'Sales' },
  { key: 'expenses', label: 'Expenses', icon: Wallet, roles: ['manager', 'accountant'], group: 'Finance' },
  { key: 'accounting', label: 'Accounting', icon: Calculator, roles: ['manager', 'accountant'], group: 'Finance' },
  { key: 'reports', label: 'Reports', icon: BarChart3, roles: ['manager', 'accountant'], group: 'Finance' },
  { key: 'promotions', label: 'Promotions', icon: Tag, roles: ['manager'], group: 'Finance' },
  { key: 'discount_rules', label: 'Discount Rules', icon: Percent, roles: ['manager'], group: 'Finance' },
  { key: 'tax', label: 'Tax / VAT', icon: Receipt, roles: ['manager', 'accountant'], group: 'Finance' },
  { key: 'employees', label: 'Employees', icon: UserCog, roles: ['manager'], group: 'Admin' },
  { key: 'audit_logs', label: 'Audit Logs', icon: FileText, roles: ['manager'], group: 'Admin' },
  { key: 'backup', label: 'Backup', icon: DatabaseBackup, roles: ['manager'], group: 'Admin' },
  { key: 'settings', label: 'Settings', icon: Settings, roles: ['manager'], group: 'Admin' },
];

const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin', owner: 'Owner', manager: 'Manager',
  cashier: 'Cashier', warehouse: 'Warehouse', accountant: 'Accountant',
};

export function AppShell({
  current,
  onNavigate,
  children,
  notifications,
}: {
  current: NavKey;
  onNavigate: (k: NavKey) => void;
  children: ReactNode;
  notifications?: { id: string; type: string; message: string; created_at: string }[];
}) {
  const { profile, signOut } = useAuth();
  const { dark, toggleDark, filters, setFilters, lastUpdated } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [branches, setBranchs] = useState<{ id: string; name: string }[]>([]);
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [dbStatus, setDbStatus] = useState<'Connected' | 'Disconnected'>('Connected');
  const [serverStatus, setServerStatus] = useState<'Online' | 'Offline'>('Online');
  const role = profile?.role ?? null;

  useEffect(() => {
    (async () => {
      const [b, p, c] = await Promise.all([
        supabase.from('branches').select('id,name').order('name'),
        supabase.from('profiles').select('id,name').order('name'),
        supabase.from('categories').select('id,name').order('name'),
      ]);
      setBranchs(b.data ?? []);
      setCashiers(p.data ?? []);
      setCategories(c.data ?? []);
      const anyError = b.error || p.error || c.error;
      setDbStatus(anyError ? 'Disconnected' : 'Connected');
      setServerStatus(anyError ? 'Offline' : 'Online');
    })();
  }, []);

  // CTRL+K / Cmd+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const floatingActions: { label: string; icon: typeof Plus; nav: NavKey; color: string }[] = [
    { label: 'New Sale', icon: ShoppingCart, nav: 'pos', color: 'emerald' },
    { label: 'New Purchase', icon: Truck, nav: 'suppliers', color: 'blue' },
    { label: 'New Product', icon: Package, nav: 'products', color: 'orange' },
    { label: 'Stock Transfer', icon: ArrowLeftRight, nav: 'transfers', color: 'violet' },
    { label: 'Customer', icon: UserPlus, nav: 'customers', color: 'slate' },
    { label: 'Expense', icon: Wallet, nav: 'expenses', color: 'red' },
    { label: 'Barcode', icon: Barcode, nav: 'barcode_labels', color: 'blue' },
  ];

  const visible = NAV.filter((n) => n.roles === 'all' || canAccess(role, n.roles as Role[]));
  const groups = [...new Set(visible.map((n) => n.group))];

  const quickActions: { label: string; icon: typeof Plus; nav: NavKey; color: string }[] = [
    { label: 'New Sale', icon: ShoppingCart, nav: 'pos', color: 'emerald' },
    { label: 'New Purchase', icon: Truck, nav: 'suppliers', color: 'blue' },
    { label: 'Stock Transfer', icon: ArrowLeftRight, nav: 'transfers', color: 'violet' },
    { label: 'Add Product', icon: Package, nav: 'products', color: 'orange' },
    { label: 'Add Customer', icon: UserPlus, nav: 'customers', color: 'slate' },
  ];

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
          <Footprints className="text-white" size={20} />
        </div>
        <div>
          <p className="font-bold text-white text-lg leading-none">SoleERP</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Footwear Retail OS</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scrollbar-thin">
        {groups.map((g) => (
          <div key={g}>
            <p className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">{g}</p>
            <div className="space-y-0.5">
              {visible.filter((n) => n.group === g).map((item) => {
                const Icon = item.icon;
                const active = current === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { onNavigate(item.key); setMobileOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-semibold">
            {(profile?.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.name}</p>
            <p className="text-xs text-slate-500">{role ? ROLE_LABEL[role] : ''}</p>
          </div>
        </div>
        <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      <aside className="hidden lg:flex w-64 bg-slate-900 flex-col fixed inset-y-0 left-0 z-30">
        {SidebarContent}
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900 animate-slide-in">{SidebarContent}</aside>
        </div>
      )}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col min-h-screen">
        {/* Top header */}
        <header className="sticky top-0 z-20 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="lg:hidden text-slate-600 dark:text-slate-300">
                <Menu size={22} />
              </button>
              <div className="hidden md:flex items-center gap-2">
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ dateRange: e.target.value as any })}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="month">This Month</option>
                  <option value="lastmonth">Last Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                  <option value="custom">Custom</option>
                </select>
                <select
                  value={filters.branchId}
                  onChange={(e) => setFilters({ branchId: e.target.value })}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select
                  value={filters.cashierId}
                  onChange={(e) => setFilters({ cashierId: e.target.value })}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200"
                >
                  <option value="all">All Cashiers</option>
                  {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                  value={filters.categoryId}
                  onChange={(e) => setFilters({ categoryId: e.target.value })}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSearchOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <Search size={18} />
              </button>
              <button onClick={toggleDark} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="relative">
                <button onClick={() => setNotifOpen(!notifOpen)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 relative">
                  <Bell size={18} />
                  {notifications && notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-40 max-h-96 overflow-y-auto">
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white text-sm">Notifications</div>
                      {notifications && notifications.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {notifications.map((n) => (
                            <div key={n.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700">
                              <p className="text-sm text-slate-700 dark:text-slate-200">{n.message}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(n.created_at)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-4 py-6 text-sm text-slate-400 text-center">No notifications</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <button className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hidden sm:block">
                <Settings size={18} />
              </button>
              <div className="relative">
                <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                    {(profile?.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-40 py-1">
                      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{profile?.name}</p>
                        <p className="text-xs text-slate-500">{role ? ROLE_LABEL[role] : ''}</p>
                      </div>
                      <div className="py-1">
                        <button onClick={() => { onNavigate('settings'); setProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">My Profile</button>
                        <button onClick={() => { onNavigate('settings'); setProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">Change Password</button>
                        <button onClick={toggleDark} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">{dark ? 'Light Mode' : 'Dark Mode'}</button>
                        <button className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">Preferences</button>
                        <button className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">Language</button>
                        <button onClick={signOut} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                          <LogOut size={14} /> Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto scrollbar-thin pb-1">
            {quickActions.map((qa) => {
              const Icon = qa.icon;
              const colors: Record<string, string> = {
                emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
                orange: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
                slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
              };
              return (
                <button
                  key={qa.label}
                  onClick={() => onNavigate(qa.nav)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${colors[qa.color]}`}
                >
                  <Icon size={14} /> {qa.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* Custom date picker */}
        {filters.dateRange === 'custom' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">Custom Range:</span>
            <input type="date" value={filters.customStart} onChange={(e) => setFilters({ customStart: e.target.value })} className="px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-700 text-sm" />
            <span className="text-blue-700 dark:text-blue-300">to</span>
            <input type="date" value={filters.customEnd} onChange={(e) => setFilters({ customEnd: e.target.value })} className="px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-700 text-sm" />
          </div>
        )}

        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1"><Zap size={12} className="text-emerald-500" /> SoleERP v2.0</span>
            <span className="flex items-center gap-1"><DatabaseBackup size={12} className="text-blue-500" /> DB: <span className={dbStatus === 'Connected' ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{dbStatus}</span></span>
            <span className="flex items-center gap-1"><Server size={12} className={serverStatus === 'Online' ? 'text-emerald-500' : 'text-red-500'} /> Server: <span className={serverStatus === 'Online' ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{serverStatus}</span></span>
            <span className="flex items-center gap-1"><Clock size={12} /> Updated: {formatDateTime(lastUpdated)}</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-500" /> Secure Session
          </div>
        </footer>
      </div>

      {/* Global search modal */}
      {searchOpen && (
        <GlobalSearch
          value={filters.search}
          onChange={(v) => setFilters({ search: v })}
          results={searchResults}
          setResults={setSearchResults}
          searching={searching}
          setSearching={setSearching}
          onClose={() => setSearchOpen(false)}
          onNavigate={(k) => { onNavigate(k); setSearchOpen(false); }}
        />
      )}

      {/* Floating quick action shortcuts */}
      <div className="fixed bottom-4 right-4 z-20 flex flex-col gap-2">
        {floatingActions.map((qa) => {
          const Icon = qa.icon;
          const colors: Record<string, string> = {
            emerald: 'bg-emerald-600 hover:bg-emerald-700',
            blue: 'bg-blue-600 hover:bg-blue-700',
            violet: 'bg-violet-600 hover:bg-violet-700',
            orange: 'bg-orange-600 hover:bg-orange-700',
            slate: 'bg-slate-600 hover:bg-slate-700',
            red: 'bg-red-600 hover:bg-red-700',
          };
          return (
            <button key={qa.label} onClick={() => onNavigate(qa.nav)} title={qa.label} className={"w-11 h-11 rounded-full " + colors[qa.color] + " text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 group relative"}>
              <Icon size={18} />
              <span className="absolute right-12 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">{qa.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GlobalSearch({ value, onChange, results, setResults, searching, setSearching, onClose, onNavigate }: {
  value: string;
  onChange: (v: string) => void;
  results: SearchResult[];
  setResults: (r: SearchResult[]) => void;
  searching: boolean;
  setSearching: (b: boolean) => void;
  onClose: () => void;
  onNavigate: (k: NavKey) => void;
}) {
  useEffect(() => {
    if (!value.trim()) { setResults([]); return; }
    setSearching(true);
    const q = value.trim().toLowerCase();
    const id = setTimeout(async () => {
      const [p, v, c, s, inv, b, e, tr, po] = await Promise.all([
        supabase.from('products').select('id,name,barcode').ilike('name', `%${q}%`).limit(5),
        supabase.from('product_variants').select('id,barcode,product_id,products(name)').ilike('barcode', `%${q}%`).limit(5),
        supabase.from('customers').select('id,name,mobile').or(`name.ilike.%${q}%,mobile.ilike.%${q}%`).limit(5),
        supabase.from('suppliers').select('id,name').ilike('name', `%${q}%`).limit(5),
        supabase.from('sales').select('id,receipt_no').ilike('receipt_no', `%${q}%`).limit(5),
        supabase.from('branches').select('id,name').ilike('name', `%${q}%`).limit(5),
        supabase.from('profiles').select('id,name').ilike('name', `%${q}%`).limit(5),
        supabase.from('stock_transfers').select('id,transfer_no').ilike('transfer_no', `%${q}%`).limit(5),
        supabase.from('purchase_orders').select('id,po_no').ilike('po_no', `%${q}%`).limit(5),
      ]);
      const r: SearchResult[] = [];
      (p.data ?? []).forEach((x: any) => r.push({ type: 'Product', id: x.id, label: x.name, sub: x.barcode ?? '', nav: 'products' }));
      (v.data ?? []).forEach((x: any) => r.push({ type: 'Barcode', id: x.id, label: (x as any).products?.name ?? x.barcode, sub: x.barcode, nav: 'products' }));
      (c.data ?? []).forEach((x: any) => r.push({ type: 'Customer', id: x.id, label: x.name ?? 'Unknown', sub: x.mobile ?? '', nav: 'customers' }));
      (s.data ?? []).forEach((x: any) => r.push({ type: 'Supplier', id: x.id, label: x.name, sub: '', nav: 'suppliers' }));
      (inv.data ?? []).forEach((x: any) => r.push({ type: 'Invoice', id: x.id, label: x.receipt_no, sub: '', nav: 'reports' }));
      (b.data ?? []).forEach((x: any) => r.push({ type: 'Branch', id: x.id, label: x.name, sub: '', nav: 'branches' }));
      (e.data ?? []).forEach((x: any) => r.push({ type: 'Employee', id: x.id, label: x.name, sub: '', nav: 'employees' }));
      (tr.data ?? []).forEach((x: any) => r.push({ type: 'Transfer', id: x.id, label: x.transfer_no, sub: '', nav: 'transfers' }));
      (po.data ?? []).forEach((x: any) => r.push({ type: 'PO', id: x.id, label: x.po_no, sub: '', nav: 'purchase_orders' }));
      setResults(r);
      setSearching(false);
    }, 250);
    return () => clearTimeout(id);
  }, [value]);

  const typeColor: Record<string, string> = {
    Product: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30', Barcode: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30',
    Customer: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30', Supplier: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30',
    Invoice: 'text-slate-600 bg-slate-100 dark:bg-slate-700', Branch: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
    Employee: 'text-slate-600 bg-slate-100 dark:bg-slate-700',
    Transfer: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30', PO: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30',
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center pt-20 p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search size={18} className="text-slate-400" />
          <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search products, barcodes, customers, invoices, suppliers, branches, employees..." className="flex-1 text-sm bg-transparent outline-none text-slate-900 dark:text-white" />
          {searching && <span className="text-xs text-slate-400">…</span>}
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {value.trim() === '' ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">Start typing to search across the entire system</p>
          ) : results.length === 0 && !searching ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">No results found</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {results.map((r, i) => (
                <button key={i} onClick={() => onNavigate(r.nav)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-left">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${typeColor[r.type] ?? 'bg-slate-100 text-slate-600'}`}>{r.type}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{r.label}</p>
                    {r.sub && <p className="text-xs text-slate-400 truncate">{r.sub}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { Activity };
