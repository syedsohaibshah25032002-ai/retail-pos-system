import { AuthProvider, useAuth } from './lib/auth';
import { AppProvider } from './lib/app-context';
import { ToastProvider } from './lib/toast';
import { AuthScreen } from './pages/Auth';
import { AppShell, type NavKey } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { POS } from './pages/POS';
import { Branches } from './pages/Branches';
import { Transfers } from './pages/Transfers';
import { Customers } from './pages/Customers';
import { Suppliers } from './pages/Suppliers';
import { Expenses } from './pages/Expenses';
import { Employees } from './pages/Employees';
import { Returns } from './pages/Returns';
import { Reports } from './pages/Reports';
import {
  Inventory, Warehouse, PurchaseOrders, Accounting, Loyalty,
  BarcodeLabels, Settings, AuditLogs, Backup, Promotions, DiscountRules, Tax,
} from './pages/Modules';
import { useState } from 'react';
import { Spinner, ErrorBoundary } from './components/ui';

function Shell() {
  const { session, profile, loading } = useAuth();
  const [nav, setNav] = useState<NavKey>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Spinner className="text-slate-400" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center gap-3">
        <Spinner className="text-slate-400" />
        <p className="text-sm text-slate-500">Setting up your workspace…</p>
      </div>
    );
  }

  const pages: Record<NavKey, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={setNav} />,
    products: <Products />,
    pos: <POS onNavigate={setNav} />,
    branches: <Branches />,
    transfers: <Transfers />,
    customers: <Customers />,
    suppliers: <Suppliers />,
    expenses: <Expenses />,
    employees: <Employees />,
    returns: <Returns />,
    reports: <Reports />,
    inventory: <Inventory />,
    warehouse: <Warehouse />,
    purchase_orders: <PurchaseOrders />,
    accounting: <Accounting />,
    loyalty: <Loyalty />,
    barcode_labels: <BarcodeLabels />,
    settings: <Settings />,
    audit_logs: <AuditLogs />,
    backup: <Backup />,
    promotions: <Promotions />,
    discount_rules: <DiscountRules />,
    tax: <Tax />,
  };

  return (
    <ErrorBoundary>
      <AppShell current={nav} onNavigate={setNav}>
        {pages[nav]}
      </AppShell>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
