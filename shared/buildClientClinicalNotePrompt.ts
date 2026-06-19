import type { ClinicalNoteTemplateDefinition } from './clinicalNoteTemplateTypes';
import { getLocalClinicalNoteTemplate } from './clinicalNoteTemplates';
import { humanizeFieldKey } from './clinicalNoteFieldParse';
import { getGeminiGuideForTemplate, REPORT_TEMPLATE_ID, ROOMS_CONSULT_TEMPLATE_ID } from './haloTemplates';
import { ROOMS_MODEL_OUTPUT_FIELD_KEYS } from './parseRoomsConsultNoteContent';
import { buildMedicationGlossaryPromptBlock } from './cardiologyMedicationGlossary';

function buildTemplateRulesJson(template: ClinicalNoteTemplateDefinition): string {
  return JSON.stringify(
    template.fields.map((f) => ({
      key: f.key,
      description: (f.description ?? '').trim(),
    })),
    null,
    2
  );
}

const BLANK_WHEN_UNMENTIONED_RULE =
  'If the transcription does not mention a field, omit that key from the JSON object or use an empty string. Never write "Not discussed", "N/A", "Nil", "None", "Pending", or similar placeholders unless the doctor explicitly said those words.';

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

function buildJsonOutputFormat(keys: readonly string[]): string {
  const keyList = keys.map((k) => `"${k}"`).join(', ');
  return `
OUTPUT FORMAT (mandatory):
You must respond ONLY with a valid JSON object. Do not use any custom tags like ---FIELD---. Do not include markdown code fences or narrative outside the JSON.
JSON keys must exactly match these template variables: ${keyList}
Use string values only. ${BLANK_WHEN_UNMENTIONED_RULE}
Do not output practice letterhead or patient demographic tables.
`.trim();
}

function getOutputFieldKeys(template: ClinicalNoteTemplateDefinition): readonly string[] {
  if (template.template_id === REPORT_TEMPLATE_ID) return REPORT_FIELD_KEYS;
  if (template.template_id === ROOMS_CONSULT_TEMPLATE_ID) return ROOMS_MODEL_OUTPUT_FIELD_KEYS;
  return template.fields.map((f) => f.key);
}

function buildFieldBasedPrompt(
  template: ClinicalNoteTemplateDefinition,
  transcriptionText: string,
  chartReference?: string
): string {
  const dictation = (transcriptionText ?? '').trim();
  const templateRules = buildTemplateRulesJson(template);
  const chart = (chartReference ?? '').trim();
  const keys = getOutputFieldKeys(template);
  const outputFormat = buildJsonOutputFormat(keys);
  const medicationGlossary = buildMedicationGlossaryPromptBlock();

  let templateNotes = '';
  if (template.template_id === REPORT_TEMPLATE_ID) {
    templateNotes =
      'This is a formal REPORT letter (addressee, RE/ID/File, Background, Clinical Examination, Special Investigations, Assessment and Plan). Do not use Rooms Consult sections or consult field names.';
  } else if (template.template_id === ROOMS_CONSULT_TEMPLATE_ID) {
    templateNotes =
      'This is a Rooms Consult note. Do not use Report letter fields (addressee, RE line, etc.). Patient chart demographics (name, folder, age, contact, referring doctor) are added by the app — do not include those keys in your JSON.';
  }

  if (!dictation) {
    return `
You are a professional medical typist for Dr John's cardiology practice.

TEMPLATE: ${template.name} (id: ${template.template_id})

ERROR: No dictation was provided. Return a JSON object with empty string values for every required key listed in OUTPUT FORMAT.

TEMPLATE FIELD RULES (JSON structure):
${templateRules}

${chart ? `CHART REFERENCE:\n${chart}\n` : ''}

${outputFormat}
`.trim();
  }

  return `
You are a professional medical typist for Dr John's cardiology practice.

TEMPLATE: ${template.name} (id: ${template.template_id})

TASK: Extract information from the dictation below and return a JSON object strictly according to the template field rules and OUTPUT FORMAT. Every clinical fact in your output must be supported by the dictation. Use the chart reference only for identifier fields when the dictation does not state them.

${templateNotes ? `Template notes: ${templateNotes}\n` : ''}
RULES:
- Populate each JSON key with dictated content when present in the transcript; omit or use "" if not mentioned.
- Use the medication glossary to correct obvious medication spelling/transcription errors, but do not invent diagnoses, measurements, medications, or dates.
- Never output Markdown headings, bold field labels, practice letterhead, patient demographic tables, ---FIELD--- tags, or text outside the JSON object.
- ${BLANK_WHEN_UNMENTIONED_RULE}

${medicationGlossary}

TEMPLATE FIELD RULES (JSON structure — follow each key's description):
${templateRules}

${chart ? `CHART REFERENCE (identifiers only — not a substitute for dictation):\n${chart}\n` : ''}

---

DICTATION (primary source — extract all clinical content from this transcript):

${dictation}

---

${outputFormat}
`.trim();
}

/** Build the full Gemini user prompt for client-side note generation. */
export function buildClientClinicalNotePrompt(
  transcriptionText: string,
  templateId: string,
  chartReference?: string
): string {
  const local = getLocalClinicalNoteTemplate(templateId);
  if (local) return buildFieldBasedPrompt(local, transcriptionText, chartReference);

  const guide = getGeminiGuideForTemplate(templateId);
  const dictation = (transcriptionText ?? '').trim();
  const chart = (chartReference ?? '').trim();
  const medicationGlossary = buildMedicationGlossaryPromptBlock();
  return `
You are a medical scribe.

TASK: Extract information from the following dictation and return ONLY a valid JSON object with a single key "body" containing the formatted clinical note text.

RULES:
- Only include content supported by the dictation. Omit sections not mentioned.
- Do not write "Not discussed" or "N/A".
- Use the medication glossary to correct obvious medication spelling/transcription errors.
- Do not invent clinical facts or medications.
- Do not output practice letterhead or duplicate patient demographic tables.
- Do not use ---FIELD--- tags or markdown code fences.

${medicationGlossary}

Template key: ${templateId}

${guide}

${chart ? `CHART REFERENCE:\n${chart}\n` : ''}

OUTPUT FORMAT (mandatory):
Respond ONLY with: {"body": "..."}
${BLANK_WHEN_UNMENTIONED_RULE}

DICTATION:

${dictation || '(empty — return {"body": ""})'}
`.trim();
}

// Re-export for any legacy imports
export { humanizeFieldKey };
