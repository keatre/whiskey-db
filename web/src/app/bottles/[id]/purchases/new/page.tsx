'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminOnly from '../../../../../components/AdminOnly';
import { useFormFieldIds } from '../../../../../lib/useFormFieldIds';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type Retailer = {
  retailer_id: number;
  name: string;
};

export default function NewPurchasePage() {
  const router = useRouter();
  const params = useParams();
  const bottleId = Number(params?.id);

  const [retailers, setRetailers] = useState<Retailer[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API}/retailers`, { credentials: 'include' });
        const data = res.ok ? await res.json() : [];
        if (mounted) setRetailers(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setRetailers([]);
      }
    })();
    return () => { mounted = false; };
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
  const field = useFormFieldIds('purchase-new');
  const fields = {
    purchase_date: field('purchase_date'),
    price_paid: field('price_paid'),
    tax_paid: field('tax_paid'),
    quantity: field('quantity'),
    status: field('status'),
    storage_location: field('storage_location'),
    location: field('location'),
    retailer_id: field('retailer_id'),
  };

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
      opened_dt: null,
      killed_dt: null
    };
    const res = await fetch(`${API}/purchases`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setSaving(false);
    if (res.ok) router.push(`/bottles/${bottleId}`);
    else alert('Save failed: ' + (await res.text()));
  }

  return (
    <AdminOnly>
      <main>
        <h1>New Purchase</h1>
        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 320px',
            gap: 8,
            alignItems: 'center',
            maxWidth: '760px'
          }}
        >
          <label htmlFor={fields.purchase_date.id}>purchase_date</label>
          <input
            {...fields.purchase_date}
            type="date"
            value={form.purchase_date}
            onChange={e => set('purchase_date', e.target.value)}
            style={{ padding: 8 }}
          />

          <label htmlFor={fields.price_paid.id}>price_paid</label>
          <input
            {...fields.price_paid}
            value={form.price_paid}
            onChange={e => set('price_paid', e.target.value)}
            style={{ padding: 8 }}
          />

          <label htmlFor={fields.tax_paid.id}>tax_paid</label>
          <input
            {...fields.tax_paid}
            value={form.tax_paid}
            onChange={e => set('tax_paid', e.target.value)}
            style={{ padding: 8 }}
          />

          <label htmlFor={fields.quantity.id}>quantity</label>
          <input
            {...fields.quantity}
            value={form.quantity}
            onChange={e => set('quantity', e.target.value)}
            style={{ padding: 8 }}
          />

          <label htmlFor={fields.status.id}>status</label>
          <select {...fields.status} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="sealed">sealed</option>
            <option value="open">open</option>
            <option value="finished">finished</option>
          </select>

          <label htmlFor={fields.storage_location.id}>storage_location</label>
          <input
            {...fields.storage_location}
            value={form.storage_location}
            onChange={e => set('storage_location', e.target.value)}
            style={{ padding: 8 }}
          />

          <label htmlFor={fields.location.id}>location</label>
          <input
            {...fields.location}
            value={form.location}
            onChange={e => set('location', e.target.value)}
            style={{ padding: 8 }}
          />

          <label htmlFor={fields.retailer_id.id}>retailer</label>
          <select
            {...fields.retailer_id}
            value={form.retailer_id}
            onChange={e => set('retailer_id', e.target.value)}
            style={{ padding: 8 }}
          >
            <option value="">— none —</option>
            {retailers.map(ret => (
              <option key={ret.retailer_id} value={ret.retailer_id}>
                {ret.name}
              </option>
            ))}
          </select>

          <div></div>
          <div style={{ fontSize: 12 }}>
            Need a new retailer? <a href="/retailers/new">Create one</a>, then come back.
          </div>

          <div></div>
          <button type="submit" disabled={saving} style={{ padding: '8px 12px' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </main>
    </AdminOnly>
  );
}
