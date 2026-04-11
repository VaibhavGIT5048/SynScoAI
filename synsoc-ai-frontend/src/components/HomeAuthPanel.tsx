import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  getSupabaseEmailRedirectUrl,
  getSupabaseUserEmail,
  isSupabaseAuthConfigured,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
  signOutFromSupabase,
  subscribeSupabaseAuth,
} from '@/lib/supabase-auth';

export default function HomeAuthPanel() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });

  const enabled = isSupabaseAuthConfigured();
  const emailRedirectUrl = getSupabaseEmailRedirectUrl();

  const redirectToLocalhost = (() => {
    if (!emailRedirectUrl) {
      return false;
    }

    try {
      const host = new URL(emailRedirectUrl).hostname;
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hash = window.location.hash;
    if (!hash || !hash.includes('error=')) {
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');
    if (!errorCode && !errorDescription) {
      return;
    }

    if (errorCode === 'otp_expired') {
      setError('Confirmation link expired or already used. Sign up again to receive a new email link.');
      setMode('signup');
    } else {
      setError(errorDescription ?? 'Authentication link is invalid. Please try again.');
    }
    setNotice(null);

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }, []);

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

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setNotice(null);
    setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const normalizedEmail = form.email.trim();

      if (mode === 'signup') {
        if (form.password.length < 8) {
          throw new Error('Password must be at least 8 characters.');
        }
        if (form.password !== form.confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const result = await signUpWithSupabasePassword(normalizedEmail, form.password);
        if (result.requiresEmailConfirmation) {
          setNotice('Account created. Please confirm your email, then sign in.');
          setMode('signin');
        } else {
          setEmail(result.email);
          setNotice('Account created and signed in.');
        }
      } else {
        const signedInEmail = await signInWithSupabasePassword(normalizedEmail, form.password);
        setEmail(signedInEmail);
      }

      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : 'Authentication failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setNotice(null);
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
        <>
          <div className="mt-2 inline-flex rounded-md border border-border p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="rounded px-2 py-1 text-[11px] font-bold tracking-wide"
              style={{
                background: mode === 'signin' ? 'hsl(var(--primary))' : 'transparent',
                color: mode === 'signin' ? '#0a0a0a' : 'hsl(var(--foreground))',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="rounded px-2 py-1 text-[11px] font-bold tracking-wide"
              style={{
                background: mode === 'signup' ? 'hsl(var(--primary))' : 'transparent',
                color: mode === 'signup' ? '#0a0a0a' : 'hsl(var(--foreground))',
              }}
            >
              Sign Up
            </button>
          </div>

          <form
            onSubmit={handleAuthSubmit}
            className={`mt-2 grid grid-cols-1 gap-2 ${mode === 'signup' ? 'sm:grid-cols-1' : 'sm:grid-cols-[1fr_1fr_auto]'}`}
          >
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
          {mode === 'signup' && (
            <input
              type="password"
              placeholder="Confirm password"
              value={form.confirmPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
              required
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-3 py-2 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'hsl(var(--primary))', color: '#0a0a0a', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? (mode === 'signup' ? 'Creating account...' : 'Signing in...') : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          </form>

          <p className="mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            No default password is set. Use Sign Up first, then Sign In.
          </p>
          {redirectToLocalhost && (
            <p className="mt-2 text-xs" style={{ color: '#f59e0b' }}>
              Confirmation emails currently redirect to localhost. If you open email on another device, set
              {' '}<strong>VITE_SUPABASE_EMAIL_REDIRECT_URL</strong>{' '}to a public app URL.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-2 text-xs" style={{ color: 'hsl(var(--primary))' }}>
          {notice}
        </p>
      )}
    </motion.div>
  );
}
