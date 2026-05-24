import fs from 'fs';
import path from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  ECHO_TEMPLATE_ID,
  REPORT_TEMPLATE_ID,
  ROOMS_CONSULT_TEMPLATE_ID,
} from '../../shared/haloTemplates';
import { parseReportNoteFields } from '../../shared/parseReportNoteContent';
import {
  parseRoomsConsultNoteFields,
  type RoomsConsultNoteFields,
} from '../../shared/parseRoomsConsultNoteContent';
import { getLocalClinicalNoteTemplate } from '../../shared/clinicalNoteTemplates';
import { parseFieldBlocks, parseMarkdownLabelFields, sanitizeTemplateFieldValue } from '../../shared/clinicalNoteFieldParse';
import type { PatientForDocuments } from '../../shared/patientDemographics';
import { formatAgeFromIsoDob } from '../../shared/patientDemographics';
import { buildPracticeDocxTemplatePath } from './practiceDocxTemplates';
import { formatDocxtemplaterError, logDocxtemplaterError } from '../../shared/docxTemplaterErrors';
import { listDocxPlaceholderKeys, repairSplitDocxPlaceholders } from '../../shared/docxRepairPlaceholders';
import {
  fieldKeysForTemplate,
  parsePopulatedEditorToFieldMap,
} from '../../shared/parsePopulatedEditorToFieldMap';
import { sanitizeReportDocxFields } from '../../shared/sanitizeReportDocxFields';
import { emptyReportFields, type ReportNoteFields } from '../../shared/parseReportNoteContent';

/** Strip HTML from editor note text before inserting into Word (avoids corrupting document.xml). */
function stripHtmlForDocxValue(value: string): string {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeMergeData(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = stripHtmlForDocxValue(v).replace(/\r\n/g, '\n');
  }
  return out;
}

/** If HTML/plain collapsed "File no." onto the history line, restore a line break. */
function fixReportPlainTextLayout(plain: string): string {
  return plain.replace(
    /^(File no\.)\s+(?=[A-Z][a-z].*\b(?:year[- ]?old|y\.?o\.?|male|female|is a|was|presenting)\b)/im,
    '$1\n'
  );
}

function buildEchoTemplateData(text: string, patient?: PatientForDocuments | null): Record<string, string> {
  const template = getLocalClinicalNoteTemplate(ECHO_TEMPLATE_ID);
  const keys = template?.fields.map((f) => f.key) ?? [];
  const fromBlocks = parseFieldBlocks(text, keys as readonly string[]);
  const fromLabels = parseMarkdownLabelFields(text, keys as readonly string[]);
  const data: Record<string, string> = {};
  for (const key of keys) {
    data[key] = sanitizeTemplateFieldValue(fromBlocks[key] ?? fromLabels[key] ?? '');
  }
  if (patient) {
    if (!data.patient_name && patient.name?.trim()) data.patient_name = patient.name.trim();
    if (!data.folder_no && patient.folderNumber?.trim()) data.folder_no = patient.folderNumber.trim();
    if (!data.date && patient.visitDate?.trim()) data.date = patient.visitDate.trim();
  }
  return data;
}

function mergeRoomsChartIntoFields(
  fields: RoomsConsultNoteFields,
  patient?: PatientForDocuments | null
): Record<string, string> {
  const data: Record<string, string> = { ...fields };
  if (!patient) return data;

  if (!data.patient_name?.trim() && patient.name?.trim()) data.patient_name = patient.name.trim();
  if (!data.folder_no?.trim() && patient.folderNumber?.trim()) {
    data.folder_no = patient.folderNumber.trim();
  }
  if (!data.age?.trim() && patient.dob) {
    const age = formatAgeFromIsoDob(patient.dob);
    if (age !== '—') data.age = age;
  }
  if (!data.contact?.trim() && patient.contactNumber?.trim()) {
    data.contact = patient.contactNumber.trim();
  }
  if (!data.referring_doctor?.trim() && patient.referringDoctor?.trim()) {
    data.referring_doctor = patient.referringDoctor.trim();
  }
  if (!data.date?.trim() && patient.visitDate?.trim()) data.date = patient.visitDate.trim();
  if (!data.new_or_follow_up?.trim()) {
    if (patient.visitType === 'new') data.new_or_follow_up = 'New';
    if (patient.visitType === 'follow_up') data.new_or_follow_up = 'Follow-up';
  }

  return data;
}

function pickNonEmpty(...values: (string | undefined)[]): string {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
}

