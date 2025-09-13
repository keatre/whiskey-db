'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiPath } from "../../../lib/apiPath";
import { currency } from '../../../lib/format';
import MarkdownViewer from '../../../components/MarkdownViewer';
import AdminOnly from '../../../components/AdminOnly';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

// Inline fallback placeholder (no 404 loop)
const PLACEHOLDER_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="16" fill="#222"/>
  <g fill="none" stroke="#888" stroke-width="8" stroke-linecap="round">
    <rect x="96" y="36" width="64" height="28" rx="6"/>
    <path d="M104 64h48v16c0 6-3 12-8 16l-8 6v96c0 8-6 14-14 14s-14-6-14-14v-96l-8-6c-5-4-8-10-8-16V64z"/>
    <line x1="112" y1="140" x2="144" y2="140"/>
    <line x1="112" y1="164" x2="144" y2="164"/>
  </g>
</svg>`);

type Bottle = {
  bottle_id: number;
  brand: string;
  expression?: string;
  distillery?: string;
  style?: string;
  region?: string;
  age?: number;
  abv?: number;
  proof?: number;
  size_ml?: number;
  release_year?: number;
  barcode_upc?: string;
  image_url?: string;
  mashbill_markdown?: string;
  notes_markdown?: string;
};

type Purchase = {
  purchase_id: number;
  bottle_id: number;
  purchase_date?: string;   // ISO (YYYY-MM-DD)
  price_paid?: number;
  quantity: number;
  status?: string;
};

type Valuation = {
  barcode_upc: string;
  price: number | null;
  currency?: string | null;
  source?: string | null;
  as_of?: string | null;
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: 12,
        padding: '6px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function BottleDetailPage() {
  const params = useParams();
  const id = Number(params?.id);

  const [bottle, setBottle] = useState<Bottle | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [resB, resP] = await Promise.all([
          fetch(`${API}/bottles/${id}`, { credentials: 'include' }),
          fetch(`${API}/purchases?bottle_id=${id}`, { credentials: 'include' }),
        ]);

        if (resB.ok) {
          const b = await resB.json();
          if (!mounted) return;
          setBottle(b);

          // Load market price by UPC, if present
          if (b?.barcode_upc) {
            try {
              const resV = await fetch(
                `${API}/valuation?upc=${encodeURIComponent(b.barcode_upc)}`,
                { credentials: 'include' }
              );
              if (mounted && resV.ok) setValuation(await resV.json());
            } catch {
              /* ignore */
            }
          } else {
            setValuation(null);
          }
        } else {
          if (!mounted) return;
          setBottle(null);
          setValuation(null);
        }

        const p = resP.ok ? await resP.json() : [];
        if (!mounted) return;
        setPurchases(Array.isArray(p) ? p : []);
      } catch {
        if (!mounted) return;
        setBottle(null);
        setPurchases([]);
        setValuation(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Compute "your price" from purchases: prefer most recent purchase_date, else average
  const yourPrice = useMemo<number | null>(() => {
    if (!purchases.length) return null;
    const withDates = purchases
      .filter((p) => p.price_paid != null)
      .sort((a, b) => (a.purchase_date || '').localeCompare(b.purchase_date || ''));
    if (withDates.length && withDates[withDates.length - 1].price_paid != null) {
      return withDates[withDates.length - 1].price_paid!;
    }
    // fallback: average of non-null prices
    const priced = purchases.map((p) => p.price_paid).filter((x): x is number => x != null);
    if (!priced.length) return null;
    return Math.round((priced.reduce((s, n) => s + n, 0) / priced.length) * 100) / 100;
  }, [purchases]);

  const marketPrice = valuation?.price ?? null;

  // Delta
  const delta = yourPrice != null && marketPrice != null ? marketPrice - yourPrice : null;
  const deltaStr =
    delta == null ? undefined : `${delta >= 0 ? '+' : ''}${currency(delta)}`;

  if (loading) return <main><p>Loading…</p></main>;
  if (!bottle) return <main><p>Not found</p></main>;

  const abvStr = bottle.abv != null ? `${bottle.abv}%` : undefined;
  const proofStr = bottle.proof != null ? `${bottle.proof}` : undefined;
  const ageStr = bottle.age != null ? `${bottle.age} yrs` : undefined;
  const sizeStr = bottle.size_ml != null ? `${bottle.size_ml} ml` : undefined;

  return (
    <main>
      {/* Title + (admin-only) Edit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          {bottle.brand}
          {bottle.expression ? ` — ${bottle.expression}` : ''}
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <AdminOnly>
            <Link href={`/bottles/${id}/edit`}>✏️ Edit Bottle</Link>
          </AdminOnly>
        </div>
      </div>

      {/* Image */}
      {bottle.image_url && (
        <div style={{ margin: '12px 0' }}>
          <img
            src={apiPath(bottle.image_url)}
            alt={`${bottle.brand} ${bottle.expression ?? ''}`}
            style={{ maxWidth: 420, borderRadius: 8 }}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.onerror = null;           // prevent infinite loop
              img.src = PLACEHOLDER_SVG;    // inline fallback
            }}
          />
        </div>
      )}

      {/* Details */}
      <section
        className="card"
        style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Details</h2>
        <div style={{ marginTop: 6 }}>
          <Row label="Style" value={bottle.style} />
          <Row label="Region" value={bottle.region} />
          <Row label="Distillery" value={bottle.distillery} />
          <Row label="Age" value={ageStr} />
          <Row label="ABV" value={abvStr} />
          <Row label="Proof" value={proofStr} />
          <Row label="Size" value={sizeStr} />
          <Row label="Release Year" value={bottle.release_year} />
          <Row label="Barcode / UPC" value={bottle.barcode_upc} />
        </div>
      </section>

      {/* Pricing */}
      <section
        className="card"
        style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Pricing</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginTop: 6 }}>
          <div style={{ opacity: 0.7 }}>Your Price</div>
          <div>{yourPrice != null ? currency(yourPrice) : '—'}</div>

          <div style={{ opacity: 0.7 }}>Market Price</div>
          <div>
            {marketPrice != null ? (
              <>
                {currency(marketPrice)}
                {valuation?.source && (
                  <>
                    {' '}
                    <span style={{ opacity: 0.7 }}>( {valuation.source}
                    {valuation.as_of ? <span style={{ opacity: 0.7 }}>, {valuation.as_of}</span> : null}
                    )</span>
                  </>
                )}
              </>
            ) : (
              '—'
            )}
          </div>

          <div style={{ opacity: 0.7 }}>Delta</div>
          <div
            style={{
              color:
                delta == null
                  ? 'inherit'
                  : delta >= 0
                  ? 'var(--green, #4ade80)'
                  : 'var(--red, #f87171)',
            }}
          >
            {deltaStr ?? '—'}
          </div>
        </div>
      </section>

      {/* Mash Bill or Barrel */}
      {bottle.mashbill_markdown && (
        <section
          className="card"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Mash Bill / Barrel Info</h2>
          <MarkdownViewer>{bottle.mashbill_markdown}</MarkdownViewer>
        </section>
      )}

      {/* Notes */}
      {bottle.notes_markdown && (
        <section
          className="card"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Notes</h2>
          <MarkdownViewer>{bottle.notes_markdown}</MarkdownViewer>
        </section>
      )}

      {/* Purchases */}
      <section
        className="card"
        style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Purchases</h2>
        <ul style={{ marginTop: 8, listStyle: 'none', paddingLeft: 0 }}>
          {purchases.map((p) => (
            <li
              key={p.purchase_id}
              style={{
                marginBottom: 12,
                padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div>
                <strong>{p.purchase_date ?? '—'}</strong> · qty {p.quantity} ·{' '}
                {currency(p.price_paid)} · {p.status ?? '—'}
              </div>
              <div style={{ marginTop: 4 }}>
                <Link href={`/purchases/${p.purchase_id}`}>View</Link>
              </div>
            </li>
          ))}
          {purchases.length === 0 && <li>No purchases yet.</li>}
        </ul>

        {/* Admin-only: Add Purchase */}
        <AdminOnly>
          <Link href={`/bottles/${id}/purchases/new`}>+ Add Purchase</Link>
        </AdminOnly>
      </section>
    </main>
  );
}
