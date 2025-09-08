'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Retailer = { retailer_id: number; name: string; };

export default function EditPurchasePage() {
  const params = useParams();
  const id = Number(params?.id);
  const r = useRouter();

  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    async function load() {
      const [p, rs] = await Promise.all([
        fetch(`${API}/purchases/${id}`).then(r=>r.json()),
        fetch(`${API}/retailers`).then(r=>r.json()).catch(()=>[])
      ]);
      setForm({
        purchase_date: p.purchase_date ?? '',
        price_paid: p.price_paid ?? '',
        tax_paid: p.tax_paid ?? '',
        quantity: p.quantity ?? 1,
        status: p.status ?? 'sealed',
        storage_location: p.storage_location ?? '',
        location: p.location ?? '',
        retailer_id: p.retailer_id ?? '',
        opened_dt: p.opened_dt ?? '',
        killed_dt: p.killed_dt ?? '',
        bottle_id: p.bottle_id
      });
      setRetailers(rs);
      setLoading(false);
    }
    load();
  }, [id]);

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm((prev: any) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { ...form };
    // clean + coerce
    ['price_paid','tax_paid','quantity','retailer_id'].forEach(k => {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
      else if (k === 'quantity' || k === 'retailer_id') payload[k] = Number(payload[k]);
      else payload[k] = Number(payload[k]);
    });
    ['purchase_date','opened_dt','killed_dt','status','storage_location','location'].forEach(k => {
      if (payload[k] === '') delete payload[k];
    });
    delete payload.bottle_id; // not changing bottle via edit here

    const res = await fetch(`${API}/purchases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) r.push(`/purchases/${id}`);
    else alert('Update failed: ' + (await res.text()));
  }

  if (loading) return <main><p>Loading…</p></main>;

  return (
    <main>
      <h1>Edit Purchase #{id}</h1>
      <form onSubmit={submit} style={{display:'grid', gridTemplateColumns:'220px 320px', gap:8, alignItems:'center', maxWidth:'760px'}}>
        <label>purchase_date</label>
        <input type="date" value={form.purchase_date} onChange={e=>set('purchase_date', e.target.value)} />

        <label>price_paid</label>
        <input value={form.price_paid} onChange={e=>set('price_paid', e.target.value)} />

        <label>tax_paid</label>
        <input value={form.tax_paid} onChange={e=>set('tax_paid', e.target.value)} />

        <label>quantity</label>
        <input value={form.quantity} onChange={e=>set('quantity', e.target.value)} />

        <label>status</label>
        <select value={form.status} onChange={e=>set('status', e.target.value)}>
          <option value="sealed">sealed</option>
          <option value="open">open</option>
          <option value="finished">finished</option>
        </select>

        <label>storage_location</label>
        <input value={form.storage_location} onChange={e=>set('storage_location', e.target.value)} />

        <label>location</label>
        <input value={form.location} onChange={e=>set('location', e.target.value)} />

        <label>retailer</label>
        <select value={form.retailer_id} onChange={e=>set('retailer_id', e.target.value)}>
          <option value="">— none —</option>
          {retailers.map(rr => <option key={rr.retailer_id} value={rr.retailer_id}>{rr.name}</option>)}
        </select>

        <label>opened_dt</label>
        <input type="datetime-local" value={form.opened_dt} onChange={e=>set('opened_dt', e.target.value)} />

        <label>killed_dt</label>
        <input type="datetime-local" value={form.killed_dt} onChange={e=>set('killed_dt', e.target.value)} />

        <div></div>
        <button type="submit">Save Changes</button>
      </form>
    </main>
  );
}
