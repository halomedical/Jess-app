import type { HaloNote } from './types';
import { buildNotePlainText } from './notePlainText';
import { formatAgeFromIsoDob, type PatientForDocuments } from './patientDemographics';

/**
 * Strip common markdown / markup from model output so PDF preview reads as a finished document.
 */
export function stripClinicalMarkdownForPdf(s: string): string {
  let t = (s ?? '').replace(/\r\n/g, '\n');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/\*([^*\n]+)\*/g, '$1');
  t = t.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  t = t.replace(/^\s*[-*]\s+/gm, '• ');
  return t.trim();
}

function visitTypeLabel(visitType: PatientForDocuments['visitType']): string {
  if (visitType === 'new') return 'New patient';
  if (visitType === 'follow_up') return 'Follow-up';
  return '';
}

/**
 * Compact patient block for human-readable preview (no Halo / Gemini instruction preamble).
 */
export function buildPatientHeaderForPreview(patient: PatientForDocuments): string {
  const name = (patient.name ?? '').trim();
  const age = formatAgeFromIsoDob(patient.dob || '');
  const lines: string[] = [
    `Patient: ${name || '—'}`,
    `DOB: ${patient.dob || '—'}    Age: ${age}    Sex: ${patient.sex || '—'}`,
  ];
  const folderNo = (patient.folderNumber ?? '').trim();
  const contact = (patient.contactNumber ?? '').trim();
  const refDoc = (patient.referringDoctor ?? '').trim();
  const vt = visitTypeLabel(patient.visitType);
  const vDate = (patient.visitDate ?? '').trim();
  if (folderNo) lines.push(`Folder / file no.: ${folderNo}`);
  if (contact) lines.push(`Contact: ${contact}`);
  if (refDoc) lines.push(`Referring doctor: ${refDoc}`);
  if (vt) lines.push(`Visit type: ${vt}`);
  if (vDate) lines.push(`Visit date: ${vDate}`);
  return lines.join('\n');
}

/**
 * Text sent to /note-preview-pdf only: title + chart header + cleaned note body.
 * Excludes buildNoteTextWithPatientChart instructional blocks used for Halo/DOCX generation.
 */
export function buildNotePreviewPdfText(
  patient: PatientForDocuments,
  note: Pick<HaloNote, 'title' | 'content' | 'fields'>
): string {
  const plain = buildNotePlainText(note);
  const body = stripClinicalMarkdownForPdf(plain);
  const title = (note.title ?? '').trim();
  const header = buildPatientHeaderForPreview(patient);
  const parts: string[] = [];
  if (title) parts.push(title);
  if (header) parts.push(header);
  if (body) parts.push(body);
  return parts.filter(Boolean).join('\n\n');
}
