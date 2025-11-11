'use client';

import Image from 'next/image';
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import AdminOnly from '../../../components/AdminOnly';
import { useFormFieldIds } from '../../../lib/useFormFieldIds';

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
    is_rare: false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const formGridStyle = {
    display: 'grid',
    gridTemplateColumns: '220px 420px',
    gap: 10,
    alignItems: 'center',
    maxWidth: '980px',
  } as const;
  const labelCellStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--muted)',
    paddingInlineEnd: 8,
    textAlign: 'right',
  } as const;
  const controlCellStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as const;
  const srOnly = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  } as const;

  const renderRow = (
    label: string,
    controlId: string,
    control: ReactNode,
    opts?: { alignTop?: boolean }
  ) => (
    <>
      <span
        style={{
          ...labelCellStyle,
          alignSelf: opts?.alignTop ? 'flex-start' : 'center',
        }}
      >
        {label}
      </span>
      <div
        style={{
          ...controlCellStyle,
          alignItems: opts?.alignTop ? 'flex-start' : 'center',
          position: 'relative',
        }}
      >
        <label style={srOnly} htmlFor={controlId}>
          {label}
        </label>
        {control}
      </div>
    </>
  );
  const field = useFormFieldIds('bottle-new');
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
      distillery: form.distillery || null,
      style: chosenStyle,
      region: form.region || null,
      barcode_upc: form.barcode_upc || null,
      mashbill_markdown: form.mashbill_markdown || null,
      notes_markdown: form.notes_markdown || null,
      image_url: form.image_url || null,
      is_rare: form.is_rare,
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
        <form onSubmit={submit} style={formGridStyle}>
          {renderRow('Brand', fields.brand.id, (
            <input
              {...fields.brand}
              placeholder="e.g., Ardbeg, Maker's Mark, Gordon & MacPhail"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
            />
          ))}

          {renderRow('Expression (e.g. 12 Year, Cask Strength, Port Finish)', fields.expression.id, (
            <input
              {...fields.expression}
              placeholder="e.g., 10 Year, Cask Strength, Port Cask Finish, Local Barley 2022"
              value={form.expression}
              onChange={(e) => set('expression', e.target.value)}
            />
          ))}

          {renderRow('Distillery (optional)', fields.distillery.id, (
            <input
              {...fields.distillery}
              placeholder="e.g., Ardbeg Distillery, Buffalo Trace, Yoichi"
              value={form.distillery}
              onChange={(e) => set('distillery', e.target.value)}
            />
          ))}

          {renderRow('Style', fields.stylePicker.id, (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
              <select
                {...fields.stylePicker}
                value={form.stylePicker}
                onChange={(e) => set('stylePicker', e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
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
                  style={{ flex: 1, minWidth: 220 }}
                />
              )}
            </div>
          ))}

          {renderRow('Region (optional)', fields.region.id, (
            <input
              {...fields.region}
              placeholder="e.g., Islay, Speyside, Kentucky, Hokkaido"
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
            />
          ))}

          {renderRow('Age (years)', fields.age.id, (
            <input
              {...fields.age}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              placeholder="e.g., 10"
              value={form.age}
              onChange={(e) => set('age', e.target.value)}
            />
          ))}

          {renderRow('Proof', fields.proof.id, (
            <input
              {...fields.proof}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="e.g., 100.00"
              value={form.proof}
              onChange={(e) => set('proof', e.target.value)}
            />
          ))}

          {renderRow('ABV (%)', fields.abv.id, (
            <input
              {...fields.abv}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="e.g., 46 or 59.2"
              value={form.abv}
              onChange={(e) => set('abv', e.target.value)}
            />
          ))}

          {renderRow('Size (ml)', fields.size_ml.id, (
            <input
              {...fields.size_ml}
              type="number"
              inputMode="numeric"
              min="0"
              step="50"
              placeholder="e.g., 750"
              value={form.size_ml}
              onChange={(e) => set('size_ml', e.target.value)}
            />
          ))}

          {renderRow('Release year', fields.release_year.id, (
            <input
              {...fields.release_year}
              type="number"
              inputMode="numeric"
              min="1900"
              max="2100"
              step="1"
              placeholder="e.g., 2022"
              value={form.release_year}
              onChange={(e) => set('release_year', e.target.value)}
            />
          ))}

          {renderRow('Barcode / UPC (optional)', fields.barcode_upc.id, (
            <input
              {...fields.barcode_upc}
              placeholder="e.g., 088004012345"
              value={form.barcode_upc}
              onChange={(e) => set('barcode_upc', e.target.value)}
            />
          ))}

          {renderRow('Mark as Rare', fields.is_rare.id, (
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
          ))}

          {renderRow('Bottle Image (upload)', fields.image_upload.id, (
            <div style={{ width: '100%' }}>
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
                    alt="preview"
                    width={360}
                    height={360}
                    style={{ maxWidth: 360, borderRadius: 8, height: 'auto' }}
                    unoptimized
                  />
                )}
                {!previewUrl && !uploading && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>You can leave this blank for now.</div>
                )}
              </div>
            </div>
          ), { alignTop: true })}

          {renderRow('Mash Bill / Barrel Info (Markdown)', fields.mashbill_markdown.id, (
            <textarea
              {...fields.mashbill_markdown}
              placeholder={
                "## Mash Bill:\\n- 65% Corn | 25% Wheat | 10% Malted Barley\\n\\n- Barrel 1:\\nAged in #3, wood-fired, toasted & charred new American Oak barrels\\n\\n- Barrel 2:\\nOloroso Cask\\n\\nAge:\\nBarrel 1: 4+ Yrs / Barrel 2: 4 Mos"
              }
              rows={8}
              value={form.mashbill_markdown}
              onChange={(e) => set('mashbill_markdown', e.target.value)}
            />
          ), { alignTop: true })}

          {renderRow('Notes (Markdown)', fields.notes_markdown.id, (
            <textarea
              {...fields.notes_markdown}
              placeholder={'## Tasting\\n- Nose: …\\n- Palate: …\\n- Finish: …\\n\\n**Verdict:** …'}
              rows={8}
              value={form.notes_markdown}
              onChange={(e) => set('notes_markdown', e.target.value)}
            />
          ), { alignTop: true })}

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
