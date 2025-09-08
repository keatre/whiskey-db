'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Retailer = {
  retailer_id: number;
  name: string;
};

export default function NewPurchasePage() {
  const r = useRouter();
  const params = useParams();
  const bottleId = Number(params?.id);

  const [retailers, setRetailers] = useState<Retailer[]>([]);
  useEffect(() => {
    fetch(`${API}/retailers`).then(r=>r.json()).then(setRetailers).catch(()=>setRetailers([]));
  }, []);

  const [form, setForm] = useState({
    purchase_date: '',
    price_paid: '',
    tax_paid: '',
    quantity: '1',
    status: 'sealed',
    storage_location: '',
    location: '',
    retailer_id: ''
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      bottle_id: bottleId,
      purchase_date: form.purchase_date || null,
      price_paid: form.price_paid === '' ? null : Number(form.price_paid),
      tax_paid: form.tax_paid === '' ? null : Number(form.tax_paid),
      quantity: form.quantity === '' ? 1 : Number(form.quantity),
      status: form.status || null,
      storage_location: form.storage_location || null,
      location: form.location || null,
      retailer_id: form.retailer_id === '' ? null : Number(form.retailer_id),
      // allow setting opened/killed on creation (optional)
      opened_dt: null,
      killed_dt: null
    };
    const res = await fetch(`${API}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setSaving(false);
    if (res.ok) r.push(`/bottles/${bottleId}`);
    else alert('Save failed: ' + (await res.text()));
  }

  return (
    <main>
      <h1>New Purchase</h1>
      <form onSubmit={submit} style={{display:'grid', gridTemplateColumns:'220px 320px', gap:8, alignItems:'center', maxWidth:'760px'}}>
        <label>purchase_date</label>
        <input type="date" value={form.purchase_date} onChange={e=>set('purchase_date', e.target.value)} style={{padding:8}} />

        <label>price_paid</label>
        <input value={form.price_paid} onChange={e=>set('price_paid', e.target.value)} style={{padding:8}} />

        <label>tax_paid</label>
        <input value={form.tax_paid} onChange={e=>set('tax_paid', e.target.value)} style={{padding:8}} />

        <label>quantity</label>
        <input value={form.quantity} onChange={e=>set('quantity', e.target.value)} style={{padding:8}} />

        <label>status</label>
        <select value={form.status} onChange={e=>set('status', e.target.value)}>
          <option value="sealed">sealed</option>
          <option value="open">open</option>
          <option value="finished">finished</option>
        </select>

        <label>storage_location</label>
        <input value={form.storage_location} onChange={e=>set('storage_location', e.target.value)} style={{padding:8}} />

        <label>location</label>
        <input value={form.location} onChange={e=>set('location', e.target.value)} style={{padding:8}} />

        <label>retailer</label>
        <select value={form.retailer_id} onChange={e=>set('retailer_id', e.target.value)} style={{padding:8}}>
          <option value="">— none —</option>
          {retailers.map(r => <option key={r.retailer_id} value={r.retailer_id}>{r.name}</option>)}
        </select>

        <div></div>
        <div style={{fontSize:12}}>
          Need a new retailer? <a href="/retailers/new">Create one</a>, then come back.
        </div>

        <div></div>
        <button type="submit" disabled={saving} style={{padding:'8px 12px'}}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
    </main>
  );
}
