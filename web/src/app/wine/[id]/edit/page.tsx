'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminOnly from '../../../../components/AdminOnly';
import { useModules } from '../../../../lib/useModules';

const API = (process.env.NEXT_PUBLIC_API_BASE || '/api').replace(/\/+$/, '');

function joinApi(path: string) {
  const p = path.replace(/^\/+/, '');
  return `${API}/${p}`;
}

function toPreviewUrl(u?: string | null) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/api/')) return u;
  if (API && u.startsWith(API + '/')) return u;
  return joinApi(u);
}

const STYLE_GROUPS: Record<string, string[]> = {
  Red: ['Cabernet Sauvignon', 'Merlot', 'Pinot Noir', 'Syrah'],
  White: ['Chardonnay', 'Sauvignon Blanc', 'Riesling', 'Pinot Grigio'],
  Rose: ['Dry', 'Sweet'],
  Sparkling: ['Brut', 'Extra Dry', 'Rosé'],
  Dessert: ['Late Harvest', 'Ice Wine'],
  Fortified: ['Port', 'Sherry'],
};

const STYLE_OPTIONS = Object.entries(STYLE_GROUPS)
  .flatMap(([fam, vars]) => vars.map((v) => `${fam} - ${v}`))
  .concat('Custom…');

export default function EditWinePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();
  const { modules } = useModules();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    brand: '',
    expression: '',
    winery: '',
    stylePicker: '',
    styleCustom: '',
    region: '',
    vintage_year: '',
    abv: '',
    size_ml: '',
    barcode_upc: '',
    notes_markdown: '',
    image_url: '',
    is_rare: false,
  });

  useEffect(() => {
    let mounted = true;
    if (!modules.wine) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(joinApi(`/wine/${id}`), { credentials: 'include' });
        const w = res.ok ? await res.json() : null;
        const styleKnown = w?.style && STYLE_OPTIONS.includes(w.style);
        if (!mounted) return;

        setForm({
          brand: w?.brand ?? '',
          expression: w?.expression ?? '',
          winery: w?.winery ?? '',
          stylePicker: styleKnown ? w.style : w?.style ? 'Custom…' : '',
          styleCustom: styleKnown ? '' : w?.style ?? '',
          region: w?.region ?? '',
          vintage_year: w?.vintage_year ?? '',
          abv: w?.abv ?? '',
          size_ml: w?.size_ml ?? '',
          barcode_upc: w?.barcode_upc ?? '',
          notes_markdown: w?.notes_markdown ?? '',
          image_url: w?.image_url ?? '',
          is_rare: Boolean(w?.is_rare),
        });

        if (w?.image_url) {
          setPreviewUrl(toPreviewUrl(w.image_url));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (!Number.isNaN(id)) load();
    return () => {
      mounted = false;
    };
  }, [id, modules.wine]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(joinApi('/uploads/image'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set('image_url', data.url);
      setPreviewUrl(toPreviewUrl(data.url));
    } catch (err: any) {
      setUploadError(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    let style: string | null = null;
    if (form.stylePicker === 'Custom…') style = form.styleCustom.trim() || null;
    else if (form.stylePicker) style = form.stylePicker;

    const raw: any = {
      brand: form.brand || null,
      expression: form.expression || null,
      winery: form.winery || null,
      style,
      region: form.region || null,
      barcode_upc: form.barcode_upc || null,
      notes_markdown: form.notes_markdown || null,
      image_url: form.image_url || null,
      is_rare: form.is_rare,
    };

    ([
      ['vintage_year', 'int'],
      ['abv', 'float'],
      ['size_ml', 'int'],
    ] as const).forEach(([k, t]) => {
      const v = (form as any)[k];
      if (v === '') return;
      const num = t === 'int' ? parseInt(v, 10) : parseFloat(v);
      if (!Number.isNaN(num)) raw[k] = num;
    });

    const payload: any = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (v === null || v === '') return;
      payload[k] = v;
    });

    const res = await fetch(joinApi(`/wine/${id}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) router.push(`/wine/${id}`);
    else alert('Save failed: ' + (await res.text()));
  }

  async function doDelete() {
    if (!confirm('Delete this wine entry?')) return;
    setDeleting(true);
    const res = await fetch(joinApi(`/wine/${id}`), {
      method: 'DELETE',
      credentials: 'include',
    });
    setDeleting(false);
    if (res.ok) router.push('/wine');
    else alert('Delete failed: ' + (await res.text()));
  }

  if (loading) return <AdminOnly><main><p>Loading…</p></main></AdminOnly>;

  if (!modules.wine) {
    return (
      <AdminOnly>
        <main>
          <h1>Edit Wine</h1>
          <p>The Wine module is not enabled.</p>
        </main>
      </AdminOnly>
    );
  }

  return (
    <AdminOnly>
      <main>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0 }}>Edit Wine</h1>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={doDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 420px',
            gap: 10,
            alignItems: 'center',
            maxWidth: '980px',
          }}
        >
          <label>Brand</label>
          <input value={form.brand} onChange={(e) => set('brand', e.target.value)} />

          <label>Expression</label>
          <input value={form.expression} onChange={(e) => set('expression', e.target.value)} />

          <label>Winery</label>
          <input value={form.winery} onChange={(e) => set('winery', e.target.value)} />

          <label>Style</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={form.stylePicker}
              onChange={(e) => set('stylePicker', e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">— Select style —</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {form.stylePicker === 'Custom…' && (
              <input
                placeholder="Type a custom style"
                value={form.styleCustom}
                onChange={(e) => set('styleCustom', e.target.value)}
                style={{ flex: 1 }}
              />
            )}
          </div>

          <label>Region</label>
          <input value={form.region} onChange={(e) => set('region', e.target.value)} />

          <label>Vintage Year</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={form.vintage_year}
            onChange={(e) => set('vintage_year', e.target.value)}
          />

          <label>ABV (%)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={form.abv}
            onChange={(e) => set('abv', e.target.value)}
          />

          <label>Size (ml)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={form.size_ml}
            onChange={(e) => set('size_ml', e.target.value)}
          />

          <label>Barcode / UPC</label>
          <input value={form.barcode_upc} onChange={(e) => set('barcode_upc', e.target.value)} />

          <label>Notes (markdown)</label>
          <textarea rows={4} value={form.notes_markdown} onChange={(e) => set('notes_markdown', e.target.value)} />

          <label>Image URL</label>
          <input value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />

          <label>Upload image</label>
          <div>
            <input type="file" accept="image/*" onChange={handleFile} />
            {uploading && <span style={{ marginLeft: 8 }}>Uploading…</span>}
            {uploadError && <div style={{ color: 'salmon' }}>{uploadError}</div>}
            {previewUrl && (
              <div style={{ marginTop: 8 }}>
                <img src={previewUrl} alt="Preview" style={{ maxWidth: 240, borderRadius: 8 }} />
              </div>
            )}
          </div>

          <label>Rare</label>
          <input
            type="checkbox"
            checked={form.is_rare}
            onChange={(e) => set('is_rare', e.target.checked)}
          />

          <div />
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </main>
    </AdminOnly>
  );
}
