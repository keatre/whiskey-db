// web/src/lib/apiPath.ts
// Normalizes any API-served path so it works in the browser.
// - Absolute http(s): return as-is
// - Already prefixed with API base: return as-is
// - Legacy: '/static/uploads/...'  -> prefix API base
// - New:    '/uploads/...'         -> prefix API base
// - Bare:   'static/uploads/...' or 'uploads/...': add leading slash + prefix

export function apiPath(path?: string | null): string {
  if (!path) return "";

  const p = String(path).trim();
  const base = (process.env.NEXT_PUBLIC_API_BASE || "/api").replace(/\/+$/, "");

  // Absolute URL untouched
  if (/^https?:\/\//i.test(p)) return p;

  // Already has API base
  if (p.startsWith(base + "/")) return p;

  // Normalize bare forms
  if (p.startsWith("static/uploads/")) return `${base}/` + p;
  if (p.startsWith("uploads/")) return `${base}/` + p;

  // Normalize leading-slash legacy/new forms
  if (p.startsWith("/static/uploads/")) return `${base}${p}`;
  if (p.startsWith("/uploads/")) return `${base}${p}`;

  // Fallback: if it's a bare relative, just prefix
  if (!p.startsWith("/")) return `${base}/${p}`;

  return p;
}
