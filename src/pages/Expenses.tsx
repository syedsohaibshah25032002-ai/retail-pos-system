import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Spinner, EmptyState, ErrorState, ConfirmDialog, TableSkeleton } from '../components/ui';
import { formatMoney, formatDate, todayISO } from '../lib/utils';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, Wallet, Trash2 } from 'lucide-react';

const CATEGORIES = ['Rent', 'Electricity', 'Salaries', 'Internet', 'Maintenance', 'Marketing', 'Other'];

type Expense = {
  id: string;
  branch_id: string | null;
  category: string;
  amount: number;
  expense_date: string;
  note: string | null;
  created_at: string;
};

export function Expenses() {
  const { profile } = useAuth();
  const { success, error } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterBranch, setFilterBranch] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [e, b] = await Promise.all([
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('branches').select('id,name').order('name'),
      ]);
      if (e.error) throw e.error;
      setExpenses(e.data ?? []);
      setBranches(b.data ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = expenses.filter((e) => filterBranch === 'all' || e.branch_id === filterBranch);
  const total = filtered.reduce((a, e) => a + Number(e.amount), 0);
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—';

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error: e } = await supabase.from('expenses').delete().eq('id', confirmDelete.id);
      if (e) throw e;
      success('Expense deleted');
      await logAudit('deleted_expense', 'expenses', confirmDelete.id, { amount: confirmDelete.amount });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to delete expense');
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Expenses"
        subtitle="Track operational costs per branch"
        action={<Button onClick={() => setShowForm(true)}><Plus size={16} /> New Expense</Button>}
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Expenses</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatMoney(total)}</p>
        </Card>
        <Card className="p-4 md:col-span-3">
          <Select label="Filter by Branch" value={filterBranch} onChange={setFilterBranch} options={[{ value: 'all', label: 'All branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        </Card>
      </div>
      {loading ? (
        <Card><TableSkeleton rows={5} cols={5} /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={load} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState message="No expenses recorded. Track your operational costs by creating an expense." actionLabel="New Expense" onAction={() => setShowForm(true)} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Branch</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Note</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{branchName(e.branch_id)}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5"><Wallet size={13} className="text-slate-400" /> {e.category}</span></td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.note ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">{formatMoney(Number(e.amount))}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setConfirmDelete(e)} aria-label="Delete expense" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {showForm && <ExpenseForm branches={branches} defaultBranch={profile?.branch_id} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Expense saved'); }} />}
      <ConfirmDialog
        open={!!confirmDelete}
        message={confirmDelete ? `Delete this expense of ${formatMoney(Number(confirmDelete.amount))} for ${confirmDelete.category}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </PageContainer>
  );
}

function ExpenseForm({ branches, defaultBranch, onClose, onSaved }: { branches: { id: string; name: string }[]; defaultBranch?: string | null; onClose: () => void; onSaved: () => void }) {
  const { error } = useToast();
  const [branchId, setBranchId] = useState(defaultBranch ?? '');
  const [category, setCategory] = useState('Rent');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = async () => {
    const e: Record<string, string> = {};
    if (!amount || Number(amount) <= 0) e.amount = 'Enter a valid amount';
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      const { error: ie } = await supabase.from('expenses').insert({ branch_id: branchId || null, category, amount: Number(amount) || 0, expense_date: date, note });
      if (ie) throw ie;
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New Expense">
      <div className="space-y-3">
        <Select label="Branch" value={branchId} onChange={setBranchId} options={[{ value: '', label: '— none —' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount (PKR)" value={amount} onChange={setAmount} type="number" required error={errs.amount} />
          <Input label="Date" value={date} onChange={setDate} type="date" />
        </div>
        <Input label="Note" value={note} onChange={setNote} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !amount}>{saving ? <Spinner /> : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}
