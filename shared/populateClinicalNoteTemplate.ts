import { sanitizeTemplateFieldValue } from './clinicalNoteFieldParse';
import { formatAgeFromIsoDob, type PatientForDocuments } from './patientDemographics';
import { REPORT_TEMPLATE_ID, ROOMS_CONSULT_TEMPLATE_ID } from './haloTemplates';
import { ROOMS_MODEL_OUTPUT_FIELD_KEYS } from './parseRoomsConsultNoteContent';

function formatReportDate(d: Date = new Date()): string {
  const d_ = d.getDate().toString().padStart(2, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const y = d.getFullYear();
  return `${d_}-${m}-${y}`;
}

/** Parse Gemini JSON response; strips markdown fences if present. */
export function parseGeminiJsonResponse(geminiResponseText: string): Record<string, string> {
  const stripped = (geminiResponseText ?? '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  if (!stripped) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error('Gemini response was not valid JSON. Try generating the note again.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini JSON must be an object with template field keys.');
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value == null) {
      out[key] = '';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = sanitizeTemplateFieldValue(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = sanitizeTemplateFieldValue(String(value));
    }
  }
  return out;
}

/** Inject JSON field values into {{ key }} placeholders. */
export function populateEditorTemplate(
  rawTemplateString: string,
  parsedData: Record<string, string>
): string {
  return rawTemplateString.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => parsedData[key] ?? '');
}

/** Merge chart defaults into parsed JSON before template interpolation. */
export function enrichParsedDataWithChart(
  templateId: string,
  parsedData: Record<string, string>,
  patient?: PatientForDocuments | null
): Record<string, string> {
  const data = { ...parsedData };
  if (!patient) return data;

  const id = (templateId ?? '').trim().toLowerCase();

  if (id === REPORT_TEMPLATE_ID) {
    const name = (patient.name ?? '').trim();
    if (!data.patient_name && name) data.patient_name = name;
    if (!data.file_no && patient.folderNumber?.trim()) data.file_no = patient.folderNumber.trim();
    if (!data.id_no && (patient as { idNumber?: string }).idNumber?.trim()) {
      data.id_no = (patient as { idNumber?: string }).idNumber!.trim();
    }
    if (!data.date && patient.visitDate?.trim()) {
      const vd = patient.visitDate.trim();
      const iso = vd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      data.date = iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : vd;
    }
    if (!data.addressee && patient.referringDoctor?.trim()) {
      data.addressee = patient.referringDoctor.trim();
    }
    if (!data.date) data.date = formatReportDate();
  }

  if (id === ROOMS_CONSULT_TEMPLATE_ID) {
    if (!data.date && patient.visitDate?.trim()) data.date = patient.visitDate.trim();
    if (!data.new_or_follow_up) {
      if (patient.visitType === 'new') data.new_or_follow_up = 'New';
      if (patient.visitType === 'follow_up') data.new_or_follow_up = 'Follow-up';
    }
    for (const key of ROOMS_MODEL_OUTPUT_FIELD_KEYS) {
      if (data[key] === undefined) data[key] = '';
    }
  }

  if (!data.patient_name && patient.name?.trim()) data.patient_name = patient.name.trim();
  if (!data.folder_no && patient.folderNumber?.trim()) data.folder_no = patient.folderNumber.trim();

  return data;
}
