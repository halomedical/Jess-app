/** Mask secrets for logs — never print full API keys. */
export function maskSecret(value: string | undefined, visible = 4): string {
  if (!value?.trim()) return '(missing)';
  const v = value.trim();
  if (v.length <= visible) return `${v[0] ?? '?'}***`;
  return `${v.slice(0, visible)}*** (len=${v.length})`;
}
