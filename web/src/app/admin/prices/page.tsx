'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';

import AdminOnly from '../../../components/AdminOnly';
import type { MarketPrice } from '../../../api/marketPrices';
import { MarketPricesApi } from '../../../api/marketPrices';
import { formatDateTime } from '../../../lib/formatDate';

const LATEST_KEY = ['/admin/prices', 'latest'];

function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function AdminPricesPage() {
  return (
    <AdminOnly>
      <PriceManager />
    </AdminOnly>
  );
}

function PriceManager() {
  const { data, error, isLoading, mutate } = useSWR<MarketPrice[]>(
    LATEST_KEY,
    () => MarketPricesApi.fetchPrices({ latest: true, limit: 100 }),
    { revalidateOnFocus: true }
  );

  const prices = data ?? [];
  const [editing, setEditing] = useState<MarketPrice | null>(null);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const handleEditSaved = useCallback(async () => {
    await refresh();
    setEditing(null);
  }, [refresh]);

  return (
    <main>
      <h1>Market prices</h1>
      <p>Upload manual valuations or sync them from a configured provider.</p>

      <section style={{ marginBottom: 32, display: 'grid', gap: 24, maxWidth: 720 }}>
        <ManualPriceForm onCreated={refresh} />
        <ProviderSyncForm onSynced={refresh} />
        {editing && <EditPriceForm price={editing} onCancel={() => setEditing(null)} onSaved={handleEditSaved} />}
      </section>

      <section>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Latest price records</h2>
            <p style={{ margin: 0, color: 'var(--muted, #666)' }}>
              Most recent entry per UPC. Refresh after uploads or syncs to see updates.
            </p>
          </div>
          <button type="button" onClick={refresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>Failed to load prices: {String(error)}</p>}
        {!isLoading && !error && prices.length === 0 && <p>No price records yet.</p>}

        {prices.length > 0 && <PriceTable prices={prices} onEdit={setEditing} />}
      </section>
    </main>
  );
}

function ManualPriceForm({ onCreated }: { onCreated: () => Promise<unknown> | void }) {
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [source, setSource] = useState('');
  const [provider, setProvider] = useState('');
  const [asOf, setAsOf] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const numericPrice = price.trim() ? Number(price) : null;
      if (numericPrice !== null && Number.isNaN(numericPrice)) {
        throw new Error('Price must be a number');
      }

      const isoDate = asOf ? new Date(asOf).toISOString() : null;

      await MarketPricesApi.createPrice({
        barcode_upc: barcode.trim(),
        price: numericPrice,
        currency: currency.trim() || undefined,
        source: source.trim() || undefined,
        provider: provider.trim() || undefined,
        as_of: isoDate,
        ingest_type: 'manual',
        notes: notes.trim() || undefined,
      });

      setMessage('Price saved');
      setBarcode('');
      setPrice('');
      setSource('');
      setProvider('');
      setAsOf('');
      setNotes('');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save price');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: 4 }}>Manual entry</h2>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Barcode / UPC</span>
        <input
          type="text"
          required
          minLength={3}
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          placeholder="012345678905"
        />
      </label>

      <div
        style={{
          display: 'grid',
          gap: 12,
          width: '100%',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(96px, 140px)',
          alignItems: 'end',
        }}
      >
        <label
          style={{
            display: 'grid',
            gap: 4,
            minWidth: 0,
            width: '100%',
          }}
        >
          <span>Price</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="99.95"
          />
        </label>
        <label
          style={{
            display: 'grid',
            gap: 4,
            justifySelf: 'end',
            width: 'fit-content',
          }}
        >
          <span>Currency</span>
          <input
            type="text"
            value={currency}
            onChange={e => setCurrency(e.target.value.toUpperCase())}
            placeholder="USD"
            maxLength={6}
            style={{ width: '100%', maxWidth: '100%' }}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Source (optional)</span>
        <input
          type="text"
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="Manual upload, Auction, etc."
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Provider override (optional)</span>
        <input
          type="text"
          value={provider}
          onChange={e => setProvider(e.target.value)}
          placeholder="manual"
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>As of (optional)</span>
        <input
          type="datetime-local"
          value={asOf}
          onChange={e => setAsOf(e.target.value)}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="File name, comments, etc."
          rows={3}
        />
      </label>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save price'}
      </button>

      {message && <p style={{ color: 'var(--success, #15803d)' }}>{message}</p>}
      {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p>}
    </form>
  );
}

