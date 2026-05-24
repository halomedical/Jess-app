/** Model placeholders — treat as empty (not dictated). */
const EMPTY_PLACEHOLDER = /^(?:not\s+discussed|n\/?a|nil|—|-|--|\.)$/i;

/** Strip filler text the model must not output; leave clinical "No" / "None" when dictated. */
export function sanitizeTemplateFieldValue(value: string): string {
  const t = (value ?? '').trim();
  if (!t) return '';
  if (EMPTY_PLACEHOLDER.test(t)) return '';
  if (/^not\s+discussed\b/i.test(t)) return '';
  return t;
}

/** Convert snake_case field keys to Title Case labels (e.g. family_hx → Family Hx). */
export function humanizeFieldKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse ---FIELD:key--- blocks from model output. */
export function parseFieldBlocks<T extends string>(
  text: string,
  keys: readonly T[]
): Partial<Record<T, string>> {
  const out: Partial<Record<T, string>> = {};
  const allowed = new Set<string>(keys);
  const re = /---FIELD:(\w+)---\s*([\s\S]*?)(?=---FIELD:\w+---|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    if (allowed.has(key)) {
      out[key as T] = sanitizeTemplateFieldValue(m[2]);
    }
  }
  return out;
}

function labelVariants(key: string): string[] {
  const base = humanizeFieldKey(key);
  return [
    base,
    base.replace(/\bHx\b/g, 'HX'),
    base.replace(/\bHx\b/g, 'Hx'),
    key.replace(/_/g, ' '),
  ];
}

/** Parse **Field Label**: value lines (Gemini markdown dump fallback). */
export function parseMarkdownLabelFields<T extends string>(
  text: string,
  keys: readonly T[]
): Partial<Record<T, string>> {
  const out: Partial<Record<T, string>> = {};
  const normalized = text.replace(/\r\n/g, '\n');

  for (const key of keys) {
    for (const label of labelVariants(key)) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `(?:^|\\n)\\s*\\*{0,2}\\s*${escaped}\\s*\\*{0,2}\\s*:?\\s*([^\\n]+)`,
        'im'
      );
      const m = normalized.match(re);
      if (m?.[1]) {
        const val = m[1].replace(/\*+/g, '').trim();
        const clean = sanitizeTemplateFieldValue(val);
        if (clean && !out[key]) out[key] = clean;
      }
    }
  }
  return out;
}

export function mergeFieldMaps<T extends string>(
  ...maps: Partial<Record<T, string>>[]
): Record<T, string> {
  const out = {} as Record<T, string>;
  for (const map of maps) {
    for (const [k, v] of Object.entries(map) as [T, string][]) {
      if ((v ?? '').trim()) out[k] = v.trim();
    }
  }
  return out;
}
