'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminOnly from '../../../components/AdminOnly';
import { useModules } from '../../../lib/useModules';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

const STYLE_GROUPS: Record<string, string[]> = {
  Red: ['Cabernet Sauvignon', 'Merlot', 'Pinot Noir', 'Syrah'],
  White: ['Chardonnay', 'Sauvignon Blanc', 'Riesling', 'Pinot Grigio'],
  Rose: ['Dry', 'Sweet'],
  Sparkling: ['Brut', 'Extra Dry', 'Rosé'],
  Dessert: ['Late Harvest', 'Ice Wine'],
  Fortified: ['Port', 'Sherry'],
};

function fullStyleList() {
  const out: string[] = [];
  Object.entries(STYLE_GROUPS).forEach(([k, arr]) => {
    arr.forEach((v) => out.push(`${k} - ${v}`));
  });
  out.push('Custom…');
  return out;
}
const STYLE_OPTIONS = fullStyleList();

export default function NewWinePage() {
  const r = useRouter();
  const { modules } = useModules();
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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const chosenStyle = useMemo(() => {
    if (form.stylePicker === 'Custom…') return form.styleCustom.trim() || null;
    if (!form.stylePicker) return null;
    return form.stylePicker;
  }, [form.stylePicker, form.styleCustom]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${API}/uploads/image`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      set('image_url', data.url);
      setPreviewUrl(`${API}${data.url.startsWith('/') ? '' : '/'}${data.url}`);
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim()) return alert('Brand is required');

    setSaving(true);
    const payload: any = {
      brand: form.brand || null,
      expression: form.expression || null,
      winery: form.winery || null,
      style: chosenStyle,
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
      if (!Number.isNaN(num)) payload[k] = num;
    });

    const res = await fetch(`${API}/wine`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) r.push('/wine');
    else alert('Save failed: ' + (await res.text()));
  }

  if (!modules.wine) {
    return (
      <AdminOnly>
        <main>
          <h1>New Wine</h1>
          <p>The Wine module is not enabled.</p>
        </main>
      </AdminOnly>
    );
  }

  return (
    <AdminOnly>
      <main>
        <h1>New Wine</h1>
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
          <input
            placeholder="e.g., Domaine, Chateau, Winery"
            value={form.brand}
            onChange={(e) => set('brand', e.target.value)}
          />

          <label>Expression (e.g. Reserve, Vineyard)</label>
          <input
            placeholder="e.g., Reserve, Single Vineyard"
            value={form.expression}
            onChange={(e) => set('expression', e.target.value)}
          />

          <label>Winery (optional)</label>
          <input
            placeholder="e.g., Domaine Serene"
            value={form.winery}
            onChange={(e) => set('winery', e.target.value)}
          />

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

          <label>Region (optional)</label>
          <input
            placeholder="e.g., Napa, Bordeaux, Tuscany"
            value={form.region}
            onChange={(e) => set('region', e.target.value)}
          />

          <label>Vintage Year</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="e.g., 2018"
            value={form.vintage_year}
            onChange={(e) => set('vintage_year', e.target.value)}
          />

          <label>ABV (%)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g., 13.5"
            value={form.abv}
            onChange={(e) => set('abv', e.target.value)}
          />

          <label>Size (ml)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="e.g., 750"
            value={form.size_ml}
            onChange={(e) => set('size_ml', e.target.value)}
          />

          <label>Barcode / UPC</label>
          <input
            placeholder="optional"
            value={form.barcode_upc}
            onChange={(e) => set('barcode_upc', e.target.value)}
          />

          <label>Notes (markdown)</label>
          <textarea
            rows={4}
            placeholder="Tasting notes"
            value={form.notes_markdown}
            onChange={(e) => set('notes_markdown', e.target.value)}
          />

          <label>Image URL</label>
          <input
            placeholder="https://..."
            value={form.image_url}
            onChange={(e) => set('image_url', e.target.value)}
          />

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
            {saving ? 'Saving…' : 'Save Wine'}
          </button>
        </form>
      </main>
    </AdminOnly>
  );
}
