/**
 * Spoken cues at the start of dictation map to Halo template_id values.
 * Kept conservative to avoid matching incidental words in clinical narrative.
 */

import {
  ECHO_TEMPLATE_ID,
  REPORT_TEMPLATE_ID,
  ROOMS_CONSULT_TEMPLATE_ID,
} from './haloTemplates';

const HEAD_LEN = 520;

/** Match cue in the opening of the transcript (full or new chunk). */
export function detectTemplateIntentFromDictationHead(text: string): string | null {
  const head = (text ?? '').slice(0, HEAD_LEN).toLowerCase();

  const echoHints =
    /\b(this is|it is|it's|dictating|dictation of)( an?| a)? echo report\b/.test(head) ||
    /\b(this is|it is|it's|dictating|dictation of)( an?| a)? cardiac echo\b/.test(head) ||
    /\becho report\b/.test(head) ||
    /^[\s]*echo report[\s,.\-:]/im.test(text ?? '');

  if (echoHints) return ECHO_TEMPLATE_ID;

  const roomsHints =
    /\brooms consult\b/.test(head) ||
    /\broom consult\b/.test(head) ||
    /\bconsult (for |to )?rooms\b/.test(head) ||
    /\bfor (a |an )?rooms consult\b/.test(head);

  if (roomsHints) return ROOMS_CONSULT_TEMPLATE_ID;

  const reportHints =
    /\b(this is|it is|it's|dictating|dictation of)( a)? report\b/.test(head) ||
    /\b(procedure|formal|investigation|pathology|radiology) report\b/.test(head);

  if (reportHints) return REPORT_TEMPLATE_ID;

  return null;
}

/** Remove a single leading meta line the user spoke to pick the template (optional). */
export function stripLeadingDictationTemplateCue(transcript: string): string {
  let t = (transcript ?? '').trim();
  if (!t) return t;

  const firstLine = t.split(/\r?\n/)[0]?.trim() ?? '';
  if (!firstLine) return t;

  const lineLooksLikeCue =
    /^(this is|it is|it's|dictating|dictation of)\b/i.test(firstLine) ||
    /^echo report\b/i.test(firstLine);

  const mentionsReference =
    /\b(echo report|cardiac echo|rooms consult|room consult|consult for rooms|procedure report|formal report|investigation report)\b/i.test(
      firstLine
    );

  if (lineLooksLikeCue && mentionsReference) {
    const rest = t.slice(t.indexOf('\n') + 1).trim();
    return rest || t;
  }
  return t;
}
