'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminOnly from '../../../components/AdminOnly';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

const STYLE_GROUPS: Record<string, string[]> = {
  Scotch: ['Single Malt', 'Blended', 'Blended Malt', 'Single Grain'],
  Bourbon: ['Straight', 'Small Batch', 'Single Barrel', 'Cask Strength', 'Barrel Proof', 'Charred'],
  Rye: ['Straight Rye'],
  Irish: ['Single Pot Still', 'Single Malt', 'Blended'],
  Japanese: ['Single Malt', 'Blended'],
  Tennessee: ['Straight'],
  Canadian: ['Whisky'],
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

export default function NewBottlePage() {
  const r = useRouter();
  const [form, setForm] = useState({
    brand: '',
    expression: '',
    distillery: '',
    stylePicker: '',
    styleCustom: '',
    region: '',
    age: '',
    proof: '',
    abv: '',
    size_ml: '',
    release_year: '',
    barcode_upc: '',
    mashbill_markdown: '',
    notes_markdown: '',
    image_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
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
      distillery: form.distillery || null,
      style: chosenStyle,
      region: form.region || null,
      barcode_upc: form.barcode_upc || null,
      mashbill_markdown: form.mashbill_markdown || null,
      notes_markdown: form.notes_markdown || null,
      image_url: form.image_url || null,
    };

    ([
      ['age', 'int'],
      ['proof', 'float'],
      ['abv', 'float'],
      ['size_ml', 'int'],
      ['release_year', 'int'],
    ] as const).forEach(([k, t]) => {
      const v = (form as any)[k];
      if (v === '') return;
      const num = t === 'int' ? parseInt(v, 10) : parseFloat(v);
      if (!Number.isNaN(num)) payload[k] = num;
    });

    // auto-fill ABV if only Proof provided
    if (payload.proof != null && payload.abv == null) {
      payload.abv = Math.round((payload.proof / 2) * 10) / 10;
    }

    const res = await fetch(`${API}/bottles`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) r.push('/bottles');
    else alert('Save failed: ' + (await res.text()));
  }

  return (
    <AdminOnly>
      <main>
        <h1>New Bottle</h1>
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
            placeholder="e.g., Ardbeg, Maker's Mark, Gordon & MacPhail"
            value={form.brand}
            onChange={(e) => set('brand', e.target.value)}
          />

          <label>Expression (e.g. 12 Year, Cask Strength, Port Finish)</label>
          <input
            placeholder="e.g., 10 Year, Cask Strength, Port Cask Finish, Local Barley 2022"
            value={form.expression}
            onChange={(e) => set('expression', e.target.value)}
          />

          <label>Distillery (optional)</label>
          <input
            placeholder="e.g., Ardbeg Distillery, Buffalo Trace, Yoichi"
            value={form.distillery}
            onChange={(e) => set('distillery', e.target.value)}
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
                placeholder="Type a custom style (e.g., Taiwanese - Single Malt)"
                value={form.styleCustom}
                onChange={(e) => set('styleCustom', e.target.value)}
                style={{ flex: 1 }}
              />
            )}
          </div>

          <label>Region (optional)</label>
          <input
            placeholder="e.g., Islay, Speyside, Kentucky, Hokkaido"
            value={form.region}
            onChange={(e) => set('region', e.target.value)}
          />

          <label>Age (years)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="e.g., 10"
            value={form.age}
            onChange={(e) => set('age', e.target.value)}
          />

          <label>Proof</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="e.g., 100.00"
            value={form.proof}
            onChange={(e) => set('proof', e.target.value)}
          />

          <label>ABV (%)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g., 46 or 59.2"
            value={form.abv}
            onChange={(e) => set('abv', e.target.value)}
          />

          <label>Size (ml)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="50"
            placeholder="e.g., 750"
            value={form.size_ml}
            onChange={(e) => set('size_ml', e.target.value)}
          />

          <label>Release year</label>
          <input
            type="number"
            inputMode="numeric"
            min="1900"
            max="2100"
            step="1"
            placeholder="e.g., 2022"
            value={form.release_year}
            onChange={(e) => set('release_year', e.target.value)}
          />

          <label>Barcode / UPC (optional)</label>
          <input
            placeholder="e.g., 088004012345"
            value={form.barcode_upc}
            onChange={(e) => set('barcode_upc', e.target.value)}
          />

          <label>Bottle Image (upload)</label>
          <div>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} />
            <div style={{ marginTop: 8 }}>
              {uploading && <div>Uploading…</div>}
              {uploadError && <div style={{ color: 'red' }}>{uploadError}</div>}
              {previewUrl && <img src={previewUrl} alt="preview" style={{ maxWidth: 360, borderRadius: 8 }} />}
              {!previewUrl && !uploading && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>You can leave this blank for now.</div>
              )}
            </div>
          </div>

          <label>Mash Bill / Barrel Info (Markdown)</label>
          <textarea
            placeholder={
              "## Mash Bill:\n- 65% Corn | 25% Wheat | 10% Malted Barley\n\n- Barrel 1:\nAged in #3, wood-fired, toasted & charred new American Oak barrels\n\n- Barrel 2:\nOloroso Cask\n\nAge:\nBarrel 1: 4+ Yrs / Barrel 2: 4 Mos"
            }
            rows={8}
            value={form.mashbill_markdown}
            onChange={(e) => set('mashbill_markdown', e.target.value)}
          />

          <label>Notes (Markdown)</label>
          <textarea
            placeholder={'## Tasting\n- Nose: …\n- Palate: …\n- Finish: …\n\n**Verdict:** …'}
            rows={8}
            value={form.notes_markdown}
            onChange={(e) => set('notes_markdown', e.target.value)}
          />

          <div></div>
          <button type="submit" disabled={saving || uploading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>

        <p style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          <em>Brand</em> is the label name; <em>Distillery</em> is where it was distilled (if known).
          “Expression” is the specific variant (age, finish, batch name).
        </p>
      </main>
    </AdminOnly>
  );
}
