'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiPath } from '../../../lib/apiPath';
import MarkdownViewer from '../../../components/MarkdownViewer';
import { useMe } from '../../../lib/useMe';
import { useModules } from '../../../lib/useModules';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

const PLACEHOLDER_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="16" fill="#222"/>
  <g fill="none" stroke="#888" stroke-width="8" stroke-linecap="round">
    <path d="M96 40h64v20c0 18-10 34-26 42v56c0 14-10 26-22 26s-22-12-22-26V102C106 94 96 78 96 60V40z"/>
    <line x1="112" y1="160" x2="144" y2="160"/>
  </g>
</svg>`);

type WineBottle = {
  wine_id: number;
  brand: string;
  expression?: string;
  winery?: string;
  style?: string;
  region?: string;
  vintage_year?: number;
  abv?: number;
  size_ml?: number;
  barcode_upc?: string;
  image_url?: string;
  notes_markdown?: string;
  is_rare: boolean;
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: 12,
        padding: '6px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function WineDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const { isAdmin } = useMe();
  const { modules } = useModules();

  const [wine, setWine] = useState<WineBottle | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageErrored, setImageErrored] = useState(false);

  useEffect(() => {
    setImageErrored(false);
  }, [wine?.image_url]);

  useEffect(() => {
    let mounted = true;
    if (!modules.wine) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`${API}/wine/${id}`, { credentials: 'include' });
        const data = res.ok ? await res.json() : null;
        if (!mounted) return;
        setWine(data);
      } catch {
        if (mounted) setWine(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (!Number.isNaN(id)) load();
    return () => {
      mounted = false;
    };
  }, [id, modules.wine]);

  if (!modules.wine) {
    return (
      <main>
        <h1>Wine</h1>
        <p>The Wine module is not enabled.</p>
      </main>
    );
  }

  if (loading) return <main><p>Loading…</p></main>;
  if (!wine) return <main><p>Not found</p></main>;

  const abvStr = wine.abv != null ? `${wine.abv}%` : undefined;
  const sizeStr = wine.size_ml != null ? `${wine.size_ml} ml` : undefined;

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          {wine.brand}
          {wine.is_rare ? (
            <sup
              style={{
                color: '#c9a227',
                fontWeight: 700,
                marginLeft: 6,
                letterSpacing: '0.02em',
              }}
            >
              R
            </sup>
          ) : null}
          {wine.expression ? ` — ${wine.expression}` : ''}
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          {isAdmin && <Link href={`/wine/${id}/edit`}>✏️ Edit Wine</Link>}
        </div>
      </div>

      {wine.image_url && (
        <div style={{ margin: '12px 0' }}>
          <Image
            src={imageErrored ? PLACEHOLDER_SVG : apiPath(wine.image_url)}
            alt={`${wine.brand} ${wine.expression ?? ''}`}
            width={420}
            height={420}
            style={{ maxWidth: 420, borderRadius: 8, height: 'auto' }}
            unoptimized
            onError={() => setImageErrored(true)}
          />
        </div>
      )}

      <section style={{ marginTop: 12 }}>
        <Row label="Winery" value={wine.winery} />
        <Row label="Style" value={wine.style} />
        <Row label="Region" value={wine.region} />
        <Row label="Vintage" value={wine.vintage_year} />
        <Row label="ABV" value={abvStr} />
        <Row label="Size" value={sizeStr} />
        <Row label="Barcode" value={wine.barcode_upc} />
      </section>

      {wine.notes_markdown && (
        <section style={{ marginTop: 16 }}>
          <h3>Notes</h3>
          <MarkdownViewer markdown={wine.notes_markdown} />
        </section>
      )}
    </main>
  );
}
