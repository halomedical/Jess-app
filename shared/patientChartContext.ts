import type { Patient } from './types';
import { formatAgeFromIsoDob, type PatientForDocuments } from './patientDemographics';

export type { PatientForDocuments };

/**
 * Structured block prepended to dictation or note text for Halo / Gemini so template
 * header fields (name, surname, DOB, sex, age, folder #, contact) are filled from the chart.
 */
export function buildPatientDemographicsForNoteInput(patient: PatientForDocuments): string {
  const name = (patient.name ?? '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : '';
  const givenNames = parts.length > 1 ? parts.slice(0, -1).join(' ') : name;
  const age = formatAgeFromIsoDob(patient.dob || '');
  const folderNo = (patient.folderNumber ?? '').trim();
  const contact = (patient.contactNumber ?? '').trim();

  const lines = [
    '--- Patient identifiers (from electronic chart — use these for template header fields: patient name, surname, DOB, age, sex, folder/file number, contact; do not leave blank when provided) ---',
    `Full name (as recorded): ${name || '—'}`,
    givenNames && surname ? `Given / first name(s): ${givenNames}` : '',
    surname ? `Surname / family name: ${surname}` : '',
    `Date of birth: ${patient.dob || '—'}`,
    `Age (years, from DOB): ${age}`,
    `Sex: ${patient.sex || '—'}`,
    folderNo ? `Folder / file number: ${folderNo}` : '',
    contact ? `Contact number: ${contact}` : '',
    '--- End patient identifiers ---',
  ].filter(Boolean);

  return lines.join('\n');
}

/** Dictation + chart identifiers for generate_note / preview. */
export function buildClinicalNoteInputFromDictation(
  patient: PatientForDocuments,
  transcript: string
): string {
  const demo = buildPatientDemographicsForNoteInput(patient);
  const t = (transcript ?? '').trim();
  if (!t) return demo;
  return `${demo}\n\n--- Clinical dictation ---\n\n${t}`;
}

/** Chart identifiers + existing note body for DOCX / email generation paths. */
export function buildNoteTextWithPatientChart(
  patient: PatientForDocuments,
  notePlainText: string
): string {
  const demo = buildPatientDemographicsForNoteInput(patient);
  const body = (notePlainText ?? '').trim();
  if (!body) return demo;
  return `${demo}\n\n--- Note content ---\n\n${body}`;
}
