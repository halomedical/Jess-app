import {
  parseFieldBlocks,
  parseMarkdownLabelFields,
  mergeFieldMaps,
  sanitizeTemplateFieldValue,
} from './clinicalNoteFieldParse';
import type { PatientForDocuments } from './patientDemographics';
import { stripPracticeLetterheadFromNote } from './stripPracticeLetterhead';

export const ROOMS_CHART_FIELD_KEYS = [
  'patient_name',
  'folder_no',
  'age',
  'contact',
  'referring_doctor',
  'referring_doctor_contact',
] as const;

export const ROOMS_CONSULT_FIELD_KEYS = [
  ...ROOMS_CHART_FIELD_KEYS,
  'new_or_follow_up',
  'date',
  'clinical_background',
  'hypertension',
  'family_hx',
  'dyslipidaemia',
  'smoker',
  'etoh',
  'diabetes',
  'known_cad',
  'presenting_complaints',
  'angina',
  'dyspnoea',
  'pnd',
  'orthopnoea',
  'oedema_symptom',
  'palpitations',
  'syncope',
  'claudication',
  'allergies',
  'occupation',
  'bleeding_history',
  'surgical_history',
  'medication',
  'medication_changes',
  'bp_sitting',
  'pulse_rate',
  'pulse_character',
  'spo2',
  'bp_standing',
  'oedema_exam',
  'pale',
  'cyanosis',
  'carotid',
  'clubbing',
  'lad',
  'jaundice',
  'clinical_dyslipidaemia',
  'jvp',
  'psh',
  'apex',
  's1s2',
  'heart_sounds',
  'other_systems',
  'resting_ecg',
  'echo',
  'exercise_stress',
  'holter',
  'angiogram',
  'bloods',
  'ldl',
  'hb',
  'hba1c',
  'creat',
  'imaging',
  'assessment',
  'plan',
] as const;

export type RoomsConsultFieldKey = (typeof ROOMS_CONSULT_FIELD_KEYS)[number];
export type RoomsConsultNoteFields = Record<RoomsConsultFieldKey, string>;

function emptyRoomsFields(): RoomsConsultNoteFields {
  return Object.fromEntries(ROOMS_CONSULT_FIELD_KEYS.map((k) => [k, ''])) as RoomsConsultNoteFields;
}

/** Keys the model should fill via ---FIELD blocks (chart supplies demographics table). */
export const ROOMS_MODEL_OUTPUT_FIELD_KEYS = ROOMS_CONSULT_FIELD_KEYS.filter(
  (k) => !(ROOMS_CHART_FIELD_KEYS as readonly string[]).includes(k)
);

export function parseRoomsConsultNoteFields(
  noteText: string,
  _patient?: PatientForDocuments | null
): RoomsConsultNoteFields {
  const cleaned = stripPracticeLetterheadFromNote(noteText)
    .replace(/^#{1,6}\s*Patient Demographics[\s\S]*?(?=^#{1,6}\s|\nCLINICAL BACKGROUND|\nPRESENTING)/im, '')
    .trim();

  const fromBlocks = parseFieldBlocks(cleaned, ROOMS_CONSULT_FIELD_KEYS);
  const fromLabels = parseMarkdownLabelFields(cleaned, ROOMS_CONSULT_FIELD_KEYS);
  const merged = mergeFieldMaps(fromBlocks, fromLabels);

  const fields = emptyRoomsFields();
  for (const key of ROOMS_CONSULT_FIELD_KEYS) {
    fields[key] = sanitizeTemplateFieldValue(merged[key] ?? '');
  }
  return fields;
}
