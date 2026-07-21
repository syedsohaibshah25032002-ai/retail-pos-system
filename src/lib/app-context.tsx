import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type DateRangeKey = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'lastmonth' | 'quarter' | 'year' | 'custom';

export type Filters = {
  dateRange: DateRangeKey;
  customStart: string;
  customEnd: string;
  branchId: string; // 'all' or id
  cashierId: string; // 'all' or id
  categoryId: string; // 'all' or id
  search: string;
};

type AppContextValue = {
  dark: boolean;
  toggleDark: () => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  lastUpdated: Date;
  setLastUpdated: (d: Date) => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const defaultFilters: Filters = {
  dateRange: 'today',
  customStart: '',
  customEnd: '',
  branchId: 'all',
  cashierId: 'all',
  categoryId: 'all',
  search: '',
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [filters, setFiltersState] = useState<Filters>(defaultFilters);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [dark]);

  const setFilters = (f: Partial<Filters>) => setFiltersState((prev) => ({ ...prev, ...f }));

  return (
    <AppContext.Provider
      value={{ dark, toggleDark: () => setDark((d) => !d), filters, setFilters, lastUpdated, setLastUpdated }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
