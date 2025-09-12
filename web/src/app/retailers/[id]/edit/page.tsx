'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminOnly from '../../../../components/AdminOnly';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export default function EditRetailerPage() {
  const params = useParams();
  const id = Number(params?.id);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API}/retailers/${id}`, { credentials: 'include' });
        const data = res.ok ? await res.json() : null;
        if (!mounted) return;
        setForm({
          name: data?.name ?? '',
          type: data?.type ?? '',
          website: data?.website ?? '',
          city: data?.city ?? '',
          state: data?.state ?? '',
          country: data?.country ?? '',
          notes: data?.notes ?? '',
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: any = { ...form };
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });

    const res = await fetch(`${API}/retailers/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setSaving(false);
    if (res.ok) router.push('/retailers');
    else alert('Update failed: ' + (await res.text()));
  }

  async function remove() {
    if (!confirm('Delete this retailer? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`${API}/retailers/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    setDeleting(false);
    if (res.ok) router.push('/retailers');
    else alert('Delete failed: ' + (await res.text()));
  }

  if (loading) return <main><p>Loading…</p></main>;

  return (
    <AdminOnly>
      <main>
        <h1>Edit Retailer</h1>
        <form
          onSubmit={submit}
          style={{ display: 'grid', gridTemplateColumns: '200px 320px', gap: 8, alignItems: 'center', maxWidth: '760px' }}
        >
          {(['name','type','website','city','state','country'] as const).map((k) => (
            <div key={k} style={{ display: 'contents' }}>
              <label style={{ textTransform: 'capitalize' }}>{k}</label>
              <input value={form[k]} onChange={e => set(k, e.target.value)} />
            </div>
          ))}

          <label>notes</label>
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />

          <div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" onClick={remove} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </form>
      </main>
    </AdminOnly>
  );
}
