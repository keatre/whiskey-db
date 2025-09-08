export const currency = (n: number | null | undefined, currency = 'USD', locale = 'en-US') =>
  (n == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n));
