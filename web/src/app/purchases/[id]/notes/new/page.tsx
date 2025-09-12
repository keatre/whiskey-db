'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState } from 'react';
import AdminOnly from '../../../../../components/AdminOnly';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export default function NewNotePage() {
  const router = useRouter();
  const params = useParams();
  const purchaseId = Number(params?.id);

  const [form, setForm] = useState({
    tasted_dt: '',
    nose: '',
    palate: '',
    finish: '',
    rating_100: ''
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      purchase_id: purchaseId,
      tasted_dt: form.tasted_dt || null,
      nose: form.nose || null,
      palate: form.palate || null,
      finish: form.finish || null,
      rating_100: form.rating_100 === '' ? null : Number(form.rating_100),
    };
    const res = await fetch(`${API}/notes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) router.push(`/purchases/${purchaseId}`);
    else alert('Save failed: ' + (await res.text()));
  }

  return (
    <AdminOnly>
      <main>
        <h1>New Tasting Note</h1>
        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: '200px 300px',
            gap: 8,
            alignItems: 'center',
            maxWidth: '720px',
          }}
        >
          <label>tasted_dt</label>
          <input
            type="datetime-local"
            value={form.tasted_dt}
            onChange={(e) => set('tasted_dt', e.target.value)}
            style={{ padding: 8 }}
          />

          <label>rating_100</label>
          <input
            value={form.rating_100}
            onChange={(e) => set('rating_100', e.target.value)}
            style={{ padding: 8 }}
          />

          <label>nose</label>
          <textarea
            value={form.nose}
            onChange={(e) => set('nose', e.target.value)}
            rows={2}
            style={{ padding: 8 }}
          />

          <label>palate</label>
          <textarea
            value={form.palate}
            onChange={(e) => set('palate', e.target.value)}
            rows={2}
            style={{ padding: 8 }}
          />

          <label>finish</label>
          <textarea
            value={form.finish}
            onChange={(e) => set('finish', e.target.value)}
            rows={2}
            style={{ padding: 8 }}
          />

          <div></div>
          <button type="submit" disabled={saving} style={{ padding: '8px 12px' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </main>
    </AdminOnly>
  );
}
