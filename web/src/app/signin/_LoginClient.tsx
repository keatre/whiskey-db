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

  async function doLogin() {
    setSubmitting(true);
    setError(null);
    try {
      const me = await AuthApi.login(username, password);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

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
          aria-label="Username"
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
          aria-label="Password"
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
      </div>
    </div>
  );
}
