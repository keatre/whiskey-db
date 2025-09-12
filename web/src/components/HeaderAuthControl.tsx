'use client';

import React, { useEffect, useState } from 'react';
import { me as apiMe, login, logout, type MeResponse } from '../lib/auth';

// Keep a local alias so the rest of the file reads nicely.
type Me = MeResponse;

const GUEST: Me = {
  username: null,
  email: null,
  role: 'guest',
  authenticated: false,
  lan_guest: true,
};

export default function HeaderAuthControl() {
  const [user, setUser] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiMe()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .catch(() => {
        if (mounted) setUser(GUEST);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(form.username, form.password);
      const u = await apiMe();
      setUser(u);
      setOpen(false);
      setForm({ username: '', password: '' });
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    await logout();
    const u = await apiMe();
    setUser(u);
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {isAdmin ? (
        <button onClick={doLogout}>Logout</button>
      ) : (
        <>
          <button onClick={() => setOpen((v) => !v)}>Admin</button>
          {open && (
            <form onSubmit={doLogin} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
              <button type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              {err && <span style={{ color: 'salmon', marginLeft: 6 }}>{err}</span>}
            </form>
          )}
        </>
      )}
    </div>
  );
}
