import type { Patient } from './types';

/** Fields used when building note / email / DOCX context from the chart. */
export type PatientForDocuments = Pick<
  Patient,
  'name' | 'dob' | 'sex' | 'folderNumber' | 'contactNumber'
>;

/** Human-readable age from YYYY-MM-DD; returns "—" if invalid. */
export function formatAgeFromIsoDob(isoDob: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDob)) return '—';
  const birth = new Date(`${isoDob}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '—';
}