function ProviderSyncForm({ onSynced }: { onSynced: () => Promise<unknown> | void }) {
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const result = await MarketPricesApi.syncPrice({
        barcode_upc: barcode.trim(),
        notes: notes.trim() || undefined,
      });
      setMessage(`Fetched price ${result.price ?? '—'} ${result.currency ?? ''} from ${result.source ?? result.provider ?? 'provider'}`);
      setBarcode('');
      setNotes('');
      await onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSync} className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: 4 }}>Provider sync</h2>
      <p style={{ margin: 0, color: 'var(--muted, #666)' }}>
        Attempts to fetch from the configured MARKET_PRICE_PROVIDER_URL. If no provider is configured the sync will
        return an error.
      </p>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Barcode / UPC</span>
        <input
          type="text"
          required
          minLength={3}
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          placeholder="012345678905"
        />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span>Notes (optional)</span>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Logged for nightly sync"
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Syncing…' : 'Sync from provider'}
      </button>
      {message && <p style={{ color: 'var(--success, #15803d)' }}>{message}</p>}
      {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p>}
    </form>
  );
}

function EditPriceForm({ price, onCancel, onSaved }: { price: MarketPrice; onCancel: () => void; onSaved: () => Promise<unknown> | void }) {
  const [amount, setAmount] = useState(price.price != null ? String(price.price) : '');
  const [currency, setCurrency] = useState(price.currency ?? 'USD');
  const [source, setSource] = useState(price.source ?? '');
  const [provider, setProvider] = useState(price.provider ?? '');
  const [notes, setNotes] = useState(price.notes ?? '');
  const [asOf, setAsOf] = useState(toDateTimeLocal(price.as_of));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const numericPrice = amount.trim() ? Number(amount) : null;
      if (numericPrice !== null && Number.isNaN(numericPrice)) {
        throw new Error('Price must be a number');
      }

      const isoDate = asOf ? new Date(asOf).toISOString() : null;

      await MarketPricesApi.updatePrice(price.price_id, {
        price: numericPrice,
        currency: currency.trim() || undefined,
        source: source.trim() || undefined,
        provider: provider.trim() || undefined,
        as_of: isoDate,
        notes: notes.trim() || undefined,
      });

      setMessage('Price updated');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update price');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Edit latest record</h2>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      <div style={{ opacity: 0.7 }}>UPC {price.barcode_upc}</div>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Price</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Currency</span>
        <input
          type="text"
          value={currency}
          onChange={e => setCurrency(e.target.value.toUpperCase())}
          maxLength={6}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Source (optional)</span>
        <input type="text" value={source} onChange={e => setSource(e.target.value)} />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Provider (optional)</span>
        <input type="text" value={provider} onChange={e => setProvider(e.target.value)} />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>As of (optional)</span>
        <input type="datetime-local" value={asOf} onChange={e => setAsOf(e.target.value)} />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Notes (optional)</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
      </label>

      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      {message && <p style={{ color: 'var(--success, #15803d)' }}>{message}</p>}
      {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p>}
    </form>
  );
}

function PriceTable({ prices, onEdit }: { prices: MarketPrice[]; onEdit: (price: MarketPrice) => void }) {
  const rows = useMemo(
    () =>
      prices
        .slice()
        .sort((a, b) => {
          const left = new Date(a.as_of ?? a.fetched_at).getTime();
          const right = new Date(b.as_of ?? b.fetched_at).getTime();
          return right - left;
        }),
    [prices]
  );

  const formatDate = (value: string | null) => formatDateTime(value);

  return (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={th}>Barcode</th>
            <th style={th}>Price</th>
            <th style={th}>Currency</th>
            <th style={th}>Source</th>
            <th style={th}>Provider</th>
            <th style={th}>As of</th>
            <th style={th}>Fetched</th>
            <th style={th}>Ingest</th>
            <th style={th}>Notes</th>
            <th style={{ ...th, width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.price_id}>
              <td style={td}>{row.barcode_upc}</td>
              <td style={td}>{row.price != null ? row.price.toFixed(2) : '—'}</td>
              <td style={td}>{row.currency ?? '—'}</td>
              <td style={td}>{row.source ?? '—'}</td>
              <td style={td}>{row.provider ?? '—'}</td>
              <td style={td}>{formatDate(row.as_of)}</td>
              <td style={td}>{formatDate(row.fetched_at)}</td>
              <td style={td}>{row.ingest_type}</td>
              <td style={td}>{row.notes ?? '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button type="button" onClick={() => onEdit(row)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '0.9rem',
};

const td: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'top',
  fontSize: '0.9rem',
};
