'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminOnly from '../../../components/AdminOnly';
import { useFormFieldIds } from '../../../lib/useFormFieldIds';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export default function NewRetailerPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    type: '',
    website: '',
    city: '',
    state: '',
    country: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const field = useFormFieldIds('retailer-new');
  const noteField = field('notes');

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return alert('Name is required');
    setSaving(true);

    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null; });

    const res = await fetch(`${API}/retailers`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setSaving(false);
    if (res.ok) router.push('/retailers');
    else alert('Save failed: ' + (await res.text()));
  }

  return (
    <AdminOnly>
      <main>
        <h1>New Retailer</h1>
        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: '200px 300px',
            gap: 8,
            alignItems: 'center',
            maxWidth: '720px'
          }}
        >
          {(['name','type','website','city','state','country'] as const).map((k) => {
            const info = field(k);
            return (
              <div key={k} style={{ display: 'contents' }}>
                <label htmlFor={info.id} style={{ textTransform: 'capitalize' }}>{k}</label>
                <input {...info} value={form[k]} onChange={e => set(k, e.target.value)} style={{ padding: 8 }} />
              </div>
            );
          })}
          <label htmlFor={noteField.id}>notes</label>
          <textarea {...noteField} value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ padding: 8 }} />
          <div></div>
          <button type="submit" disabled={saving} style={{ padding: '8px 12px' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </main>
    </AdminOnly>
  );
}
