export function formatIsoTimestamp(iso?: string, fallback = 'Never'): string {
  if (!iso) {
    return fallback;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString();
}
