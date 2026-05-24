import type { ReportNoteFields } from './parseReportNoteContent';

/** Human-readable editor body for Report (no letterhead — DOCX/PDF add that separately). */
export function formatReportNoteForEditor(f: ReportNoteFields): string {
  const lines: string[] = [];
  if (f.date) lines.push(f.date, '');
  if (f.addressee) lines.push(f.addressee);
  if (f.addressee_location) lines.push(f.addressee_location);
  if (f.addressee_email) lines.push(f.addressee_email);
  if (f.addressee || f.addressee_location || f.addressee_email) lines.push('');

  lines.push(`RE:  ${f.patient_name || ''}`);
  lines.push(`ID no. ${f.id_no || ''}`);
  lines.push(`File no. ${f.file_no || ''}`);
  lines.push('');

  if (f.background) {
    lines.push(f.background, '');
  }
  if (f.clinical_examination.trim()) {
    lines.push('CLINICAL EXAMINATION:', '', f.clinical_examination, '');
  }
  if (f.special_investigations.trim()) {
    lines.push('SPECIAL INVESTIGATIONS:', '', f.special_investigations, '');
  }
  if (f.assessment_plan.trim()) {
    lines.push('ASSESSMENT AND PLAN:', '', f.assessment_plan);
  }
  return lines.join('\n').trim();
}
