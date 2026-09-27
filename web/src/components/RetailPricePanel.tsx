'use client';

import { useEffect, useState } from 'react';
import { useMe } from '../lib/useMe';
import { currency } from '../lib/format';
import { formatDateTime } from '../lib/formatDate';

const API = process.env.NEXT_PUBLIC_API_BASE || '/api';
type Purchase = { purchase_id: number; purchase_date?: string; price_paid?: number };
type Quote = {
  observation_id: number; product_url: string; product_title: string; variant_id: string;
  price_cents: number; currency: string; available: boolean; checked_at: string;
};
export type RetailPrices = {
  link: { product_url: string; product_title: string; last_error: string | null } | null;
  match: { status: string; message: string } | null;
  latest: Quote | null; history: Quote[]; stale: boolean; auto_refresh: boolean;
};
type Product = {
  product_url: string; product_title: string; currency: string;
  variants: { variant_id: string; title: string; barcode: string | null; price_cents: number; available: boolean }[];
};

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(path, {
    method, credentials: 'include', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to load retail prices.');
  return data as T;
}

export default function RetailPricePanel({ bottleId, purchases, barcode, onChange }: {
  bottleId: number; purchases: Purchase[]; barcode?: string;
  onChange?: (data: RetailPrices | null) => void;
}) {
  const { isAdmin, me, loading: authLoading } = useMe();
  const base = `${API}/bottles/${bottleId}/retail-price`;
  const [data, setData] = useState<RetailPrices | null>(null);
  const [url, setUrl] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [variantId, setVariantId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const variant = product?.variants.find(v => v.variant_id === variantId);

  useEffect(() => {
    let active = true;
    setData(null);
    setProduct(null);
    setUrl('');
    setError('');
    async function load() {
      try {
        const value = await request<RetailPrices>(base);
        if (!active) return;
        setData(value);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Unable to load retail prices.'); }
    }
    void load();
    return () => { active = false; };
  }, [base]);

  useEffect(() => { onChange?.(data); }, [data, onChange]);

  const matchingStatus = data?.match?.status;
  // A manually requested match also completes asynchronously.
  useEffect(() => {
    if (!matchingStatus || !['queued', 'matching'].includes(matchingStatus)) return;
    let active = true;
    const timer = setInterval(() => {
      request<RetailPrices>(base).then(value => { if (active) setData(value); }).catch(() => { /* next poll can recover */ });
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [base, matchingStatus]);

  async function act(action: 'preview' | 'link' | 'refresh' | 'unlink' | 'match') {
    setBusy(true);
    setError('');
    try {
      if (action === 'preview') {
        setProduct(null);
        setConfirmed(false);
        const value = await request<Product>(`${base}/preview`, 'POST', { product_url: url });
        setProduct(value);
        setVariantId(value.variants.length === 1 ? value.variants[0].variant_id : '');
      } else {
        const value = await request<RetailPrices>(`${base}/${action === 'unlink' ? 'link' : action}`,
          action === 'unlink' ? 'DELETE' : action === 'link' ? 'PUT' : 'POST',
          action === 'link' ? { product_url: product?.product_url, variant_id: variantId, confirmed } : undefined);
        setData(value);
        if (action === 'link' || action === 'unlink') { setProduct(null); setUrl(''); setConfirmed(false); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check price.');
      // Load persisted refresh errors while retaining the last successful quote.
      if (action === 'refresh') {
        try { setData(await request<RetailPrices>(base)); } catch { /* retain current view */ }
      }
    } finally { setBusy(false); }
  }

  const quote = data?.latest;
  // Keep the quote callback active for the main pricing table, but render these
  // management details only after an authenticated admin has been confirmed.
  if (authLoading || !me.authenticated || !isAdmin) return null;

  return <section id="retail-price-details" className="card" style={{ marginTop: 16, padding: '12px 16px' }}>
    <h2>Current retail price</h2>
    <p>LoveScotch listed price per bottle, excluding tax and shipping. This is a retail comparison, not a resale estimate.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>Loading retail prices…</p>}
    {data?.link && <>
      <p><a href={data.link.product_url} target="_blank" rel="noreferrer">{data.link.product_title} at LoveScotch</a></p>
      {quote ? <p><strong>{currency(quote.price_cents / 100, quote.currency)}</strong>
        {' · '}{quote.available ? 'In stock when checked' : 'Out of stock when checked'}
        {' · '}Checked {formatDateTime(quote.checked_at)}{data.stale ? ' · Price is over a week old' : ''}</p>
        : <p>No successful price check for this link yet.</p>}
      {data.link.last_error && <p role="status">Last refresh failed: {data.link.last_error}</p>}
      <p>{data.auto_refresh ? 'Weekly automatic refresh is enabled.' : 'Automatic refresh is off.'}</p>
      {isAdmin && <div style={{ display: 'flex', gap: 12 }}>
        <button disabled={busy} onClick={() => act('refresh')}>Refresh price</button>
        <button disabled={busy} onClick={() => act('unlink')}>Unlink product</button>
      </div>}
    </>}
    {data?.match && <p role="status">
      {data.match.status === 'needs_review' && <strong>Lookup complete — confirmation needed. </strong>}
      {data.match.message}
    </p>}
    {data && !data.link && <>
      {!data.match && <p>No LoveScotch product linked yet. Try matching its UPC first.</p>}
      {isAdmin && <button disabled={busy || ['queued', 'matching'].includes(data.match?.status || '')}
        onClick={() => act('match')}>Try UPC match</button>}
    </>}
    {quote && purchases.length > 0 && <ul>
      {purchases.map(p => {
        const difference = p.price_paid == null ? null : quote.price_cents / 100 - p.price_paid;
        const percent = difference != null && p.price_paid != null && p.price_paid > 0
          ? difference / p.price_paid * 100 : null;
        return <li key={p.purchase_id}>
          Purchased {p.purchase_date || '(date not recorded)'} for {currency(p.price_paid)}.
          {' '}LoveScotch listed {currency(quote.price_cents / 100, quote.currency)} on {formatDateTime(quote.checked_at)}.
          {difference != null && quote.currency === 'USD' && <> Difference: {difference >= 0 ? '+' : ''}{currency(difference)}
            {percent != null && ` (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)`}.</>}
        </li>;
      })}
    </ul>}
    {isAdmin && !['queued', 'matching'].includes(data?.match?.status || '') && <details>
      <summary>{data?.link ? 'Change linked product' : 'Link a LoveScotch product'}</summary>
      <form onSubmit={event => { event.preventDefault(); void act('preview'); }}>
        <p><label>LoveScotch product URL<br />
          <input type="url" required value={url} placeholder="https://lovescotch.com/products/…"
            disabled={busy} style={{ width: '100%' }} onChange={event => {
              setUrl(event.target.value); setProduct(null); setConfirmed(false);
            }} />
        </label></p>
        <button disabled={busy || !url} type="submit">Preview product</button>
      </form>
      {product && <div>
        <p><a href={product.product_url} target="_blank" rel="noreferrer">{product.product_title}</a></p>
        <label>Product option<br /><select value={variantId} disabled={busy} onChange={event => {
          setVariantId(event.target.value); setConfirmed(false);
        }}>
          <option value="">Choose an option</option>
          {product.variants.map(v => <option key={v.variant_id} value={v.variant_id}>
            {v.title} — {currency(v.price_cents / 100, product.currency)} — {v.available ? 'In stock' : 'Out of stock'}
          </option>)}
        </select></label>
        {variant && <p>Retailer barcode: {variant.barcode || 'Not provided'}. Collection barcode: {barcode || 'Not recorded'}.
          {barcode && variant.barcode && barcode !== variant.barcode && ' Barcodes differ; verify the product carefully.'}</p>}
        <p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
          {' '}I checked that the expression, bottle size, and release or batch match my bottle.
        </label></p>
        <button disabled={busy || !confirmed || !variantId} onClick={() => act('link')}>Save link and price</button>
      </div>}
    </details>}
    {busy && <p role="status">Checking retail price…</p>}
    {!!data?.history.length && <details style={{ marginTop: 12 }}>
      <summary>Price history ({data.history.length} most recent checks)</summary>
      <div style={{ overflowX: 'auto' }}><table>
        <thead><tr><th>Checked</th><th>Product</th><th>Listed price</th><th>Availability</th></tr></thead>
        <tbody>{data.history.map(p => <tr key={p.observation_id}>
          <td>{formatDateTime(p.checked_at)}</td>
          <td><a href={p.product_url} target="_blank" rel="noreferrer">{p.product_title}</a></td>
          <td>{currency(p.price_cents / 100, p.currency)}</td><td>{p.available ? 'In stock' : 'Out of stock'}</td>
        </tr>)}</tbody>
      </table></div>
    </details>}
  </section>;
}
