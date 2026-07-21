import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, EmptyState, ErrorState, ConfirmDialog, SearchInput, Pagination, TableSkeleton, Spinner } from '../components/ui';
import { formatDate } from '../lib/utils';
import type { Role } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { logAudit } from '../lib/audit';
import { Plus, UserCog, Trash2, Search as SearchIcon, Check } from 'lucide-react';

const ROLES: Role[] = ['super_admin', 'owner', 'manager', 'cashier', 'warehouse', 'accountant'];
const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin', owner: 'Owner', manager: 'Manager',
  cashier: 'Cashier', warehouse: 'Warehouse', accountant: 'Accountant',
};
const PAGE_SIZE = 10;

type Employee = {
  id: string;
  name: string;
  role: Role;
  branch_id: string | null;
  active: boolean;
  created_at: string;
};

export function Employees() {
  const { profile } = useAuth();
  const { success, error } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, b] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('branches').select('id,name').order('name'),
      ]);
      if (p.error) throw p.error;
      setEmployees(p.data ?? []);
      setBranches(b.data ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—';
  const roleColor = (r: Role) => (r === 'super_admin' || r === 'owner' ? 'amber' : r === 'manager' ? 'blue' : r === 'cashier' ? 'green' : 'slate') as 'amber' | 'blue' | 'green' | 'slate';

  const toggleActive = async (e: Employee) => {
    try {
      const { error: err } = await supabase.from('profiles').update({ active: !e.active }).eq('id', e.id);
      if (err) throw err;
      success(`${e.name} ${e.active ? 'deactivated' : 'activated'}`);
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const setRole = async (e: Employee, role: Role) => {
    try {
      const { error: err } = await supabase.from('profiles').update({ role }).eq('id', e.id);
      if (err) throw err;
      success(`${e.name}'s role changed to ${ROLE_LABELS[role]}`);
      await logAudit('changed_role', 'profiles', e.id, { name: e.name, role });
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to change role');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const { error: e } = await supabase.from('profiles').delete().eq('id', confirmDelete.id);
      if (e) throw e;
      success(`${confirmDelete.name} removed`);
      await logAudit('deleted_employee', 'profiles', confirmDelete.id, { name: confirmDelete.name });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to remove employee');
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Employees"
        subtitle="Role-based access control for your team"
        action={<Button onClick={() => setShowForm(true)}><Plus size={16} /> Invite Employee</Button>}
      />
      <Card className="p-4 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search employees by name..." />
      </Card>
      {loading ? (
        <Card><TableSkeleton rows={5} cols={6} /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={load} /></Card>
      ) : paged.length === 0 ? (
        <Card><EmptyState message="No employees found. Invite team members to manage your store." actionLabel="Invite Employee" onAction={() => setShowForm(true)} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Employee</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Branch</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {paged.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">{e.name.charAt(0).toUpperCase()}</div>
                        <span className="font-medium text-slate-900 dark:text-white">{e.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select value={e.role} onChange={(ev) => setRole(e, ev.target.value as Role)} aria-label={`Change role for ${e.name}`} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white">
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <Badge color={roleColor(e.role)}>{ROLE_LABELS[e.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{branchName(e.branch_id)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(e)} aria-label={`Toggle active status for ${e.name}`}>
                        <Badge color={e.active ? 'green' : 'slate'}>{e.active ? 'Active' : 'Inactive'}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(e.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { if (e.id !== profile?.id) setConfirmDelete(e); }} disabled={e.id === profile?.id} aria-label="Delete employee" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </Card>
      )}
      {showForm && <InviteForm branches={branches} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Employee invited'); }} />}
      <ConfirmDialog
        open={!!confirmDelete}
        message={confirmDelete ? `Remove ${confirmDelete.name}? This deletes their auth account and profile. This cannot be undone.` : ''}
        confirmLabel="Remove"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </PageContainer>
  );
}

function InviteForm({ branches, onClose, onSaved }: { branches: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { error } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchId, setBranchId] = useState('');
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const save = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email';
    if (!password || password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, name, role, branch_id: branchId || null, active: true });
        if (profileError) throw profileError;
        await logAudit('invited_employee', 'profiles', data.user.id, { name, role });
      }
      onSaved();
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to invite employee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Invite Employee">
      <div className="space-y-3">
        <Input label="Full Name" value={name} onChange={setName} required error={errs.name} />
        <Input label="Email" value={email} onChange={setEmail} type="email" required error={errs.email} />
        <Input label="Temporary Password" value={password} onChange={setPassword} type="password" required error={errs.password} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role" value={role} onChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <Select label="Branch" value={branchId} onChange={setBranchId} options={[{ value: '', label: '— none —' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !email || !password || !name}>{saving ? <Spinner /> : 'Create & Invite'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export { UserCog };
