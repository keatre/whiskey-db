'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import AdminOnly from '../../components/AdminOnly';
import { fetchAdminModules, updateModule } from '../../api/modules';
import { MODULES_KEY } from '../../lib/useModules';

export default function AdminHome() {
  return (
    <AdminOnly>
      <main>
        <h1>Admin</h1>
        <p>Centralized tools for managing your Whiskey DB deployment.</p>
        <ul>
          <li>
            <Link href="/admin/users">User management</Link>
          </li>
          <li>
            <Link href="/admin/prices">Market prices</Link>
          </li>
          <li>
            <Link href="/retailers">Retailers</Link>
          </li>
        </ul>

        <ModulesPanel />
      </main>
    </AdminOnly>
  );
}

function ModulesPanel() {
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchAdminModules()
      .then((data) => {
        if (mounted) setModules(data.modules || {});
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load modules');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleModule = async (key: string) => {
    const next = !modules[key];
    setSaving(true);
    setError(null);
    try {
      await updateModule(key, next);
      setModules((prev) => ({ ...prev, [key]: next }));
      mutate(MODULES_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update module');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: '1.2rem' }}>Modules</h2>
      <p>Enable optional modules to add new areas to the app.</p>
      {loading && <p>Loading modules…</p>}
      {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p>}
      {!loading && (
        <div className="card" style={{ maxWidth: 480 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!modules.wine}
              disabled={saving}
              onChange={() => toggleModule('wine')}
            />
            <span>Wine</span>
          </label>
        </div>
      )}
    </section>
  );
}
