/** Format docxtemplater "Multi error" and other template failures for logs and API responses. */
export function formatDocxtemplaterError(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return err instanceof Error ? err.message : String(err ?? 'Unknown DOCX error');
  }

  const e = err as {
    message?: string;
    properties?: {
      errors?: Array<{
        message?: string;
        properties?: { explanation?: string; context?: string; file?: string };
      }>;
    };
  };

  const sub = e.properties?.errors;
  if (Array.isArray(sub) && sub.length > 0) {
    const lines = sub.map((item, i) => {
      const detail =
        item.properties?.explanation?.trim() ||
        item.properties?.context?.trim() ||
        item.message?.trim() ||
        'Unknown template issue';
      const file = item.properties?.file ? ` (${item.properties.file})` : '';
      return `${i + 1}. ${detail}${file}`;
    });
    return `Word template could not be filled:\n${lines.join('\n')}`;
  }

  const msg = e.message?.trim();
  if (msg && msg !== 'Multi error') return msg;
  if (msg === 'Multi error') {
    return 'Word template could not be filled (multiple placeholder errors in the .docx file).';
  }

  return err instanceof Error ? err.message : 'Word template could not be filled.';
}

/** Log full docxtemplater error details to the server console. */
export function logDocxtemplaterError(context: string, err: unknown): void {
  console.error(`[DOCX] ${context}:`, formatDocxtemplaterError(err));
  if (err && typeof err === 'object' && 'properties' in err) {
    const sub = (err as { properties?: { errors?: unknown[] } }).properties?.errors;
    if (Array.isArray(sub)) {
      console.error(`[DOCX] ${context} — ${sub.length} sub-error(s):`, JSON.stringify(sub, null, 2));
    }
  }
}
