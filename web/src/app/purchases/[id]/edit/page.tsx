'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminOnly from '../../../../components/AdminOnly';
import { useFormFieldIds } from '../../../../lib/useFormFieldIds';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

type Retailer = { retailer_id: number; name: string };

export default function EditPurchasePage() {
  const params = useParams();
  const id = Number(params?.id);
  const router = useRouter();

  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const field = useFormFieldIds('purchase-edit');
  const fields = {
    purchase_date: field('purchase_date'),
    price_paid: field('price_paid'),
    tax_paid: field('tax_paid'),
    quantity: field('quantity'),
    status: field('status'),
    storage_location: field('storage_location'),
    location: field('location'),
    retailer_id: field('retailer_id'),
    opened_dt: field('opened_dt'),
    killed_dt: field('killed_dt'),
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [resP, resR] = await Promise.all([
          fetch(`${API}/purchases/${id}`, { credentials: 'include' }),
          fetch(`${API}/retailers`, { credentials: 'include' }).catch(() => null),
        ]);

        const p = resP.ok ? await resP.json() : null;
        const rs = resR && resR.ok ? await resR.json() : [];

        if (!mounted) return;

       setForm({
          purchase_date: p?.purchase_date ?? '',
          price_paid: p?.price_paid ?? '',
          tax_paid: p?.tax_paid ?? '',
          quantity: p?.quantity ?? 1,
          status: p?.status ?? 'sealed',
          storage_location: p?.storage_location ?? '',
          location: p?.location ?? '',
          retailer_id: p?.retailer_id ?? '',
          opened_dt: normalizeDate(p?.opened_dt),
          killed_dt: normalizeDate(p?.killed_dt),
          bottle_id: p?.bottle_id,
        });

        setRetailers(Array.isArray(rs) ? rs : []);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm((prev: any) => ({ ...prev, [k]: v }));
  }

  function normalizeDate(value?: string | null) {
    if (!value) return '';
    const part = value.split('T')[0];
    return part ?? '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload: any = { ...form };

    // clean + coerce numeric fields
    ['price_paid', 'tax_paid', 'quantity', 'retailer_id'].forEach((k) => {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
      else if (k === 'quantity' || k === 'retailer_id') payload[k] = Number(payload[k]);
      else payload[k] = Number(payload[k]);
    });

    // clean empty strings to unset
    ['purchase_date', 'opened_dt', 'killed_dt', 'status', 'storage_location', 'location'].forEach((k) => {
      if (payload[k] === '') delete payload[k];
    });

    // do not allow switching bottle on edit
    delete payload.bottle_id;

    const res = await fetch(`${API}/purchases/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) router.push(`/purchases/${id}`);
    else alert('Update failed: ' + (await res.text()));
  }

  if (loading) return <main><p>Loading…</p></main>;

  return (
    <AdminOnly>
      <main>
        <h1>Edit Purchase #{id}</h1>
        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 320px',
            gap: 8,
            alignItems: 'center',
            maxWidth: '760px',
          }}
        >
          <label htmlFor={fields.purchase_date.id}>purchase_date</label>
          <input
            {...fields.purchase_date}
            type="date"
            value={form.purchase_date}
            onChange={(e) => set('purchase_date', e.target.value)}
          />

          <label htmlFor={fields.price_paid.id}>price_paid</label>
          <input
            {...fields.price_paid}
            value={form.price_paid}
            onChange={(e) => set('price_paid', e.target.value)}
          />

          <label htmlFor={fields.tax_paid.id}>tax_paid</label>
          <input
            {...fields.tax_paid}
            value={form.tax_paid}
            onChange={(e) => set('tax_paid', e.target.value)}
          />

          <label htmlFor={fields.quantity.id}>quantity</label>
          <input
            {...fields.quantity}
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
          />

          <label htmlFor={fields.status.id}>status</label>
          <select {...fields.status} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="sealed">sealed</option>
            <option value="open">open</option>
            <option value="finished">finished</option>
          </select>

          <label htmlFor={fields.storage_location.id}>storage_location</label>
          <input
            {...fields.storage_location}
            value={form.storage_location}
            onChange={(e) => set('storage_location', e.target.value)}
          />

          <label htmlFor={fields.location.id}>location</label>
          <input
            {...fields.location}
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          />

          <label htmlFor={fields.retailer_id.id}>retailer</label>
          <select
            {...fields.retailer_id}
            value={form.retailer_id}
            onChange={(e) => set('retailer_id', e.target.value)}
          >
            <option value="">— none —</option>
            {retailers.map((ret) => (
              <option key={ret.retailer_id} value={ret.retailer_id}>
                {ret.name}
              </option>
            ))}
          </select>

          <label htmlFor={fields.opened_dt.id}>opened_dt</label>
          <input
            {...fields.opened_dt}
            type="date"
            value={form.opened_dt}
            onChange={(e) => set('opened_dt', e.target.value)}
          />

          <label htmlFor={fields.killed_dt.id}>killed_dt</label>
          <input
            {...fields.killed_dt}
            type="date"
            value={form.killed_dt}
            onChange={(e) => set('killed_dt', e.target.value)}
          />

          <div></div>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </main>
    </AdminOnly>
  );
}
