import type { Patient } from './types';

/**
 * Structured block prepended to dictation or note text for Halo / Gemini so template
 * header fields (name, surname, DOB, sex) are filled from the app chart, not left blank.
 */
export function buildPatientDemographicsForNoteInput(
  patient: Pick<Patient, 'name' | 'dob' | 'sex'>
): string {
  const name = (patient.name ?? '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : '';
  const givenNames = parts.length > 1 ? parts.slice(0, -1).join(' ') : name;

  const lines = [
    '--- Patient identifiers (from electronic chart — use these for template header fields: patient name, surname, DOB, sex; do not leave blank) ---',
    `Full name (as recorded): ${name || '—'}`,
    givenNames && surname ? `Given / first name(s): ${givenNames}` : '',
    surname ? `Surname / family name: ${surname}` : '',
    `Date of birth: ${patient.dob || '—'}`,
    `Sex: ${patient.sex || '—'}`,
    '--- End patient identifiers ---',
  ].filter(Boolean);

  return lines.join('\n');
}

/** Dictation + chart identifiers for generate_note / preview. */
export function buildClinicalNoteInputFromDictation(
  patient: Pick<Patient, 'name' | 'dob' | 'sex'>,
  transcript: string
): string {
  const demo = buildPatientDemographicsForNoteInput(patient);
  const t = (transcript ?? '').trim();
  if (!t) return demo;
  return `${demo}\n\n--- Clinical dictation ---\n\n${t}`;
}

/** Chart identifiers + existing note body for DOCX / email generation paths. */
export function buildNoteTextWithPatientChart(
  patient: Pick<Patient, 'name' | 'dob' | 'sex'>,
  notePlainText: string
): string {
  const demo = buildPatientDemographicsForNoteInput(patient);
  const body = (notePlainText ?? '').trim();
  if (!body) return demo;
  return `${demo}\n\n--- Note content ---\n\n${body}`;
}
