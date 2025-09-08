'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function EditRetailerPage() {
  const params = useParams();
  const id = Number(params?.id);
  const r = useRouter();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    type: '',
    website: '',
    city: '',
    state: '',
    country: '',
    notes: ''
  });

  useEffect(() => {
    async function load() {
      const data = await fetch(`${API}/retailers/${id}`).then(r=>r.json());
      setForm({
        name: data.name ?? '',
        type: data.type ?? '',
        website: data.website ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        country: data.country ?? '',
        notes: data.notes ?? '',
      });
      setLoading(false);
    }
    load();
  }, [id]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { ...form };
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
    const res = await fetch(`${API}/retailers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) r.push('/retailers');
    else alert('Update failed: ' + (await res.text()));
  }

  async function remove() {
    if (!confirm('Delete this retailer? This cannot be undone.')) return;
    const res = await fetch(`${API}/retailers/${id}`, { method: 'DELETE' });
    if (res.ok) r.push('/retailers');
    else alert('Delete failed: ' + (await res.text()));
  }

  if (loading) return <main><p>Loading…</p></main>;

  return (
    <main>
      <h1>Edit Retailer</h1>
      <form onSubmit={submit} style={{display:'grid', gridTemplateColumns:'200px 320px', gap:8, alignItems:'center', maxWidth:'760px'}}>
        {['name','type','website','city','state','country'].map(k => (
          <>
            <label key={k+'l'} style={{textTransform:'capitalize'}}>{k}</label>
            <input key={k} value={(form as any)[k]} onChange={e=>set(k as any, e.target.value)} />
          </>
        ))}
        <label>notes</label>
        <textarea value={form.notes} onChange={e=>set('notes', e.target.value)} rows={3} />
        <div></div>
        <div style={{display:'flex', gap:8}}>
          <button type="submit">Save Changes</button>
          <button type="button" onClick={remove}>Delete</button>
        </div>
      </form>
    </main>
  );
}
