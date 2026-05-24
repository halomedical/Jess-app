/**
 * Word splits {{placeholders}} across XML runs (spell-check).
 * Closing braces are often ` }</w:t>…<w:t>}` rather than contiguous `}}`.
 * docxtemplater needs contiguous {{key}} tags — repair each tag in place.
 */
function extractPlaceholderKey(rawInner: string): string | null {
  const inner = rawInner
    .replace(/<\/w:t>[\s\S]*?<w:t(?:\s[^>]*)?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .replace(/}+$/g, '')
    .trim();
  if (!inner || !/^[a-zA-Z0-9_]+$/.test(inner)) return null;
  return inner;
}

/** Find the index of the second `}` in a closing `}}`, allowing XML/whitespace between braces. */
function findPlaceholderClose(xml: string, searchFrom: number): number {
  let pos = searchFrom;
  while (pos < xml.length) {
    if (xml[pos] !== '}') {
      pos++;
      continue;
    }
    let q = pos + 1;
    while (q < xml.length) {
      const ch = xml[q];
      if (ch === '}') return q;
      if (ch === '{') return -1;
      if (ch === '<') {
        const end = xml.indexOf('>', q);
        q = end === -1 ? xml.length : end + 1;
        continue;
      }
      if (!/\s/.test(ch)) return -1;
      q++;
    }
    return -1;
  }
  return -1;
}

export function repairSplitDocxPlaceholders(xml: string): string {
  let result = '';
  let i = 0;

  while (i < xml.length) {
    const open = xml.indexOf('{{', i);
    if (open === -1) {
      result += xml.slice(i);
      break;
    }
    result += xml.slice(i, open);

    const close = findPlaceholderClose(xml, open + 2);
    if (close === -1) {
      result += xml.slice(open);
      break;
    }

    const segment = xml.slice(open, close + 1);
    const key = extractPlaceholderKey(segment.slice(2));
    if (key) {
      result += `{{${key}}}`;
    } else {
      result += segment;
    }
    i = close + 1;
  }

  return result;
}

/** List {{key}} tags present in template XML after repair. */
export function listDocxPlaceholderKeys(xml: string): string[] {
  const repaired = repairSplitDocxPlaceholders(xml);
  const keys = new Set<string>();
  for (const m of repaired.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)) {
    keys.add(m[1]);
  }
  return [...keys];
}
