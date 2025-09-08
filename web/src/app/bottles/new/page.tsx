'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function NewBottlePage() {
  const r = useRouter();
  const [form, setForm] = useState({
    brand: '',
    expression: '',
    distillery: '',
    style: '',
    region: '',
    age: '',
    abv: '',
    size_ml: '',
    release_year: '',
    barcode_upc: '',
    notes_markdown: '',
    image_url: ''
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim()) return alert('Brand is required');
    setSaving(true);
    const payload: any = { ...form };
    ['age','abv','size_ml','release_year'].forEach(k => {
      if (payload[k] === '') delete payload[k];
      else payload[k] = Number(payload[k]);
    });
    const res = await fetch(`${API}/bottles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setSaving(false);
    if (res.ok) r.push('/bottles');
    else alert('Save failed: ' + (await res.text()));
  }

  return (
    <main>
      <h1>New Bottle</h1>
      <form onSubmit={submit} style={{display:'grid', gridTemplateColumns:'200px 300px', gap:8, alignItems:'center', maxWidth: '720px'}}>
        {['brand','expression','distillery','style','region','age','abv','size_ml','release_year','barcode_upc','image_url'].map((k) => (
          <>
            <label key={k+'l'} style={{textTransform:'capitalize'}}>{k.replace('_',' ')}</label>
            <input key={k}
              value={(form as any)[k]}
              onChange={e=>set(k as any, e.target.value)}
              style={{padding:8}}/>
          </>
        ))}
        <label>notes_markdown</label>
        <textarea value={form.notes_markdown} onChange={e=>set('notes_markdown', e.target.value)} rows={6} style={{padding:8}} />
        <div></div>
        <button type="submit" disabled={saving} style={{padding:'8px 12px'}}>{saving? 'Saving...' : 'Save'}</button>
      </form>
    </main>
  );
}
