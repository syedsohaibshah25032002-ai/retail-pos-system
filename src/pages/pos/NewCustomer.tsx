import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal, Button, Input } from '../../components/ui';
import { useToast } from '../../lib/toast';

type Customer = { id: string; name: string | null; mobile: string | null; loyalty_points: number; total_spent: number; created_at: string };

export function NewCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Customer) => void }) {
  const { success, error } = useToast();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    else if (name.trim().length < 2) e.name = 'Name too short';
    if (mobile && !/^[0-9+\-\s]{7,15}$/.test(mobile.trim())) e.mobile = 'Invalid mobile number';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Invalid email';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { data, error: dbErr } = await supabase
        .from('customers')
        .insert({
          name: name.trim(),
          mobile: mobile.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        })
        .select()
        .single();
      if (dbErr) throw dbErr;
      success('Customer added');
      onCreated(data);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New Customer" size="md">
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} required error={errs.name} placeholder="Customer name" />
        <Input label="Mobile" value={mobile} onChange={setMobile} error={errs.mobile} placeholder="03xx-xxxxxxx" />
        <Input label="Email" value={email} onChange={setEmail} type="email" error={errs.email} placeholder="customer@email.com" />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Optional notes"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Add Customer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
