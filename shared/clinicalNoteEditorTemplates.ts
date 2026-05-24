import type { ClinicalNoteTemplateDefinition } from './clinicalNoteTemplateTypes';
import { getLocalClinicalNoteTemplate } from './clinicalNoteTemplates';
import { humanizeFieldKey } from './clinicalNoteFieldParse';
import {
  ECHO_TEMPLATE_ID,
  REPORT_TEMPLATE_ID,
  ROOMS_CONSULT_TEMPLATE_ID,
} from './haloTemplates';

const REPORT_EDITOR_TEMPLATE = `
{{ date }}

{{ addressee }}
{{ addressee_location }}
{{ addressee_email }}

RE:  {{ patient_name }}
ID no. {{ id_no }}
File no. {{ file_no }}

{{ background }}

CLINICAL EXAMINATION:

{{ clinical_examination }}

SPECIAL INVESTIGATIONS:

{{ special_investigations }}

ASSESSMENT AND PLAN:

{{ assessment_plan }}
`.trim();

const ROOMS_CONSULT_EDITOR_TEMPLATE = `
Visit: {{ new_or_follow_up }}    Date: {{ date }}

CLINICAL BACKGROUND

{{ clinical_background }}

Hypertension: {{ hypertension }}
Family Hx: {{ family_hx }}
Dyslipidaemia: {{ dyslipidaemia }}
Smoker: {{ smoker }}
Etoh: {{ etoh }}
Diabetes: {{ diabetes }}
Known Cad: {{ known_cad }}

PRESENTING COMPLAINTS

{{ presenting_complaints }}

SYMPTOMS

Angina: {{ angina }}
Dyspnoea: {{ dyspnoea }}
Pnd: {{ pnd }}
Orthopnoea: {{ orthopnoea }}
Oedema Symptom: {{ oedema_symptom }}
Palpitations: {{ palpitations }}
Syncope: {{ syncope }}
Claudication: {{ claudication }}

GENERAL & SURGICAL HISTORY

Allergies: {{ allergies }}
Occupation: {{ occupation }}
Bleeding history: {{ bleeding_history }}
Surgical history: {{ surgical_history }}

MEDICATION

{{ medication }}
{{ medication_changes }}

PHYSICAL EXAMINATION

Bp Sitting: {{ bp_sitting }}
Pulse Rate: {{ pulse_rate }}
Pulse Character: {{ pulse_character }}
Spo2: {{ spo2 }}
Bp Standing: {{ bp_standing }}
Oedema Exam: {{ oedema_exam }}
Pale: {{ pale }}
Cyanosis: {{ cyanosis }}
Carotid: {{ carotid }}
Clubbing: {{ clubbing }}
Lad: {{ lad }}
Jaundice: {{ jaundice }}
Clinical Dyslipidaemia: {{ clinical_dyslipidaemia }}
Jvp: {{ jvp }}
Psh: {{ psh }}
Apex: {{ apex }}
S1S2: {{ s1s2 }}
Heart Sounds: {{ heart_sounds }}
Other Systems: {{ other_systems }}

INVESTIGATIONS

Resting Ecg: {{ resting_ecg }}
Echo: {{ echo }}
Exercise Stress: {{ exercise_stress }}
Holter: {{ holter }}
Angiogram: {{ angiogram }}
Bloods: {{ bloods }}
Ldl: {{ ldl }}
Hb: {{ hb }}
Hba1C: {{ hba1c }}
Creat: {{ creat }}
Imaging: {{ imaging }}

ASSESSMENT

{{ assessment }}

PLAN

{{ plan }}
`.trim();

function buildFieldOrderedTemplate(template: ClinicalNoteTemplateDefinition): string {
  return template.fields
    .map((f) => `${humanizeFieldKey(f.key)}: {{ ${f.key} }}`)
    .join('\n');
}

/** Raw editor body with {{ key }} placeholders for client-side interpolation. */
export function getEditorTemplateString(templateId: string): string {
  const id = (templateId ?? '').trim().toLowerCase();
  if (id === REPORT_TEMPLATE_ID) return REPORT_EDITOR_TEMPLATE;
  if (id === ROOMS_CONSULT_TEMPLATE_ID) return ROOMS_CONSULT_EDITOR_TEMPLATE;

  const local = getLocalClinicalNoteTemplate(templateId);
  if (local) {
    if (local.template_id === ECHO_TEMPLATE_ID) return buildFieldOrderedTemplate(local);
    return buildFieldOrderedTemplate(local);
  }

  return '{{ body }}';
}
