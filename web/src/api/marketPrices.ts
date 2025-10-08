// web/src/api/marketPrices.ts
// Client helpers for admin market price management.

export type MarketPrice = {
  price_id: number;
  barcode_upc: string;
  price: number | null;
  currency: string | null;
  source: string | null;
  provider: string | null;
  as_of: string | null;
  fetched_at: string;
  ingest_type: string;
  created_by: string | null;
  notes: string | null;
};

type QueryOpts = {
  upc?: string;
  latest?: boolean;
  limit?: number;
};

const BROWSER_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) || '/api';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const message = (await res.text().catch(() => '')) || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function fetchPrices(opts: QueryOpts = {}): Promise<MarketPrice[]> {
  const params = new URLSearchParams();
  if (opts.upc) params.set('upc', opts.upc);
  if (opts.latest) params.set('latest', 'true');
  if (opts.limit) params.set('limit', String(opts.limit));

  const search = params.toString();
  const res = await fetch(`${BROWSER_BASE}/admin/prices${search ? `?${search}` : ''}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  return handle<MarketPrice[]>(res);
}

export async function createPrice(input: {
  barcode_upc: string;
  price?: number | null;
  currency?: string;
  source?: string;
  provider?: string;
  as_of?: string | null;
  ingest_type?: 'manual' | 'csv' | 'provider';
  notes?: string | null;
}): Promise<MarketPrice> {
  const res = await fetch(`${BROWSER_BASE}/admin/prices`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handle<MarketPrice>(res);
}

export async function syncPrice(input: { barcode_upc: string; notes?: string | null }): Promise<MarketPrice> {
  const res = await fetch(`${BROWSER_BASE}/admin/prices/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handle<MarketPrice>(res);
}

export async function updatePrice(
  id: number,
  input: {
    price?: number | null;
    currency?: string | null;
    source?: string | null;
    provider?: string | null;
    as_of?: string | null;
    notes?: string | null;
  }
): Promise<MarketPrice> {
  const res = await fetch(`${BROWSER_BASE}/admin/prices/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handle<MarketPrice>(res);
}

export const MarketPricesApi = {
  fetchPrices,
  createPrice,
  syncPrice,
  updatePrice,
};
