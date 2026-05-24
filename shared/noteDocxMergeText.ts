import { fieldKeysForTemplate, parsePopulatedEditorToFieldMap } from './parsePopulatedEditorToFieldMap';
import type { PatientForDocuments } from './patientDemographics';
import { stripPracticeLetterheadFromNote } from './stripPracticeLetterhead';
import { parseReportNoteFields } from './parseReportNoteContent';
import { parseRoomsConsultNoteFields } from './parseRoomsConsultNoteContent';
import { REPORT_TEMPLATE_ID, ROOMS_CONSULT_TEMPLATE_ID } from './haloTemplates';
import { sanitizeReportDocxFields } from './sanitizeReportDocxFields';
import { emptyReportFields, type ReportNoteFields } from './parseReportNoteContent';

function fixReportPlainTextLayout(plain: string): string {
  return plain.replace(
    /^(File no\.)\s+(?=[A-Z][a-z].*\b(?:year[- ]?old|y\.?o\.?|male|female|is a|was|presenting)\b)/im,
    '$1\n'
  );
}

function fieldsToBlockText(keys: readonly string[], values: Record<string, string>): string {
  return keys.map((k) => `---FIELD:${k}---\n${(values[k] ?? '').trim()}`).join('\n\n');
}

/**
 * Plain text for Word template merge (docxtemplater).
 * Reconstructs ---FIELD:key--- blocks from editor content so Templates/*.docx fill correctly.
 */
export function buildNoteTextForDocxMerge(
  templateId: string,
  notePlainText: string,
  patient?: PatientForDocuments | null,
  /** When set (from Gemini at generation), used directly — most reliable for DOCX fill. */
  mergeFields?: Record<string, string> | null
): string {
  let plain = stripPracticeLetterheadFromNote((notePlainText ?? '').trim());
  const id = (templateId ?? '').trim().toLowerCase();
  if (id === REPORT_TEMPLATE_ID) plain = fixReportPlainTextLayout(plain);
  const keys = fieldKeysForTemplate(templateId);

  const fromEditor = parsePopulatedEditorToFieldMap(templateId, plain, keys);
  let fields: Record<string, string> =
    mergeFields && Object.keys(mergeFields).length > 0 ? { ...mergeFields } : { ...fromEditor };
  for (const k of keys) {
    if (fromEditor[k]?.trim()) fields[k] = fromEditor[k];
  }

  if (id === ROOMS_CONSULT_TEMPLATE_ID) {
    const fromParser = parseRoomsConsultNoteFields(plain, patient);
    for (const k of keys) {
      if (!fields[k]?.trim() && fromParser[k as keyof typeof fromParser]?.trim()) {
        fields[k] = fromParser[k as keyof typeof fromParser];
      }
    }
  } else if (id === REPORT_TEMPLATE_ID) {
    const fromParser = parseReportNoteFields(plain, patient);
    for (const k of keys) {
      if (!fields[k]?.trim() && fromParser[k as keyof typeof fromParser]?.trim()) {
        fields[k] = fromParser[k as keyof typeof fromParser];
      }
    }
    const reportFields = emptyReportFields();
    for (const k of keys) {
      if (fields[k]?.trim()) reportFields[k as keyof ReportNoteFields] = fields[k];
    }
    fields = { ...sanitizeReportDocxFields(reportFields) };
  }

  if (keys.length > 0) {
    return fieldsToBlockText(keys, fields);
  }
  return plain;
}
