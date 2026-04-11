import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  getSupabaseUserEmail,
  isSupabaseAuthConfigured,
  signInWithSupabasePassword,
  signOutFromSupabase,
  subscribeSupabaseAuth,
} from '@/lib/supabase-auth';

export default function HomeAuthPanel() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '' });

  const enabled = isSupabaseAuthConfigured();

  useEffect(() => {
    let active = true;

    if (!enabled) {
      return () => undefined;
    }

    getSupabaseUserEmail().then((value) => {
      if (active) {
        setEmail(value);
      }
    });

    const unsubscribe = subscribeSupabaseAuth((value) => {
      if (active) {
        setEmail(value);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const signedInEmail = await signInWithSupabasePassword(form.email.trim(), form.password);
      setEmail(signedInEmail);
      setForm((prev) => ({ ...prev, password: '' }));
    } catch (signInError) {
      const message = signInError instanceof Error ? signInError.message : 'Sign in failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setBusy(true);

    try {
      await signOutFromSupabase();
      setEmail(null);
    } catch (signOutError) {
      const message = signOutError instanceof Error ? signOutError.message : 'Sign out failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 2.25 }}
        className="mt-5 rounded-lg border border-border bg-card/70 px-4 py-3 text-left backdrop-blur-sm"
      >
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Login / Sign-in
        </p>
        <p className="mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Auth is not configured. Add <strong>VITE_SUPABASE_URL</strong> and{' '}
          <strong>VITE_SUPABASE_ANON_KEY</strong> in <strong>synsoc-ai-frontend/.env</strong>, then restart the frontend.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 2.25 }}
      className="mt-5 rounded-lg border border-border bg-card/70 px-4 py-3 text-left backdrop-blur-sm"
    >
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Login / Sign-in
      </p>

      {email ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Signed in as <span style={{ color: 'hsl(var(--primary))' }}>{email}</span>
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs transition-all hover:scale-105"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            {busy ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSignIn} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-3 py-2 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'hsl(var(--primary))', color: '#0a0a0a', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}
    </motion.div>
  );
}
