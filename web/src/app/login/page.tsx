'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { me, login } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();

  // Read ?next=... from the URL (client-side, no Suspense needed)
  const nextTarget = useMemo(() => {
    if (typeof window === 'undefined') return '/bottles';
    const n = new URLSearchParams(window.location.search).get('next');
    // safety: only internal paths
    return n && n.startsWith('/') ? n : '/bottles';
  }, []);

  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If already logged in, bounce to nextTarget
  useEffect(() => {
    (async () => {
      try {
        const m = await me();
        if (m?.authenticated) router.replace(nextTarget);
      } catch {
        /* stay on page */
      }
    })();
  }, [router, nextTarget]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(form.username, form.password);   // sets cookies via proxy
      router.replace('/');                         // navigate
      router.refresh();                            // ensure server components see cookies
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Sign in</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input
          placeholder="Username"
          value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          autoComplete="current-password"
          required
        />
        {err && <div style={{ color: 'salmon' }}>{err}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ opacity: 0.7, marginTop: 10 }}>
        Access to data outside your LAN requires authentication.
      </p>
    </main>
  );
}
