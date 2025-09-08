'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { currency } from '../../../lib/format';

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
};

type Purchase = {
  purchase_id: number;
  bottle_id: number;
  purchase_date?: string;
  price_paid?: number;
  quantity: number;
  status?: string;
};

export default function BottleDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const [bottle, setBottle] = useState<Bottle | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const b = await fetch(`${API}/bottles/${id}`).then(r=>r.json());
      const p = await fetch(`${API}/purchases?bottle_id=${id}`).then(r=>r.json());
      setBottle(b);
      setPurchases(p);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <main><p>Loading…</p></main>;
  if (!bottle) return <main><p>Not found</p></main>;

  return (
    <main>
      <h1>{bottle.brand}{bottle.expression ? ` — ${bottle.expression}` : ''}</h1>
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
