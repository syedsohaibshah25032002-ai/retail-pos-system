import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PageContainer, PageHeader, Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from '../components/ui';
import { formatDate } from '../lib/utils';
import type { Role } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Plus, UserCog, Trash2, Mail } from 'lucide-react';

const ROLES: Role[] = ['super_admin', 'owner', 'manager', 'cashier', 'warehouse', 'accountant'];

type Employee = {
  id: string;
  name: string;
  role: Role;
  branch_id: string | null;
  active: boolean;
  created_at: string;
  email?: string;
};

export function Employees() {
  const { profile } = useAuth();
  const { success } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, b] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('id,name').order('name'),
    ]);
    // fetch emails from auth via admin api not available; show name + role
    setEmployees(p.data ?? []);
    setBranches(b.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—';
  const roleColor = (r: Role) => (r === 'super_admin' || r === 'owner' ? 'amber' : r === 'manager' ? 'blue' : r === 'cashier' ? 'green' : 'slate') as any;

  const toggleActive = async (e: Employee) => {
    await supabase.from('profiles').update({ active: !e.active }).eq('id', e.id);
    load();
  };

  const setRole = async (e: Employee, role: Role) => {
    await supabase.from('profiles').update({ role }).eq('id', e.id);
    load();
  };

  const del = async (e: Employee) => {
    if (e.id === profile?.id) { alert("You can't delete your own account."); return; }
    if (!confirm(`Remove ${e.name}? This deletes their auth account.`)) return;
    await supabase.from('profiles').delete().eq('id', e.id);
    success('Employee removed');
    load();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Employees"
        subtitle="Role-based access control for your team"
        action={<Button onClick={() => setShowForm(true)}><Plus size={16} className="inline mr-1" /> Invite Employee</Button>}
      />
      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : employees.length === 0 ? <Card><EmptyState message="No employees yet." /></Card> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Branch</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">{e.name.charAt(0).toUpperCase()}</div>
                      <span className="font-medium text-slate-900">{e.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select value={e.role} onChange={(ev) => setRole(e, ev.target.value as Role)} className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{branchName(e.branch_id)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(e)}>
                      <Badge color={e.active ? 'green' : 'slate'}>{e.active ? 'Active' : 'Inactive'}</Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(e.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => del(e)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {showForm && <InviteForm branches={branches} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); success('Employee invited'); }} />}
    </PageContainer>
  );
}

function InviteForm({ branches, onClose, onSaved }: { branches: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchId, setBranchId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setSaving(false); return; }
    if (data.user) {
      await supabase.from('profiles').insert({ id: data.user.id, name, role, branch_id: branchId || null, active: true });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Invite Employee">
      <div className="space-y-3">
        <Input label="Full Name" value={name} onChange={setName} required />
        <Input label="Email" value={email} onChange={setEmail} type="email" required />
        <Input label="Temporary Password" value={password} onChange={setPassword} type="password" required />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role" value={role} onChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r, label: r }))} />
          <Select label="Branch" value={branchId} onChange={setBranchId} options={[{ value: '', label: '— none —' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !email || !password || !name}>{saving ? <Spinner className="mx-auto" /> : 'Create & Invite'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export { UserCog, Mail };
