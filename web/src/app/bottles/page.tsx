'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '../../lib/useMe'; // ⬅️ use the shared SWR hook

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type Bottle = {
  bottle_id: number;
  brand: string;
  expression?: string | null;
  distillery?: string | null;
  style?: string | null;
  is_rare: boolean;
};

// --- helpers for family/substyle ---
const FAMILY_ORDER = ['Bourbon','Scotch','Rye','Irish','Japanese','Tennessee','Canadian','Uncategorized'] as const;
type Family = (typeof FAMILY_ORDER)[number];
const FAMILY_INDEX = new Map<Family, number>(FAMILY_ORDER.map((f, i) => [f, i]));

/** Split style like "Bourbon - Single Barrel" => family:"Bourbon", sub:"Single Barrel" */
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
function familyRank(name: string) { return FAMILY_INDEX.get(name as Family) ?? Number.MAX_SAFE_INTEGER; }
function familySort(a: string, b: string) { const ia = familyRank(a), ib = familyRank(b); return ia !== ib ? ia - ib : a.localeCompare(b); }
function bottleSort(a: Bottle, b: Bottle) {
  const ab = a.brand.localeCompare(b.brand);
  return ab !== 0 ? ab : (a.expression ?? '').localeCompare(b.expression ?? '');
}

export default function BottlesPage() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [rareOnly, setRareOnly] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin } = useMe(); // ⬅️ single source of truth for auth/role
  const pathname = usePathname();

  // load bottles
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setNeedsAuth(false);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (rareOnly) params.set('rare', 'true');
        const url = `${API}/bottles${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!mounted) return;

        if (res.status === 401) {
          setNeedsAuth(true);
          setBottles([]);
          return;
        }

        if (!res.ok) {
          const msg = (await res.text().catch(() => '')).trim();
          setError(msg || `Failed to load bottles (${res.status})`);
          setBottles([]);
          return;
        }

        const data = await res.json().catch(() => []);
        setBottles(Array.isArray(data) ? data : []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [rareOnly]);

  // search filter (keeps distillery searchable even though we don't display it)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bottles;
    return bottles.filter(b => {
      const hay = [b.brand, b.expression ?? '', b.distillery ?? '', b.style ?? ''].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [bottles, q]);

  // group ONLY by family; inside each family, sort by brand -> expression
  const groups = useMemo(() => {
    const famMap = new Map<string, Bottle[]>();
    for (const b of filtered) {
      const { family } = parseStyle(b.style);
      if (!famMap.has(family)) famMap.set(family, []);
      famMap.get(family)!.push(b);
    }
    // sort bottles within each family
    for (const [f, arr] of famMap) famMap.set(f, [...arr].sort(bottleSort));
    // sort families by preferred order, then alpha
    return Array.from(famMap.entries()).sort(([fa], [fb]) => familySort(fa, fb));
  }, [filtered]);

  if (loading) return <main><p>Loading…</p></main>;

  if (needsAuth) {
    const next = encodeURIComponent(pathname || '/bottles');
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
        <h1 style={{ marginBottom: 12 }}>Bottles</h1>
        <p style={{ color: 'salmon' }}>{error}</p>
      </main>
    );
  }

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Bottles</h1>
        <div style={{ marginLeft: 'auto' }}>
          {isAdmin && <Link href="/bottles/new">+ New Bottle</Link>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand / expression / distillery / style"
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={rareOnly}
            onChange={(e) => setRareOnly(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Rare only
        </label>
      </div>

      {groups.length === 0 ? (
        <p style={{ marginTop: 16 }}>No matching bottles.</p>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 22 }}>
          {groups.map(([family, items]) => (
            <section key={family}>
              <h2 style={{ marginBottom: 8 }}>
                {family}{' '}
                <span style={{ opacity: 0.6, fontSize: '0.9em' }}>({items.length})</span>
              </h2>

              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {items.map((b) => {
                  const leaf = styleLeaf(b.style);
                  return (
                    <li key={b.bottle_id} style={{ margin: '4px 0' }}>
                      <Link href={`/bottles/${b.bottle_id}`} style={{ fontWeight: 600 }}>
                        {b.brand}
                      </Link>
                      {b.is_rare ? (
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
                      {b.expression ? ` — ${b.expression}` : ''}
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
