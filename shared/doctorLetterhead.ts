import type { UserSettings } from './types';

/**
 * Standard letterhead block from user profile (Settings).
 * Prepended to generated clinical notes in the editor when profile fields exist.
 */
export function formatDoctorLetterheadBlock(settings: UserSettings | null | undefined): string {
  if (!settings) return '';
  const lines: string[] = [];
  const name = [settings.firstName, settings.lastName].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  if (name) lines.push(name);
  const role = [settings.profession, settings.department].map((s) => (s ?? '').trim()).filter(Boolean).join(' · ');
  if (role) lines.push(role);
  const loc = [settings.city, settings.postalCode].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  if (loc) lines.push(loc);
  const uni = (settings.university ?? '').trim();
  if (uni) lines.push(uni);
  if (lines.length === 0) return '';
  return lines.join('\n');
}
