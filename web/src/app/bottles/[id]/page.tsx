'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { currency } from '../../../lib/format';
import ReactMarkdown from 'react-markdown';

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

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
    <div style={{display:'grid', gridTemplateColumns:'160px 1fr', gap:12, padding:'6px 0', borderTop:'1px solid rgba(255,255,255,0.06)'}}>
      <div style={{opacity:0.7}}>{label}</div>
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
    async function load() {
      try {
        const [resB, resP] = await Promise.all([
          fetch(`${API}/bottles/${id}`),
          fetch(`${API}/purchases?bottle_id=${id}`)
        ]);

        if (resB.ok) {
          const b = await resB.json();
          setBottle(b);

          // Load market price by UPC, if present
          if (b?.barcode_upc) {
            try {
              const resV = await fetch(`${API}/valuation?upc=${encodeURIComponent(b.barcode_upc)}`);
              if (resV.ok) setValuation(await resV.json());
            } catch { /* ignore */ }
          } else {
            setValuation(null);
          }
        } else {
          setBottle(null);
          setValuation(null);
        }

        const p = resP.ok ? await resP.json() : [];
        setPurchases(Array.isArray(p) ? p : []);
      } catch {
        setBottle(null);
        setPurchases([]);
        setValuation(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Compute "your price" from purchases: prefer most recent purchase_date, else average
  const yourPrice = useMemo<number | null>(() => {
    if (!purchases.length) return null;
    const withDates = purchases
      .filter(p => p.price_paid != null)
      .sort((a, b) => (a.purchase_date || '').localeCompare(b.purchase_date || ''));
    if (withDates.length && withDates[withDates.length - 1].price_paid != null) {
      return withDates[withDates.length - 1].price_paid!;
    }
    // fallback: average of non-null prices
    const priced = purchases.map(p => p.price_paid).filter((x): x is number => x != null);
    if (!priced.length) return null;
    return Math.round((priced.reduce((s, n) => s + n, 0) / priced.length) * 100) / 100;
  }, [purchases]);

  // Market price from valuation
  const marketPrice = valuation?.price ?? null;

  // Delta
  const delta = (yourPrice != null && marketPrice != null) ? (marketPrice - yourPrice) : null;
  const deltaStr = delta == null ? undefined :
    `${delta >= 0 ? '+' : ''}${currency(delta)}`;

  if (loading) return <main><p>Loading…</p></main>;
  if (!bottle) return <main><p>Not found</p></main>;

  const abvStr   = bottle.abv != null ? `${bottle.abv}%` : undefined;
  const proofStr = bottle.proof != null ? `${bottle.proof}` : undefined;
  const ageStr   = bottle.age != null ? `${bottle.age} yrs` : undefined;
  const sizeStr  = bottle.size_ml != null ? `${bottle.size_ml} ml` : undefined;

  return (
    <main>
      {/* Title + Edit */}
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <h1 style={{margin:0}}>
          {bottle.brand}{bottle.expression ? ` — ${bottle.expression}` : ''}
        </h1>
        <div style={{marginLeft:'auto'}}>
          <Link href={`/bottles/${id}/edit`}>✏️ Edit Bottle</Link>
        </div>
      </div>

      {/* Image */}
      {bottle.image_url && (
        <div style={{margin: '12px 0'}}>
          <img
            src={`${bottle.image_url.startsWith('http') ? '' : API}${bottle.image_url}`}
            alt={`${bottle.brand} ${bottle.expression ?? ''}`}
            style={{maxWidth: 420, borderRadius: 8}}
          />
        </div>
      )}

      {/* Details */}
      <section className="card" style={{marginTop:16, padding:'12px 16px', borderRadius:8, background:'rgba(255,255,255,0.03)'}}>
        <h2 style={{marginTop:0}}>Details</h2>
        <div style={{marginTop:6}}>
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
      <section className="card" style={{marginTop:16, padding:'12px 16px', borderRadius:8, background:'rgba(255,255,255,0.03)'}}>
        <h2 style={{marginTop:0}}>Pricing</h2>
        <div style={{display:'grid', gridTemplateColumns:'160px 1fr', gap:12, marginTop:6}}>
          <div style={{opacity:0.7}}>Your Price</div>
          <div>{yourPrice != null ? currency(yourPrice) : '—'}</div>

          <div style={{opacity:0.7}}>Market Price</div>
          <div>
            {marketPrice != null ? (
              <>
                {currency(marketPrice)}
                {valuation?.source && <> <span style={{opacity:0.7}}>({valuation.source}</span>{valuation.as_of ? <span style={{opacity:0.7}}>, {valuation.as_of}</span> : null}<span style={{opacity:0.7}}>)</span></>}
              </>
            ) : '—'}
          </div>

          <div style={{opacity:0.7}}>Delta</div>
          <div style={{color: delta == null ? 'inherit' : (delta >= 0 ? 'var(--green, #4ade80)' : 'var(--red, #f87171)')}}>
            {deltaStr ?? '—'}
          </div>
        </div>
      </section>

      {/* Mash Bill */}
      {bottle.mashbill_markdown && (
        <section className="card" style={{marginTop:16, padding:'12px 16px', borderRadius:8, background:'rgba(255,255,255,0.03)'}}>
          <h2 style={{marginTop:0}}>Mash Bill</h2>
          <div style={{whiteSpace:'pre-wrap'}}>
            <ReactMarkdown>{bottle.mashbill_markdown}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* Notes */}
      {bottle.notes_markdown && (
        <section className="card" style={{marginTop:16, padding:'12px 16px', borderRadius:8, background:'rgba(255,255,255,0.03)'}}>
          <h2 style={{marginTop:0}}>Notes</h2>
          <div style={{whiteSpace:'pre-wrap'}}>
            <ReactMarkdown>{bottle.notes_markdown}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* Purchases */}
      <h2 style={{marginTop:16}}>Purchases</h2>
      <Link href={`/bottles/${id}/purchases/new`}>+ Add Purchase</Link>
      <ul style={{marginTop:8}}>
        {purchases.map(p => (
          <li key={p.purchase_id}>
            {p.purchase_date ?? '—'} · qty {p.quantity} · {currency(p.price_paid)} · {p.status ?? '—'}
            {' '}<Link href={`/purchases/${p.purchase_id}`}>Open</Link>
          </li>
        ))}
        {purchases.length === 0 && <li>No purchases yet.</li>}
      </ul>
    </main>
  );
}
