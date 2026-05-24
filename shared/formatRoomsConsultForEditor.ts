import { humanizeFieldKey, sanitizeTemplateFieldValue } from './clinicalNoteFieldParse';
import { formatAgeFromIsoDob, type PatientForDocuments } from './patientDemographics';
import type { RoomsConsultNoteFields } from './parseRoomsConsultNoteContent';

/** HTML patient grid for Rooms Consult (below rich letterhead in the editor). */
export function formatRoomsConsultPatientTableHtml(patient: PatientForDocuments): string {
  const name = sanitizeTemplateFieldValue((patient.name ?? '').trim()) || '';
  const folder = sanitizeTemplateFieldValue((patient.folderNumber ?? '').trim()) || '';
  const age = patient.dob ? formatAgeFromIsoDob(patient.dob) : '';
  const ageDisplay = age === '—' ? '' : age;
  const contact = sanitizeTemplateFieldValue((patient.contactNumber ?? '').trim()) || '';
  const refDoc = sanitizeTemplateFieldValue((patient.referringDoctor ?? '').trim()) || '';

  const row = (label: string, value: string) =>
    `<tr>
      <td class="rooms-pt-label" style="width:28%;padding:2px 4px 2px 0;font-size:clamp(8px,2.4vw,10pt);font-weight:bold;vertical-align:top;border:1px solid #000;line-height:1.2;">${label}</td>
      <td class="rooms-pt-value" style="padding:2px 0 2px 4px;font-size:clamp(8px,2.4vw,10pt);vertical-align:top;border:1px solid #000;line-height:1.2;">${value}</td>
    </tr>`;

  return `<table class="rooms-patient-table" data-rooms-patient-table="true" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 8px;">
    ${row('Name:', name)}
    ${row('Folder number:', folder)}
    ${row('Age:', ageDisplay)}
    ${row('Contact number:', contact)}
    ${row('Referring Doctor:', refDoc)}
    ${row('Ref Dr Contact:', '')}
  </table>`;
}

function isOmitValue(v: string, allowNone = false): boolean {
  if (!sanitizeTemplateFieldValue(v)) return true;
  const t = v.trim().toLowerCase();
  if (!allowNone && (t === 'no' || t === 'none')) return true;
  return false;
}

function pushSection(out: string[], title: string, body: string): void {
  const b = body.trim();
  if (!b) return;
  out.push(title, '', b, '');
}

function joinLines(lines: string[]): string {
  return lines.filter((l) => l.trim()).join('\n');
}

function formatRiskFactors(f: RoomsConsultNoteFields): string {
  const keys = [
    'hypertension',
    'family_hx',
    'dyslipidaemia',
    'smoker',
    'etoh',
    'diabetes',
    'known_cad',
  ] as const;
  const lines: string[] = [];
  for (const key of keys) {
    const v = f[key];
    if (isOmitValue(v)) continue;
    lines.push(`${humanizeFieldKey(key)}: ${v.trim()}`);
  }
  return joinLines(lines);
}

function formatSymptoms(f: RoomsConsultNoteFields): string {
  const keys = [
    'angina',
    'dyspnoea',
    'pnd',
    'orthopnoea',
    'oedema_symptom',
    'palpitations',
    'syncope',
    'claudication',
  ] as const;
  const lines: string[] = [];
  for (const key of keys) {
    const v = f[key];
    if (isOmitValue(v)) continue;
    lines.push(`${humanizeFieldKey(key)}: ${v.trim()}`);
  }
  return joinLines(lines);
}

function formatExamination(f: RoomsConsultNoteFields): string {
  const keys = [
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
  ] as const;
  const lines: string[] = [];
  for (const key of keys) {
    const v = f[key];
    if (isOmitValue(v)) continue;
    lines.push(`${humanizeFieldKey(key)}: ${v.trim()}`);
  }
  return joinLines(lines);
}

function formatInvestigations(f: RoomsConsultNoteFields): string {
  const keys = [
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
  ] as const;
  const lines: string[] = [];
  for (const key of keys) {
    const v = f[key];
    if (isOmitValue(v)) continue;
    lines.push(`${humanizeFieldKey(key)}: ${v.trim()}`);
  }
  return joinLines(lines);
}

/** Finished Rooms Consult body (no letterhead, no patient table — those are added separately). */
export function formatRoomsConsultNoteForEditor(f: RoomsConsultNoteFields): string {
  const out: string[] = [];

  const visitMeta: string[] = [];
  if (!isOmitValue(f.new_or_follow_up)) visitMeta.push(`Visit: ${f.new_or_follow_up.trim()}`);
  if (!isOmitValue(f.date)) visitMeta.push(`Date: ${f.date.trim()}`);
  if (visitMeta.length) {
    out.push(visitMeta.join('    '), '');
  }

  const backgroundParts: string[] = [];
  if (!isOmitValue(f.clinical_background)) backgroundParts.push(f.clinical_background.trim());
  const risks = formatRiskFactors(f);
  if (risks) backgroundParts.push(risks);
  pushSection(out, 'CLINICAL BACKGROUND', backgroundParts.join('\n\n'));

  pushSection(out, 'PRESENTING COMPLAINTS', f.presenting_complaints);

  const symptoms = formatSymptoms(f);
  pushSection(out, 'SYMPTOMS', symptoms);

  const generalHistory: string[] = [];
  if (!isOmitValue(f.allergies)) generalHistory.push(`Allergies: ${f.allergies.trim()}`);
  if (!isOmitValue(f.occupation)) generalHistory.push(`Occupation: ${f.occupation.trim()}`);
  if (!isOmitValue(f.bleeding_history))
    generalHistory.push(`Bleeding history: ${f.bleeding_history.trim()}`);
  if (!isOmitValue(f.surgical_history))
    generalHistory.push(`Surgical history: ${f.surgical_history.trim()}`);
  pushSection(out, 'GENERAL & SURGICAL HISTORY', joinLines(generalHistory));

  const meds: string[] = [];
  if (!isOmitValue(f.medication, true)) meds.push(f.medication.trim());
  if (!isOmitValue(f.medication_changes)) meds.push(f.medication_changes.trim());
  pushSection(out, 'MEDICATION', joinLines(meds));

  pushSection(out, 'PHYSICAL EXAMINATION', formatExamination(f));
  pushSection(out, 'INVESTIGATIONS', formatInvestigations(f));
  pushSection(out, 'ASSESSMENT', f.assessment);
  pushSection(out, 'PLAN', f.plan);

  return out.join('\n').trim();
}
