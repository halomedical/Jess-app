import {
  parseFieldBlocks,
  parseMarkdownLabelFields,
  mergeFieldMaps,
  sanitizeTemplateFieldValue,
} from './clinicalNoteFieldParse';
import type { PatientForDocuments } from './patientDemographics';
import { formatAgeFromIsoDob } from './patientDemographics';
import { stripPracticeLetterheadFromNote } from './stripPracticeLetterhead';
import {
  isClinicalProseNotChartId,
  isLikelyFileNumber,
  sanitizeReportDocxFields,
} from './sanitizeReportDocxFields';

export interface ReportNoteFields {
  date: string;
  addressee: string;
  addressee_location: string;
  addressee_email: string;
  patient_name: string;
  id_no: string;
  file_no: string;
  background: string;
  clinical_examination: string;
  special_investigations: string;
  assessment_plan: string;
}

const REPORT_FIELD_KEYS = [
  'date',
  'addressee',
  'addressee_location',
  'addressee_email',
  'patient_name',
  'id_no',
  'file_no',
  'background',
  'clinical_examination',
  'special_investigations',
  'assessment_plan',
] as const;

type ReportFieldKey = (typeof REPORT_FIELD_KEYS)[number];

export function emptyReportFields(): ReportNoteFields {
  return {
    date: '',
    addressee: '',
    addressee_location: '',
    addressee_email: '',
    patient_name: '',
    id_no: '',
    file_no: '',
    background: '',
    clinical_examination: '',
    special_investigations: '',
    assessment_plan: '',
  };
}


const SECTION_ALIASES: Record<string, ReportFieldKey> = {
  background: 'background',
  'clinical examination': 'clinical_examination',
  'special investigations': 'special_investigations',
  'assessment and plan': 'assessment_plan',
  'assessment & plan': 'assessment_plan',
};

/** Parse editor / plain Report layout (date, addressee block, RE/ID/File, body). */
function parseEditorLayout(text: string): Partial<ReportNoteFields> {
  const out: Partial<ReportNoteFields> = {};
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;

  const first = (lines[i] ?? '').trim();
  if (first && /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(first)) {
    out.date = first;
    i++;
    while (i < lines.length && !lines[i].trim()) i++;
  }

  const addr: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      if (addr.length) break;
      continue;
    }
    if (/^RE:/i.test(line.trim())) break;
    addr.push(line.trim());
    i++;
  }
  if (addr[0]) out.addressee = addr[0];
  if (addr[1]) out.addressee_location = addr[1];
  if (addr[2]) out.addressee_email = addr[2];

  const sectionBodies: Partial<Record<ReportFieldKey, string[]>> = {};
  let current: ReportFieldKey = 'background';
  sectionBodies.background = [];

  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^RE:/i.test(lines[i].trim())) {
    out.patient_name = lines[i].replace(/^RE:\s*/i, '').trim();
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^ID\s*no\.?/i.test(lines[i].trim())) {
    const idRest = lines[i].replace(/^ID\s*no\.?\s*:?\s*/i, '').trim();
    if (idRest && !isClinicalProseNotChartId(idRest)) {
      out.id_no = idRest;
    } else if (idRest) {
      if (!sectionBodies.background) sectionBodies.background = [];
      sectionBodies.background.push(idRest);
    }
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^File\s*no\.?/i.test(lines[i].trim())) {
    const fileRest = lines[i].replace(/^File\s*no\.?\s*:?\s*/i, '').trim();
    if (fileRest && isLikelyFileNumber(fileRest)) {
      out.file_no = fileRest;
    } else if (fileRest) {
      if (!sectionBodies.background) sectionBodies.background = [];
      sectionBodies.background.push(fileRest);
    }
    i++;
  }

  while (i < lines.length && !lines[i].trim()) i++;

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const heading = SECTION_ALIASES[t.replace(/:$/, '').toLowerCase()];
    if (heading) {
      current = heading;
      if (!sectionBodies[current]) sectionBodies[current] = [];
      continue;
    }
    if (!sectionBodies[current]) sectionBodies[current] = [];
    sectionBodies[current]!.push(raw);
  }

  for (const key of ['background', 'clinical_examination', 'special_investigations', 'assessment_plan'] as const) {
    const joined = (sectionBodies[key] ?? []).join('\n').trim();
    if (joined) out[key] = joined;
  }

  return out;
}

