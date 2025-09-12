'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { currency } from '../../../lib/format';
import AdminOnly from '../../../components/AdminOnly';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type Purchase = {
  purchase_id: number;
  bottle_id: number;
  purchase_date?: string;
  price_paid?: number;
  tax_paid?: number;
  quantity: number;
  status?: string;
  storage_location?: string;
  location?: string;
  retailer_id?: number;
  opened_dt?: string;
  killed_dt?: string;
};

type Note = {
  note_id: number;
  purchase_id: number;
  tasted_dt?: string;
  rating_100?: number;
  nose?: string; palate?: string; finish?: string;
};

type Retailer = { retailer_id: number; name: string };

export default function PurchaseDetailPage() {
  const params = useParams();
  const id = Number(params?.id);

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const resP = await fetch(`${API}/purchases/${id}`, { credentials: 'include' });
        const p = resP.ok ? await resP.json() : null;
        if (!mounted) return;
        setPurchase(p);

        if (p?.retailer_id) {
          try {
            const resR = await fetch(`${API}/retailers/${p.retailer_id}`, { credentials: 'include' });
            const r = resR.ok ? await resR.json() : null;
            if (mounted) setRetailer(r);
          } catch { /* ignore */ }
        } else {
          setRetailer(null);
        }

        const resN = await fetch(`${API}/notes?purchase_id=${id}`, { credentials: 'include' });
        const n = resN.ok ? await resN.json() : [];
        if (mounted) setNotes(Array.isArray(n) ? n : []);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <main><p>Loading…</p></main>;
  if (!purchase) return <main><p>Not found</p></main>;

  return (
    <main>
      <h1>Purchase #{purchase.purchase_id}</h1>
      <p>
        Date: {purchase.purchase_date ?? '—'} · Qty: {purchase.quantity} ·
        {' '}Price: {currency(purchase.price_paid)}
        {purchase.tax_paid != null ? ` (+ tax ${currency(purchase.tax_paid)})` : ''} ·
        {' '}Status: {purchase.status ?? '—'}
      </p>
      <p>Storage: {purchase.storage_location ?? '—'} · Location: {purchase.location ?? '—'}</p>
      <p>Retailer: {retailer ? retailer.name : (purchase.retailer_id ?? '—')}</p>
      <p>Opened: {purchase.opened_dt ?? '—'} · Killed: {purchase.killed_dt ?? '—'}</p>

      {/* Admin-only: edit purchase */}
      <div style={{ margin: '12px 0' }}>
        <AdminOnly>
          <Link href={`/purchases/${purchase.purchase_id}/edit`}>✏️ Edit Purchase</Link>
        </AdminOnly>
      </div>

      <h2 style={{ marginTop: 16 }}>Tasting Notes</h2>
      {/* Admin-only: add note */}
      <AdminOnly>
        <Link href={`/purchases/${id}/notes/new`}>+ Add Note</Link>
      </AdminOnly>

      <ul style={{ marginTop: 8 }}>
        {notes.map((n) => (
          <li key={n.note_id} id={`note-${n.note_id}`} style={{ marginBottom: 10 }}>
            {n.tasted_dt ?? '—'} · Rating: {n.rating_100 ?? '—'}
            <div><em>Nose:</em> {n.nose ?? '—'}</div>
            <div><em>Palate:</em> {n.palate ?? '—'}</div>
            <div><em>Finish:</em> {n.finish ?? '—'}</div>
          </li>
        ))}
        {notes.length === 0 && <li>No notes yet.</li>}
      </ul>

      <div style={{ marginTop: 16 }}>
        <Link href={`/bottles/${purchase.bottle_id}`}>← Back to Bottle</Link>
      </div>
    </main>
  );
}
