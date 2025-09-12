'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type Bottle = {
  bottle_id: number;
  brand: string;
  expression?: string | null;
  distillery?: string | null;
  style?: string | null;
};

type Me = {
  username: string | null;
  email: string | null;
  role: 'guest' | 'admin';
  authenticated: boolean;
  lan_guest: boolean;
};

// --- helpers for family/substyle ---
const FAMILY_ORDER = ['Bourbon','Scotch','Rye','Irish','Japanese','Tennessee','Canadian','Uncategorized'] as const;
type Family = (typeof FAMILY_ORDER)[number];
const FAMILY_INDEX = new Map<Family, number>(FAMILY_ORDER.map((f, i) => [f, i]));

function parseStyle(style?: string | null): { family: string; sub: string } {
  if (!style || !style.trim()) return { family: 'Uncategorized', sub: 'General' };
  const parts = style.split(' - ').map(s => s.trim()).filter(Boolean);
  if (parts.length === 1) return { family: parts[0], sub: 'General' };
  return { family: parts[0], sub: parts.slice(1).join(' - ') };
}
function familyRank(name: string) { return FAMILY_INDEX.get(name as Family) ?? Number.MAX_SAFE_INTEGER; }
function familySort(a: string, b: string) { const ia = familyRank(a), ib = familyRank(b); return ia !== ib ? ia - ib : a.localeCompare(b); }
function bottleSort(a: Bottle, b: Bottle) { const ab = a.brand.localeCompare(b.brand); return ab !== 0 ? ab : (a.expression ?? '').localeCompare(b.expression ?? ''); }

export default function BottlesPage() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [me, setMe] = useState<Me | null>(null);

  // load auth state (guest vs admin)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
        const u: Me = r.ok ? await r.json() : { username:null, email:null, role:'guest', authenticated:false, lan_guest:true };
        if (mounted) setMe(u);
      } catch {
        if (mounted) setMe({ username:null, email:null, role:'guest', authenticated:false, lan_guest:true });
      }
    })();
    // optional: respond to login/logout events from the header
    const onAuthChanged = () => {
      fetch(`${API}/auth/me`, { credentials: 'include' })
        .then(r => r.json())
        .then(setMe)
        .catch(() => setMe({ username:null, email:null, role:'guest', authenticated:false, lan_guest:true }));
    };
    window.addEventListener('auth:changed', onAuthChanged);
    return () => { mounted = false; window.removeEventListener('auth:changed', onAuthChanged); };
  }, []);

  // load bottles
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API}/bottles`, { credentials: 'include' });
        const data = res.ok ? await res.json() : [];
        if (mounted) setBottles(Array.isArray(data) ? data : []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bottles;
    return bottles.filter(b => {
      const hay = [b.brand, b.expression ?? '', b.distillery ?? '', b.style ?? ''].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [bottles, q]);

  const tree = useMemo(() => {
    const famMap = new Map<string, Map<string, Bottle[]>>();
    for (const b of filtered) {
      const { family, sub } = parseStyle(b.style);
      if (!famMap.has(family)) famMap.set(family, new Map());
      const subMap = famMap.get(family)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(b);
    }
    for (const [, subMap] of famMap) {
      for (const [sub, arr] of subMap) subMap.set(sub, [...arr].sort(bottleSort));
    }
    return Array.from(famMap.entries())
      .sort(([fa], [fb]) => familySort(fa, fb))
      .map(([family, subMap]) => [family, Array.from(subMap.entries()).sort(([a], [b]) => a.localeCompare(b))] as const);
  }, [filtered]);

  if (loading) return <main><p>Loading…</p></main>;
  const isAdmin = me?.role === 'admin';

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Bottles</h1>
        <div style={{ marginLeft: 'auto' }}>
          {isAdmin && <Link href="/bottles/new">+ New Bottle</Link>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
      </div>

      {tree.length === 0 ? (
        <p style={{ marginTop: 16 }}>No matching bottles.</p>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 22 }}>
          {tree.map(([family, subList]) => {
            const familyCount = subList.reduce((n, [, arr]) => n + arr.length, 0);
            return (
              <section key={family}>
                <h2 style={{ marginBottom: 8 }}>
                  {family}{' '}
                  <span style={{ opacity: 0.6, fontSize: '0.9em' }}>({familyCount})</span>
                </h2>

                <div style={{ display: 'grid', gap: 10 }}>
                  {subList.map(([sub, items]) => (
                    <div key={family + '::' + sub}>
                      {sub !== 'General' && (
                        <h3 style={{ margin: '4px 0 6px', opacity: 0.9, fontSize: '1.05rem' }}>
                          {sub}{' '}
                          <span style={{ opacity: 0.6, fontSize: '0.9em' }}>({items.length})</span>
                        </h3>
                      )}
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {items.map((b) => (
                          <li key={b.bottle_id} style={{ margin: '4px 0' }}>
                            <Link href={`/bottles/${b.bottle_id}`} style={{ fontWeight: 600 }}>
                              {b.brand}
                            </Link>
                            {b.expression ? ` — ${b.expression}` : ''}
                            {b.distillery ? (
                              <span style={{ opacity: 0.7 }}> — {b.distillery}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