function buildTemplateMergeData(
  templateId: string,
  noteText: string,
  patient?: PatientForDocuments | null,
  mergeFieldsOverride?: Record<string, string> | null
): Record<string, string> {
  const id = (templateId ?? '').trim().toLowerCase();
  const keys = fieldKeysForTemplate(templateId);
  const noteForParse =
    id === REPORT_TEMPLATE_ID ? fixReportPlainTextLayout(noteText) : noteText;
  const fromEditor = parsePopulatedEditorToFieldMap(templateId, noteForParse, keys);
  const override = mergeFieldsOverride ?? {};

  let fromParser: Record<string, string> = {};
  if (id === REPORT_TEMPLATE_ID) {
    fromParser = { ...parseReportNoteFields(noteForParse, patient) };
  } else if (id === ROOMS_CONSULT_TEMPLATE_ID) {
    fromParser = parseRoomsConsultNoteFields(noteText, patient);
  } else if (id === ECHO_TEMPLATE_ID) {
    fromParser = buildEchoTemplateData(noteText, patient);
  } else {
    const template = getLocalClinicalNoteTemplate(templateId);
    if (template) {
      const k = template.fields.map((f) => f.key);
      const fromBlocks = parseFieldBlocks(noteText, k);
      const fromLabels = parseMarkdownLabelFields(noteText, k);
      for (const key of k) {
        fromParser[key] = sanitizeTemplateFieldValue(fromBlocks[key] ?? fromLabels[key] ?? '');
      }
    }
  }

  const merged: Record<string, string> = {};
  for (const key of keys) {
    merged[key] = pickNonEmpty(override[key], fromEditor[key], fromParser[key]);
  }

  if (id === ROOMS_CONSULT_TEMPLATE_ID) {
    return sanitizeMergeData(
      mergeRoomsChartIntoFields(merged as RoomsConsultNoteFields, patient)
    );
  }

  if (id === REPORT_TEMPLATE_ID) {
    const chartMerged = { ...merged };
    if (patient) {
      if (!chartMerged.patient_name?.trim() && patient.name?.trim()) {
        chartMerged.patient_name = patient.name.trim();
      }
      if (!chartMerged.file_no?.trim() && patient.folderNumber?.trim()) {
        chartMerged.file_no = patient.folderNumber.trim();
      }
      if (!chartMerged.date?.trim() && patient.visitDate?.trim()) {
        chartMerged.date = patient.visitDate.trim();
      }
      if (!chartMerged.addressee?.trim() && patient.referringDoctor?.trim()) {
        chartMerged.addressee = patient.referringDoctor.trim();
      }
    }
    return sanitizeMergeData({
      ...sanitizeReportDocxFields({ ...emptyReportFields(), ...chartMerged }),
    });
  }

  if (id === ECHO_TEMPLATE_ID) {
    if (patient) {
      if (!merged.patient_name?.trim() && patient.name?.trim()) merged.patient_name = patient.name.trim();
      if (!merged.folder_no?.trim() && patient.folderNumber?.trim()) {
        merged.folder_no = patient.folderNumber.trim();
      }
      if (!merged.date?.trim() && patient.visitDate?.trim()) merged.date = patient.visitDate.trim();
    }
    return sanitizeMergeData(merged);
  }

  return sanitizeMergeData(merged);
}

/** Fill a Templates/*.docx file using {{ field }} placeholders from the JSON templates. */
export async function renderPracticeDocxFromTemplate(
  templateId: string,
  noteText: string,
  patient?: PatientForDocuments | null,
  mergeFieldsOverride?: Record<string, string> | null
): Promise<Buffer | null> {
  const templatePath = buildPracticeDocxTemplatePath(templateId);
  if (!templatePath) return null;

  const content = fs.readFileSync(templatePath);
  const zip = new PizZip(content);
  const templatePlaceholderKeys = new Set<string>();
  for (const filePath of Object.keys(zip.files)) {
    if (/^word\/.*\.xml$/i.test(filePath)) {
      const file = zip.file(filePath);
      if (file) {
        const repaired = repairSplitDocxPlaceholders(file.asText());
        zip.file(filePath, repaired);
        for (const k of listDocxPlaceholderKeys(repaired)) templatePlaceholderKeys.add(k);
      }
    }
  }
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      nullGetter: () => '',
      linebreaks: true,
    });
  } catch (err) {
    logDocxtemplaterError(`compile template ${templatePath}`, err);
    throw new Error(formatDocxtemplaterError(err));
  }

  const data = sanitizeMergeData(
    buildTemplateMergeData(templateId, noteText, patient, mergeFieldsOverride)
  );
  for (const k of templatePlaceholderKeys) {
    if (data[k] === undefined) data[k] = '';
  }
  const nonEmpty = Object.entries(data).filter(([, v]) => (v ?? '').trim().length > 0);
  console.log(
    `[docx-merge] template=${templateId} path=${path.basename(templatePath)} templateTags=${templatePlaceholderKeys.size} nonEmpty=${nonEmpty.length}`,
    JSON.stringify(Object.fromEntries(nonEmpty))
  );
  if (nonEmpty.length === 0) {
    console.warn('[docx-merge] WARNING: all merge values empty — check editor content / docxMerge payload');
  }
  try {
    doc.render(data);
  } catch (err) {
    logDocxtemplaterError(`render template ${templateId}`, err);
    throw new Error(formatDocxtemplaterError(err));
  }

  try {
    return doc.getZip().generate({ type: 'nodebuffer' });
  } catch (err) {
    logDocxtemplaterError(`generate buffer ${templateId}`, err);
    throw new Error(formatDocxtemplaterError(err));
  }
}
