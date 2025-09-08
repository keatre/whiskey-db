'use client';

import { useEffect, useState } from 'react';

type Bottle = {
  bottle_id: number;
  brand: string;
  expression?: string;
  distillery?: string;
};

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function BottlesPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Bottle[]>([]);

  async function load() {
    const res = await fetch(`${API}/bottles${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const data = await res.json();
    setRows(data);
  }

  useEffect(() => { load(); }, []);

  return (
    <main>
      <h1>Bottles</h1>
      <div style={{margin: '12px 0'}}>
        <input
          placeholder="Search brand / expression / distillery"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          style={{padding:8, width: 320}}
        />
        <button onClick={load} style={{marginLeft:8, padding:'8px 12px'}}>Search</button>
      </div>
      <ul>
        {rows.map(b => (
          <li key={b.bottle_id}>
            <strong>{b.brand}</strong>{b.expression ? ` — ${b.expression}` : ''}
            {b.distillery ? ` (${b.distillery})` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
