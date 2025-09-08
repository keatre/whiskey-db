'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Retailer = {
  retailer_id: number;
  name: string;
  type?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
};

export default function RetailersPage() {
  const [rows, setRows] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetch(`${API}/retailers`).then(r=>r.json());
    setRows(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function remove(id: number) {
    if (!confirm('Delete this retailer? This cannot be undone.')) return;
    const res = await fetch(`${API}/retailers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows(prev => prev.filter(r => r.retailer_id !== id));
    } else {
      alert('Delete failed: ' + (await res.text()));
    }
  }

  return (
    <main>
      <h1>Retailers</h1>
      <div style={{margin: '12px 0'}}>
        <Link href="/retailers/new">+ New Retailer</Link>
      </div>

      {loading ? <p>Loading…</p> : (
        <div className="card">
          <ul>
            {rows.map(r => (
              <li key={r.retailer_id} style={{margin: '8px 0'}}>
                <strong>{r.name}</strong>
                {r.city ? ` — ${r.city}` : ''}{r.state ? `, ${r.state}` : ''}{r.country ? ` (${r.country})` : ''}
                {r.website ? <> · <a href={r.website} target="_blank">site</a></> : null}
                {' '}· <Link href={`/retailers/${r.retailer_id}/edit`}>Edit</Link>
                {' '}· <button onClick={()=>remove(r.retailer_id)} style={{marginLeft:4}}>Delete</button>
              </li>
            ))}
            {rows.length === 0 && <li>No retailers yet.</li>}
          </ul>
        </div>
      )}
    </main>
  );
}
