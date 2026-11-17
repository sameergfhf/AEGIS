/** Parse backend timestamps consistently: SQL databases return UTC timestamps without an offset. */
export function parseApiTimestamp(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

export function formatApiTimestamp(value: string, options?: Intl.DateTimeFormatOptions): string {
  const date = parseApiTimestamp(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, options);
}
