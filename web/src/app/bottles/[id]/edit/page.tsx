'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminOnly from '../../../../components/AdminOnly';
import { useFormFieldIds } from '../../../../lib/useFormFieldIds';

/**
 * We keep using NEXT_PUBLIC_API_BASE (expected to be "/api")
 * but everything routes *through* Next's rewrite.
 * The helpers below normalize paths to avoid /api/api/... issues.
 */
const API = (process.env.NEXT_PUBLIC_API_BASE || '/api').replace(/\/+$/, ''); // e.g., "/api"

function joinApi(path: string) {
  // Join API base + path, trimming duplicate slashes.
  const p = path.replace(/^\/+/, '');
  return `${API}/${p}`;
}

function toPreviewUrl(u?: string | null) {
  if (!u) return null;
  // Absolute URL? use as-is
  if (/^https?:\/\//i.test(u)) return u;

  // If it already starts with "/api" (or the configured API base), use as-is
  if (u.startsWith('/api/')) return u;
  if (API && u.startsWith(API + '/')) return u;

  // Otherwise, join relative path to API base
  return joinApi(u);
}

// Match the New Bottle form's style options
const STYLE_GROUPS: Record<string, string[]> = {
  Scotch: ['Single Malt', 'Blended', 'Blended Malt', 'Single Grain'],
  Bourbon: ['Straight', 'Small Batch', 'Single Barrel', 'Cask Strength', 'Barrel Proof', 'Charred'],
  Rye: ['Straight Rye'],
  Irish: ['Single Pot Still', 'Single Malt', 'Blended'],
  Japanese: ['Single Malt', 'Blended'],
  Tennessee: ['Straight'],
  Canadian: ['Whisky'],
};

const STYLE_OPTIONS = Object.entries(STYLE_GROUPS)
  .flatMap(([fam, vars]) => vars.map((v) => `${fam} - ${v}`))
  .concat('Custom…');

export default function EditBottlePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const field = useFormFieldIds('bottle-edit');
  const fields = {
    brand: field('brand'),
    expression: field('expression'),
    distillery: field('distillery'),
    stylePicker: field('style'),
    styleCustom: field('styleCustom'),
    region: field('region'),
    age: field('age'),
    proof: field('proof'),
    abv: field('abv'),
    size_ml: field('size_ml'),
    release_year: field('release_year'),
    barcode_upc: field('barcode_upc'),
    is_rare: field('is_rare'),
    image_upload: field('image_upload'),
    mashbill_markdown: field('mashbill_markdown'),
    notes_markdown: field('notes_markdown'),
  };

  // Controlled form state
  const [form, setForm] = useState({
    brand: '',
    expression: '',
    distillery: '',
    stylePicker: '',
    styleCustom: '',
    region: '',
    age: '',
    abv: '',
    proof: '',
    size_ml: '',
    release_year: '',
    barcode_upc: '',
    mashbill_markdown: '',
    notes_markdown: '',
    image_url: '',
    is_rare: false,
  });

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(joinApi(`/bottles/${id}`), { credentials: 'include' });
        const b = res.ok ? await res.json() : null;

        const styleKnown = b?.style && STYLE_OPTIONS.includes(b.style);
        if (!mounted) return;

        setForm({
          brand: b?.brand ?? '',
          expression: b?.expression ?? '',
          distillery: b?.distillery ?? '',
          stylePicker: styleKnown ? b.style : b?.style ? 'Custom…' : '',
          styleCustom: styleKnown ? '' : b?.style ?? '',
          region: b?.region ?? '',
          age: b?.age ?? '',
          abv: b?.abv ?? '',
          proof: b?.proof ?? '',
          size_ml: b?.size_ml ?? '',
          release_year: b?.release_year ?? '',
          barcode_upc: b?.barcode_upc ?? '',
          mashbill_markdown: b?.mashbill_markdown ?? '',
          notes_markdown: b?.notes_markdown ?? '',
          image_url: b?.image_url ?? '',
          is_rare: Boolean(b?.is_rare),
        });

        if (b?.image_url) {
          setPreviewUrl(toPreviewUrl(b.image_url));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (!Number.isNaN(id)) load();
    return () => {
      mounted = false;
    };
  }, [id]);

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

      // Upload to FastAPI via Next rewrite
      const res = await fetch(joinApi('/uploads/image'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json(); // expected: { url: "/api/uploads/<filename>" } or { url: "/uploads/<filename>" }

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

    // Build style from picker/custom
    let style: string | null = null;
    if (form.stylePicker === 'Custom…') style = form.styleCustom.trim() || null;
    else if (form.stylePicker) style = form.stylePicker;

    const raw: any = {
      brand: form.brand || null,
      expression: form.expression || null,
      distillery: form.distillery || null,
      style,
      region: form.region || null,
      barcode_upc: form.barcode_upc || null,
      mashbill_markdown: form.mashbill_markdown || null,
      notes_markdown: form.notes_markdown || null,
      image_url: form.image_url || null,
      is_rare: form.is_rare,
    };

    // Numeric coercion
    ([
      ['age', 'int'],
      ['abv', 'float'],
      ['proof', 'float'],
      ['size_ml', 'int'],
      ['release_year', 'int'],
    ] as const).forEach(([k, t]) => {
      const v = (form as any)[k];
      if (v === '') return;
      const num = t === 'int' ? parseInt(v, 10) : parseFloat(v);
      if (!Number.isNaN(num)) raw[k] = num;
    });

    // Auto-fill ABV if only Proof provided
    if (raw.proof != null && raw.abv == null) {
      raw.abv = Math.round((raw.proof / 2) * 10) / 10;
    }

    // Minimal PATCH payload
    const payload: any = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (v === null || v === '') return;
      payload[k] = v;
    });

    const res = await fetch(joinApi(`/bottles/${id}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (res.ok) router.push(`/bottles/${id}`);
    else alert('Update failed: ' + (await res.text()));
  }

  async function handleDelete() {
    if (!id || Number.isNaN(id)) return;
    const ok = window.confirm(
      'Delete this bottle and all related purchases/notes? This cannot be undone.'
    );
    if (!ok) return;

    try {
      setDeleting(true);
      const res = await fetch(joinApi(`/bottles/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.status === 204) {
        router.push('/bottles');
        router.refresh?.();
        return;
      }
      const msg = await res.text();
      alert(`Delete failed: ${res.status} ${msg || ''}`);
    } catch (err: any) {
      alert(`Delete error: ${err?.message || err}`);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return (
    <main>
      <p>Loading…</p>
    </main>
  );

  return (
    <AdminOnly>
      <main>
        <h1>Edit Bottle</h1>

        <form
          onSubmit={submit}
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 480px',
            gap: 10,
            alignItems: 'center',
            maxWidth: '980px',
          }}
        >
          <label htmlFor={fields.brand.id}>Brand</label>
          <input {...fields.brand} value={form.brand} onChange={(e) => set('brand', e.target.value)} />

          <label htmlFor={fields.expression.id}>Expression (e.g. 12 Year, Cask Strength, Port Finish)</label>
          <input {...fields.expression} value={form.expression} onChange={(e) => set('expression', e.target.value)} />

          <label htmlFor={fields.distillery.id}>Distillery (optional)</label>
          <input {...fields.distillery} value={form.distillery} onChange={(e) => set('distillery', e.target.value)} />

          <label htmlFor={fields.stylePicker.id}>Style</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              {...fields.stylePicker}
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
                {...fields.styleCustom}
                placeholder="Type a custom style (e.g., Taiwanese - Single Malt)"
                value={form.styleCustom}
                onChange={(e) => set('styleCustom', e.target.value)}
                style={{ flex: 1 }}
              />
            )}
          </div>

          <label htmlFor={fields.region.id}>Region (optional)</label>
          <input {...fields.region} value={form.region} onChange={(e) => set('region', e.target.value)} />

          <label htmlFor={fields.age.id}>Age (years)</label>
          <input
            {...fields.age}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={form.age}
            onChange={(e) => set('age', e.target.value)}
          />

          <label htmlFor={fields.proof.id}>Proof</label>
          <input
            {...fields.proof}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={form.proof}
            onChange={(e) => set('proof', e.target.value)}
          />

          <label htmlFor={fields.abv.id}>ABV (%)</label>
          <input
            {...fields.abv}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={form.abv}
            onChange={(e) => set('abv', e.target.value)}
          />

          <label htmlFor={fields.size_ml.id}>Size (ml)</label>
          <input
            {...fields.size_ml}
            type="number"
            inputMode="numeric"
            min="0"
            step="50"
            value={form.size_ml}
            onChange={(e) => set('size_ml', e.target.value)}
          />

          <label htmlFor={fields.release_year.id}>Release year</label>
          <input
            {...fields.release_year}
            type="number"
            inputMode="numeric"
            min="1900"
            max="2100"
            step="1"
            value={form.release_year}
            onChange={(e) => set('release_year', e.target.value)}
          />

          <label htmlFor={fields.barcode_upc.id}>Barcode / UPC (optional)</label>
          <input
            {...fields.barcode_upc}
            value={form.barcode_upc}
            onChange={(e) => set('barcode_upc', e.target.value)}
          />

          <label htmlFor={fields.is_rare.id}>Mark as Rare</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              {...fields.is_rare}
              type="checkbox"
              checked={form.is_rare}
              onChange={(e) => set('is_rare', e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 14, opacity: 0.85 }}>Highlight this bottle as hard to find.</span>
          </div>

          <label htmlFor={fields.image_upload.id}>Bottle Image (replace)</label>
          <div>
            <input
              {...fields.image_upload}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFile}
            />
            <div style={{ marginTop: 8 }}>
              {uploading && <div>Uploading…</div>}
              {uploadError && <div style={{ color: 'red' }}>{uploadError}</div>}
              {previewUrl && (
                <Image
                  src={previewUrl}
                  alt="Bottle preview"
                  width={360}
                  height={360}
                  style={{ maxWidth: 360, borderRadius: 8, height: 'auto' }}
                  unoptimized
                />
              )}
            </div>
          </div>

          <label htmlFor={fields.mashbill_markdown.id}>Mash Bill (Markdown)</label>
          <textarea
            {...fields.mashbill_markdown}
            rows={8}
            value={form.mashbill_markdown}
            onChange={(e) => set('mashbill_markdown', e.target.value)}
          />

          <label htmlFor={fields.notes_markdown.id}>Notes (Markdown)</label>
          <textarea
            {...fields.notes_markdown}
            rows={8}
            value={form.notes_markdown}
            onChange={(e) => set('notes_markdown', e.target.value)}
          />

          {/* Actions row */}
          <div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving || uploading}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: '#c62828',
                color: 'white',
                border: 'none',
                padding: '0.5rem 0.75rem',
                borderRadius: 6,
              }}
              title="Delete this bottle"
            >
              {deleting ? 'Deleting…' : 'Delete Bottle'}
            </button>
          </div>
        </form>
      </main>
    </AdminOnly>
  );
}
