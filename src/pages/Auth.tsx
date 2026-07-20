import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Input, Spinner } from '../components/ui';
import { Footprints } from 'lucide-react';

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            name: name || email.split('@')[0],
            role: 'super_admin',
            active: true,
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 mb-4 shadow-lg shadow-emerald-500/30">
            <Footprints className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white">SoleERP</h1>
          <p className="text-slate-400 mt-2">Multi-Branch Footwear Retail System</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Create Account
            </button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <Input label="Full Name" value={name} onChange={setName} placeholder="John Doe" required />
            )}
            <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="you@company.com" required />
            <Input
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="••••••••"
              required
            />
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? <Spinner className="mx-auto" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
          <p className="text-xs text-slate-400 text-center mt-4">
            First account becomes the Super Admin. Email confirmation is off.
          </p>
        </div>
      </div>
    </div>
  );
}
