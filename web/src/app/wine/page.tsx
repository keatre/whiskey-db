'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '../../lib/useMe';
import { useModules } from '../../lib/useModules';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type WineBottle = {
  wine_id: number;
  brand: string;
  expression?: string | null;
  winery?: string | null;
  style?: string | null;
  is_rare: boolean;
};

function parseStyle(style?: string | null): { family: string; sub: string } {
  if (!style || !style.trim()) return { family: 'Uncategorized', sub: 'General' };
  const parts = style.split(' - ').map(s => s.trim()).filter(Boolean);
  if (parts.length === 1) return { family: parts[0], sub: 'General' };
  return { family: parts[0], sub: parts.slice(1).join(' - ') };
}

function styleLeaf(style?: string | null): string | null {
  const { sub } = parseStyle(style);
  return sub && sub !== 'General' ? sub : null;
}

export default function WinePage() {
  const [wines, setWines] = useState<WineBottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [rareOnly, setRareOnly] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin } = useMe();
  const { modules } = useModules();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    if (!modules.wine) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNeedsAuth(false);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (rareOnly) params.set('rare', 'true');
        const url = `${API}/wine${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!mounted) return;

        if (res.status === 401) {
          setNeedsAuth(true);
          setWines([]);
          return;
        }

        if (!res.ok) {
          const msg = (await res.text().catch(() => '')).trim();
          setError(msg || `Failed to load wine (${res.status})`);
          setWines([]);
          return;
        }

        const data = await res.json().catch(() => []);
        setWines(Array.isArray(data) ? data : []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [rareOnly, modules.wine]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return wines;
    return wines.filter(w => {
      const hay = [w.brand, w.expression ?? '', w.winery ?? '', w.style ?? ''].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [wines, q]);

  const groups = useMemo(() => {
    const famMap = new Map<string, WineBottle[]>();
    for (const w of filtered) {
      const { family } = parseStyle(w.style);
      if (!famMap.has(family)) famMap.set(family, []);
      famMap.get(family)!.push(w);
    }
    return Array.from(famMap.entries());
  }, [filtered]);

  if (!modules.wine) {
    return (
      <main>
        <h1>Wine</h1>
        <p>The Wine module is not enabled.</p>
      </main>
    );
  }

  if (loading) return <main><p>Loading…</p></main>;

  if (needsAuth) {
    const next = encodeURIComponent(pathname || '/wine');
    return (
      <main>
        <h1 style={{ marginBottom: 12 }}>Sign in required</h1>
        <p style={{ marginBottom: 12 }}>
          You need to sign in to view the collection when accessing Whiskey DB from outside your LAN.
        </p>
        <Link href={`/signin?next=${next}`} style={{ fontWeight: 600 }}>
          Go to sign in →
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <h1 style={{ marginBottom: 12 }}>Wine</h1>
        <p style={{ color: 'salmon' }}>{error}</p>
      </main>
    );
  }

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Wine</h1>
        <div style={{ marginLeft: 'auto' }}>
          {isAdmin && <Link href="/wine/new">+ New Wine</Link>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <input
          id="wine-search"
          name="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand / expression / winery / style"
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.03)',
            color: 'inherit',
          }}
        />
        <button style={{ padding: '8px 12px', borderRadius: 8 }}>Search</button>
        <label
          htmlFor="wine-rare-only"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}
        >
          <input
            type="checkbox"
            id="wine-rare-only"
            name="rareOnly"
            checked={rareOnly}
            onChange={(e) => setRareOnly(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Rare only
        </label>
      </div>

      {groups.length === 0 ? (
        <p style={{ marginTop: 16 }}>No matching wines.</p>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 22 }}>
          {groups.map(([family, items]) => (
            <section key={family}>
              <h2 style={{ marginBottom: 8 }}>
                {family}{' '}
                <span style={{ opacity: 0.6, fontSize: '0.9em' }}>({items.length})</span>
              </h2>

              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {items.map((w) => {
                  const leaf = styleLeaf(w.style);
                  return (
                    <li key={w.wine_id} style={{ margin: '4px 0' }}>
                      <Link href={`/wine/${w.wine_id}`} style={{ fontWeight: 600 }}>
                        {w.brand}
                      </Link>
                      {w.is_rare ? (
                        <sup
                          style={{
                            color: '#c9a227',
                            fontWeight: 700,
                            marginLeft: 4,
                            letterSpacing: '0.02em',
                          }}
                        >
                          R
                        </sup>
                      ) : null}
                      {w.expression ? ` — ${w.expression}` : ''}
                      {leaf ? (
                        <>
                          {' '}
                          — <em style={{ opacity: 0.9 }}>{leaf}</em>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