/** Fallback: split prose by known section headings. */
function parseSectionHeadings(text: string): Partial<ReportNoteFields> {
  const out: Partial<ReportNoteFields> = {};
  const normalized = text.replace(/\r\n/g, '\n');
  const headerRe =
    /^(BACKGROUND|CLINICAL EXAMINATION|SPECIAL INVESTIGATIONS|ASSESSMENT AND PLAN)\s*:?\s*$/gim;
  const parts = normalized.split(headerRe);
  if (parts.length < 2) return out;

  let preamble = parts[0].trim();
  for (let i = 1; i < parts.length; i += 2) {
    const heading = (parts[i] ?? '').trim().toLowerCase();
    const body = (parts[i + 1] ?? '').trim();
    const key = SECTION_ALIASES[heading];
    if (key) out[key] = body;
  }

  const reMatch = preamble.match(/^RE:\s*(.+?)(?:\n|$)/im);
  if (reMatch) out.patient_name = reMatch[1].trim();
  const idMatch = preamble.match(/^ID\s*no\.?\s*:?\s*(.+?)(?:\n|$)/im);
  if (idMatch) out.id_no = idMatch[1].trim();
  const fileMatch = preamble.match(/^File\s*no\.?\s*:?\s*(.+?)(?:\n|$)/im);
  if (fileMatch) out.file_no = fileMatch[1].trim();

  const preLines = preamble.split('\n').map((l) => l.trim()).filter(Boolean);
  const reIdx = preLines.findIndex((l) => /^RE:/i.test(l));
  if (reIdx > 0) {
    const addrLines = preLines.slice(0, reIdx);
    if (addrLines[0] && !out.date) {
      if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(addrLines[0])) out.date = addrLines[0];
      else if (addrLines.length >= 1) out.addressee = addrLines[0];
    }
    if (addrLines.length >= 2 && !out.addressee_location) out.addressee_location = addrLines[1];
    if (addrLines.length >= 3 && !out.addressee_email) out.addressee_email = addrLines[2];
  }

  if (!out.background && preamble && !reMatch) {
    const cut = preamble.search(/CLINICAL EXAMINATION/i);
    if (cut === -1) out.background = preamble;
  }

  return out;
}

function stripLetterheadAndChartBlocks(text: string): string {
  return stripPracticeLetterheadFromNote(text);
}

function formatReportDate(d: Date = new Date()): string {
  const d_ = d.getDate().toString().padStart(2, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const y = d.getFullYear();
  return `${d_}-${m}-${y}`;
}

/** Merge parsed note text with patient chart defaults for Report DOCX. */
export function parseReportNoteFields(
  noteText: string,
  patient?: PatientForDocuments | null
): ReportNoteFields {
  const cleaned = stripLetterheadAndChartBlocks(noteText);
  const fromBlocks = parseFieldBlocks(cleaned, REPORT_FIELD_KEYS);
  const fromLabels = parseMarkdownLabelFields(cleaned, REPORT_FIELD_KEYS);
  const fromEditor = parseEditorLayout(cleaned);
  const fromSections = parseSectionHeadings(cleaned);
  const merged = mergeFieldMaps(fromBlocks, fromLabels, fromEditor, fromSections);
  const fields = emptyReportFields();

  for (const key of REPORT_FIELD_KEYS) {
    fields[key] = sanitizeTemplateFieldValue(merged[key] || '');
  }

  if (patient) {
    const name = (patient.name ?? '').trim();
    if (!fields.patient_name && name) fields.patient_name = name;
    if (!fields.file_no && patient.folderNumber?.trim()) fields.file_no = patient.folderNumber.trim();
    if (!fields.id_no && (patient as { idNumber?: string }).idNumber?.trim()) {
      fields.id_no = (patient as { idNumber?: string }).idNumber!.trim();
    }
    if (!fields.date && patient.visitDate?.trim()) {
      const vd = patient.visitDate.trim();
      const iso = vd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      fields.date = iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : vd;
    }
    if (!fields.addressee && patient.referringDoctor?.trim()) {
      fields.addressee = patient.referringDoctor.trim();
    }
    if (!fields.background && name) {
      const age = formatAgeFromIsoDob(patient.dob || '');
      const sex = patient.sex === 'F' ? 'female' : patient.sex === 'M' ? 'male' : '';
      if (age || sex) {
        /* only prefill background intro if background empty — leave to model */
      }
    }
  }

  if (!fields.date) fields.date = formatReportDate();

  return sanitizeReportDocxFields(fields);
}
