import type { HaloNote } from './types';

/** Plain text for saving, emailing, or DOCX — uses `content` or reconstructs from `fields`. */
export function buildNotePlainText(note: Pick<HaloNote, 'content' | 'fields'>): string {
  const c = (note.content ?? '').trim();
  if (c) return note.content ?? '';
  if (note.fields?.length) {
    return note.fields
      .map((f) => (f.label ? `${f.label}:\n${f.body ?? ''}` : f.body ?? ''))
      .filter((block) => block.trim().length > 0)
      .join('\n\n');
  }
  return '';
}
