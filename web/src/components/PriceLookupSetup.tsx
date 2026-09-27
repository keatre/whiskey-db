'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateTime } from '../lib/formatDate';

const API = process.env.NEXT_PUBLIC_API_BASE || '/api';
type Batch = {
  batch_id: number; status: string; total: number; completed: number;
  updated: number; failed: number; needs_attention: number; skipped: number;
  current_bottle: string | null; created_at: string; finished_at: string | null;
  results: { bottle_id: number; name: string; status: string; message: string }[];
};
type Setup = {
  sources: { id: string; name: string }[]; eligible: number; missing_identifier: number; batch: Batch | null;
};

async function loadSetup(): Promise<Setup> {
  const response = await fetch(`${API}/admin/price-setup`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load price lookup setup. An admin session is required.');
  return response.json();
}

export default function PriceLookupSetup() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [source, setSource] = useState('lovescotch');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const batch = setup?.batch;
  const active = batch?.status === 'queued' || batch?.status === 'running';

  useEffect(() => {
    let mounted = true;
    loadSetup().then(value => { if (mounted) setSetup(value); })
      .catch(err => { if (mounted) setError(err.message); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const timer = setInterval(() => {
      loadSetup().then(value => { if (mounted) { setSetup(value); setError(''); } })
        .catch(err => { if (mounted) setError(err.message); });
    }, 3000);
    return () => { mounted = false; clearInterval(timer); };
  }, [active]);

  async function start() {
    setStarting(true);
    setError('');
    try {
      const response = await fetch(`${API}/admin/price-setup/batch`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Unable to start price lookups.');
      setSetup(previous => previous ? { ...previous, batch: result } : previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start price lookups.');
      // Another admin may have started a batch; display its status.
      try { setSetup(await loadSetup()); } catch { /* retain the original error */ }
    } finally { setStarting(false); }
  }

  return <section className="card" style={{ marginTop: 24, padding: 16 }}>
    <h2>Price lookup setup</h2>
    <p>Refresh whiskey prices that are missing or at least seven days old. Existing product links are reused;
      unlinked bottles are matched by UPC. Wine is excluded.</p>
    {error && <p role="alert">{error}</p>}
    {!setup && !error && <p>Loading price lookup setup…</p>}
    {setup && <>
      <p><label>Price source{' '}
        <select value={source} disabled={active || starting} onChange={event => setSource(event.target.value)}>
          {setup.sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label></p>
      <p>{setup.eligible} bottles due for a price lookup.
        {setup.missing_identifier > 0 && ` ${setup.missing_identifier} bottles need a UPC or manual product link first.`}</p>
      <button disabled={active || starting || setup.eligible === 0} onClick={start}>
        {starting ? 'Starting…' : active ? 'Price lookups running…' : 'Look up prices missing or older than 7 days'}
      </button>
      <p>Runs in the background; you can leave this page and return to check progress.
        This starts a one-time batch and does not enable scheduled refresh.</p>
      {batch && <div role="status" aria-live="polite">
        <h3>Batch #{batch.batch_id}: {batch.status}</h3>
        <p>Started {formatDateTime(batch.created_at)}
          {batch.finished_at && ` · Finished ${formatDateTime(batch.finished_at)}`}</p>
        {batch.total > 0 && <progress aria-label="Batch progress" value={batch.completed} max={batch.total} />}
        <p>{batch.completed} / {batch.total} checked · {batch.updated} updated · {batch.needs_attention} need attention
          {' · '}{batch.failed} failed · {batch.skipped} skipped</p>
        {active && batch.current_bottle && <p>Checking {batch.current_bottle}…</p>}
        {batch.status === 'interrupted' && <p>The batch was interrupted. Start another batch to check bottles still due.</p>}
      </div>}
      {!!batch?.results.length && <details>
        <summary>View bottle results</summary>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>Bottle</th><th>Result</th><th>Details</th></tr></thead>
          <tbody>{batch.results.map(result => <tr key={result.bottle_id}>
            <td><Link href={`/bottles/${result.bottle_id}`}>{result.name}</Link></td>
            <td>{result.status.replaceAll('_', ' ')}</td><td>{result.message}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
    </>}
  </section>;
}
