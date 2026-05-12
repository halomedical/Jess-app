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

function stripBoldMarkers(line: string): string {
  return line.replace(/\*\*/g, '').trim();
}

/** First line that begins the clinical Rooms-style sections (markdown ## already stripped for PDF). */
function isClinicalSectionStartLine(line: string): boolean {
  const s = stripBoldMarkers(line);
  if (!s) return false;
  const t = s.toLowerCase();
  return (
    /^reason for consultation\b/i.test(s) ||
    /^reason for consult\b/i.test(s) ||
    /^indication\b.*\bconsult/i.test(t) ||
    /^history of present illness\b/i.test(s) ||
    /^history of present\b/i.test(s) ||
    /^past medical history\b/i.test(s) ||
    /^past medical history\s*&/i.test(s) ||
    /^examination\s*\/\s*pertinent/i.test(s) ||
    /^investigations\b/i.test(s) ||
    /^assessment\b/i.test(s) ||
    /^plan and follow-up\b/i.test(s) ||
    /^plan and follow\b/i.test(s)
  );
}

/** Everything before the first clinical section heading vs the remainder (including that heading). */
function splitPreambleAndRestAfterClinicalStart(body: string): { preamble: string; rest: string } {
  const raw = body.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < raw.length && !raw[start].trim()) start++;
  let i = start;
  for (; i < raw.length; i++) {
    const t = raw[i];
    if (!t.trim()) continue;
    if (isClinicalSectionStartLine(t)) break;
  }
  if (i >= raw.length) {
    return { preamble: body.trim(), rest: '' };
  }
  const preamble = raw.slice(start, i).join('\n').trimEnd();
  const rest = raw.slice(i).join('\n').trim();
  return { preamble, rest };
}

function scorePatientDemographicBlock(block: string): number {
  let hits = 0;
  for (const line of block.split('\n')) {
    const l = line.trim().toLowerCase();
    if (!l) continue;
    if (/^(patient|patient name)\b/.test(l)) hits += 2;
    if (/\bdob\b|^date of birth/.test(l)) hits += 2;
    if (/\bage\b/.test(l)) hits++;
    if (/\bsex\b/.test(l)) hits++;
    if (/visit (type|date)/.test(l)) hits++;
    if (/contact|cellphone|cell phone|phone number/.test(l)) hits++;
    if (/folder|file number/.test(l)) hits += 2;
    if (/referring doctor/.test(l)) hits++;
  }
  return hits + block.length * 0.0001;
}

/** Paragraphs that may each be a patient header (split on blank lines and on "Patient Name:" starts). */
function preambleToCandidatePatientBlocks(preamble: string): string[] {
  const parts = preamble.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const expanded: string[] = [];
  for (const p of parts) {
    const pieces = p
      .split(/\n(?=\s*(?:\*\*)?Patient\s+Name\s*:)/i)
      .map((x) => x.trim())
      .filter(Boolean);
    expanded.push(...pieces);
  }
  return expanded;
}

function pickBestPatientDemographicFromPreamble(preamble: string): string {
  const candidates = preambleToCandidatePatientBlocks(preamble).filter((c) => scorePatientDemographicBlock(c) >= 4);
  if (candidates.length === 0) return '';
  return candidates.reduce((a, b) => (scorePatientDemographicBlock(a) >= scorePatientDemographicBlock(b) ? a : b));
}

/**
 * Text sent to /note-preview-pdf only: title + chart header + cleaned note body.
 * Excludes buildNoteTextWithPatientChart instructional blocks used for Halo/DOCX generation.
 *
 * Patient demographics appear once: we either reuse the chart-built header or the richest
 * leading block from the note body (e.g. includes Folder/File when chart omits empty folder),
 * never both — the PDF preview used to prepend the chart block and leave the model block in the body.
 */
export function buildNotePreviewPdfText(
  patient: PatientForDocuments,
  note: Pick<HaloNote, 'title' | 'content' | 'fields'>
): string {
  const plain = buildNotePlainText(note);
  const body = stripClinicalMarkdownForPdf(plain);
  const title = (note.title ?? '').trim();
  const chartHeader = buildPatientHeaderForPreview(patient);

  const { preamble, rest } = splitPreambleAndRestAfterClinicalStart(body);
  const bestBodyDemog = pickBestPatientDemographicFromPreamble(preamble);

  let patientBlock: string;
  let bodyRest: string;

  if (rest.trim()) {
    const useBody = scorePatientDemographicBlock(bestBodyDemog) > scorePatientDemographicBlock(chartHeader);
    patientBlock = useBody ? bestBodyDemog : chartHeader;
    bodyRest = rest;
  } else {
    const useBody = scorePatientDemographicBlock(bestBodyDemog) > scorePatientDemographicBlock(chartHeader);
    patientBlock = useBody ? bestBodyDemog : chartHeader;
    const toRemove = preambleToCandidatePatientBlocks(preamble)
      .filter((c) => scorePatientDemographicBlock(c) >= 4)
      .sort((a, b) => b.length - a.length);
    let remainder = body;
    for (const c of toRemove) {
      const idx = remainder.indexOf(c);
      if (idx !== -1) {
        remainder = (remainder.slice(0, idx) + remainder.slice(idx + c.length)).trim();
      }
    }
    remainder = remainder.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trim();
    bodyRest = remainder;
  }

  const parts: string[] = [];
  if (title) parts.push(title);
  if (patientBlock.trim()) parts.push(patientBlock.trim());
  if (bodyRest.trim()) parts.push(bodyRest.trim());
  return parts.filter(Boolean).join('\n\n');
}
