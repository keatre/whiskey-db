const TZ_CANDIDATE =
  process.env.NEXT_PUBLIC_TZ && process.env.NEXT_PUBLIC_TZ.trim().length > 0
    ? process.env.NEXT_PUBLIC_TZ.trim()
    : process.env.TZ && process.env.TZ.trim().length > 0
    ? process.env.TZ.trim()
    : undefined;

const DISPLAY_TIME_ZONE = TZ_CANDIDATE || Intl.DateTimeFormat().resolvedOptions().timeZone;

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: DISPLAY_TIME_ZONE,
};

export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '—';
  }

  const fmt = new Intl.DateTimeFormat(undefined, { ...DEFAULT_FORMAT, ...options, timeZone: DISPLAY_TIME_ZONE });
  return fmt.format(date);
}
