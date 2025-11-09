'use client';

import React, { useEffect, useState } from 'react';
import { me as apiMe, login, logout, type MeResponse } from '../lib/auth';
import { mutate } from 'swr';
import { ME_KEY } from '../lib/useMe';

// Keep a local alias so the rest of the file reads nicely.
type Me = MeResponse;

const GUEST: Me = {
  username: null,
  email: null,
  role: 'guest',
  authenticated: false,
  lan_guest: false,
  lan_guest_reason: null,
};

export default function HeaderAuthControl() {
  const [user, setUser] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // initial /auth/me
  useEffect(() => {
    let mounted = true;
    apiMe()
      .then((u) => { if (mounted) setUser(u); })
      .catch(() => { if (mounted) setUser(GUEST); });
    return () => { mounted = false; };
  }, []);

  if (!user) return null;

  const isAuthenticated = user.authenticated;

  // Tell the entire app that auth changed
  const notifyAuthChanged = () => {
    // 1) SWR: refresh everyone using useMe() immediately
    mutate(ME_KEY);

    // 2) (Optional) legacy/global signals; fine to keep
    try {
      window.dispatchEvent(new Event('auth:changed'));
      localStorage.setItem('auth:changed', String(Date.now()));
    } catch {
      // ignore
    }
  };

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(form.username, form.password);
      // Confirm session then close UI
      const u = await apiMe();
      setUser(u);
      setOpen(false);
      setForm({ username: '', password: '' });
      notifyAuthChanged();
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    try {
      await logout();
    } finally {
      const u = await apiMe(); // should come back as guest
      setUser(u);
      notifyAuthChanged();
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={() => setOpen((v) => !v)}>Admin</button>
      {isAuthenticated && (
        <button onClick={doLogout} style={{ marginLeft: 4 }}>
          Logout
        </button>
      )}
      {open && !isAuthenticated && (
        <form onSubmit={doLogin} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
            autoComplete="current-password"
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {err && <span style={{ color: 'salmon', marginLeft: 6 }}>{err}</span>}
        </form>
      )}
    </div>
  );
}
