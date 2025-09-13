'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthApi } from '../../api/auth'; // relative to web/src/api/auth.ts

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // helpful log
  console.log('[LoginClient] mounted, next =', next);

  async function doLogin() {
    setSubmitting(true);
    setError(null);
    try {
      console.log('[LoginClient] calling AuthApi.login…', {
        base: process.env.NEXT_PUBLIC_API_BASE ?? '/api',
        username_len: username.length,
        password_len: password.length,
      });
      const me = await AuthApi.login(username, password);
      console.log('[LoginClient] login ok:', me);
      router.replace(next);
    } catch (err: any) {
      console.error('[LoginClient] login error:', err);
      setError(err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Debug panel (dev only) ----------------------------------------------
  function DebugPanel() {
    async function run(label: string, url: string, init?: RequestInit) {
      console.log(`[DBG] ${label}: start`);
      try {
        // If Safari complains about AbortSignal.timeout, remove `signal`
        const r = await fetch(url, {
          cache: 'no-store',
          // @ts-ignore - AbortSignal.timeout may not exist in older Safari
          signal: (AbortSignal as any)?.timeout?.(7000),
          ...init,
        });
        const text = await r.text();
        console.log(`[DBG] ${label}: status=${r.status} len=${text.length}`, text.slice(0, 200));
      } catch (e: any) {
        console.error(`[DBG] ${label}: ERROR`, e?.name || e, e?.message || '');
      }
    }
    return (
      <div className="mt-6 space-x-2">
        <button className="px-2 py-1 rounded bg-zinc-700" onClick={() => run('ping', '/api/ping')}>
          Ping
        </button>
        <button className="px-2 py-1 rounded bg-zinc-700" onClick={() => run('health', '/api/health')}>
          Health
        </button>
        <button
          className="px-2 py-1 rounded bg-zinc-700"
          onClick={() =>
            run('login', '/api/auth/login', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: 'admin', password: 'PLEASE-CHANGE-ME' }),
            })
          }
        >
          Login (probe)
        </button>
      </div>
    );
  }
  // -------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>

      {/* No <form> tag = no implicit navigation */}
      <div>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          className="w-full mb-3 rounded px-3 py-2 text-black"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="w-full mb-3 rounded px-3 py-2 text-black"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="button"
          onClick={doLogin}
          disabled={submitting}
          className="rounded px-4 py-2 bg-blue-600 disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <p className="mt-3 text-red-400">{error}</p>}

        <p className="mt-3 text-sm opacity-70">
          Access to data outside your LAN requires authentication.
        </p>

        {/* Render the debug panel while we diagnose */}
        <DebugPanel />
      </div>
    </div>
  );
}
