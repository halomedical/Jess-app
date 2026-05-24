import type { ReportNoteFields } from './parseReportNoteContent';

/** True when text looks like clinical prose, not a chart/file identifier. */
export function isClinicalProseNotChartId(value: string): boolean {
  const t = (value ?? '').trim();
  if (!t) return false;
  if (t.length > 45) return true;
  if (/\b(year[- ]?old|y\.?o\.?|male|female|presenting|patient|history|complaint|symptom)\b/i.test(t)) {
    return true;
  }
  if ((t.match(/[.!?]/g) ?? []).length >= 1 && t.length > 25) return true;
  return false;
}

export function isLikelySaIdNumber(value: string): boolean {
  const t = (value ?? '').trim();
  if (!t) return false;
  const digits = t.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export function isLikelyFileNumber(value: string): boolean {
  const t = (value ?? '').trim();
  if (!t) return false;
  if (isClinicalProseNotChartId(t)) return false;
  if (t.length > 35) return false;
  return true;
}

function stripLeadingDemographicLines(text: string): string {
  let t = (text ?? '').trim();
  t = t.replace(/^(?:RE:\s*[^\n]+\n?)+/im, '');
  t = t.replace(/^(?:ID\s*no\.?\s*[^\n]+\n?)+/im, '');
  t = t.replace(/^(?:File\s*no\.?\s*[^\n]+\n?)+/im, '');
  return t.trim();
}

/** Keep Report DOCX fields in the correct template slots (file/id lines vs background body). */
export function sanitizeReportDocxFields(fields: ReportNoteFields): ReportNoteFields {
  const out: ReportNoteFields = { ...fields };

  if (out.file_no && isClinicalProseNotChartId(out.file_no)) {
    const prose = out.file_no.trim();
    if (!out.background?.trim()) {
      out.background = prose;
    } else if (!out.background.includes(prose.slice(0, 40))) {
      out.background = `${prose}\n\n${out.background}`.trim();
    }
    out.file_no = '';
  }

  if (out.id_no && !isLikelySaIdNumber(out.id_no) && isClinicalProseNotChartId(out.id_no)) {
    out.id_no = '';
  }

  if (out.background) {
    out.background = stripLeadingDemographicLines(out.background);
  }

  return out;
}
