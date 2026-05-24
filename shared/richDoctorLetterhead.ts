import {
  getRichLetterheadForTemplate,
  REPORT_RICH_LETTERHEAD,
  RICH_LETTERHEAD_MARKER,
} from './templateLetterheads';

export { RICH_LETTERHEAD_MARKER };

/** All workspace / client-Gemini notes use the rich HTML letterhead in the editor. */
export function templateUsesRichHtmlLetterhead(_templateId?: string): boolean {
  return true;
}

/** Matches NoteEditor / body sans-serif stack — used below the closed letterhead only. */
const CLINICAL_BODY_FONT =
  "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;";

/** Default letterhead (Report style). */
export const RICH_DOCTOR_LETTERHEAD = REPORT_RICH_LETTERHEAD;

export function noteHasRichLetterhead(content: string): boolean {
  return (content ?? '').includes(RICH_LETTERHEAD_MARKER) || (content ?? '').includes('id="rich-doctor-letterhead"');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert plain / light-markdown clinical text to simple HTML paragraphs. */
export function plainClinicalTextToHtml(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return '';
  if (/<[a-z][\s\S]*>/i.test(t)) return t;

  const blocks = t.split(/\n{2,}/);
  const parts: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0];
    if (/^##\s+/.test(first)) {
      const heading = escapeHtml(first.replace(/^##\s+/, ''));
      const body = lines.slice(1).join('\n');
      parts.push(
        `<h3 class="rich-clinical-h3" style="margin:10px 0 4px;font-size:clamp(9px,2.6vw,11pt);font-weight:bold;">${heading}</h3>`
      );
      if (body.trim()) {
        parts.push(
          `<p class="rich-clinical-p" style="margin:0 0 6px;font-size:clamp(9px,2.6vw,11pt);line-height:1.35;">${escapeHtml(body).replace(/\n/g, '<br/>')}</p>`
        );
      }
    } else if (/^\*\*.+\*\*$/.test(first) && lines.length === 1) {
      parts.push(
        `<p class="rich-clinical-p rich-clinical-label" style="margin:0 0 6px;font-size:clamp(9px,2.6vw,11pt);font-weight:bold;">${escapeHtml(first.replace(/\*\*/g, ''))}</p>`
      );
    } else {
      const html = escapeHtml(lines.join('\n')).replace(/\n/g, '<br/>');
      parts.push(
        `<p class="rich-clinical-p" style="margin:0 0 6px;font-size:clamp(9px,2.6vw,11pt);line-height:1.35;">${html}</p>`
      );
    }
  }
  return parts.join('\n');
}

/**
 * Assemble editor HTML in order: letterhead → demographics table → clinical body.
 */
export function combineRichLetterheadWithClinicalNote(
  clinicalBody: string,
  demographicsHtml?: string | null,
  templateId?: string
): string {
  const head = templateId ? getRichLetterheadForTemplate(templateId) : RICH_DOCTOR_LETTERHEAD;
  const demo = (demographicsHtml ?? '').trim();
  const bodyHtml = plainClinicalTextToHtml(clinicalBody.trim());
  const parts: string[] = [head];
  if (demo) {
    parts.push('<div class="rich-note-gap" aria-hidden="true"></div>', demo);
  }
  if (bodyHtml) {
    if (!demo) parts.push('<div class="rich-note-gap" aria-hidden="true"></div>');
    parts.push(
      `<div class="clinical-note-body" style="${CLINICAL_BODY_FONT}font-size:clamp(9px,2.6vw,11pt);line-height:1.35;color:#000;">${bodyHtml}</div>`
    );
  }
  return parts.join('');
}

/** Remove letterhead wrapper from stored note HTML. */
export function stripRichLetterheadFromNote(content: string): string {
  let t = content ?? '';
  const markerIdx = t.indexOf('id="rich-doctor-letterhead"');
  if (markerIdx === -1) return t;
  const bodyIdx = t.indexOf('class="clinical-note-body"');
  if (bodyIdx !== -1) {
    const open = t.indexOf('>', bodyIdx);
    const close = t.lastIndexOf('</div>');
    if (open !== -1 && close > open) {
      return t.slice(open + 1, close).trim();
    }
  }
  const afterHead = t.indexOf('</div>');
  if (afterHead !== -1) {
    t = t
      .slice(afterHead + 6)
      .replace(/^(\s*<div[^>]*class="rich-note-gap"[^>]*>\s*<\/div>\s*)+/i, '')
      .replace(/^(\s*<br\s*\/?>\s*){1,}/i, '')
      .trim();
  }
  return t;
}

/** Plain text for DOCX / PDF / email from HTML or plain note content. */
export function htmlNoteContentToPlainText(content: string): string {
  let t = stripRichLetterheadFromNote(content);
  t = t.replace(/<table[^>]*data-rooms-patient-table="true"[^>]*>[\s\S]*?<\/table>\s*/gi, '');
  t = t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t;
}
