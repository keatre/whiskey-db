'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { me, login } from '../../lib/auth'; // uses credentials: 'include'

export default function LoginClient() {
  const r = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/bottles';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If already logged in, go to the intended page
  useEffect(() => {
    (async () => {
      try {
        const m = await me();
        if (m?.authenticated) r.replace(next);
      } catch { /* stay on page */ }
    })();
  }, [r, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();                 // critical
    setErr(null);
    setBusy(true);
    try {
      await login(username, password);  // POST /api/auth/login with cookies
      r.replace(next);
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Sign in</h1>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <input
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p style={{ opacity: 0.7, marginTop: 8 }}>
        Access to data outside your LAN requires authentication.
      </p>
      {err && <p style={{ color: 'tomato' }}>{err}</p>}
    </main>
  );
}
