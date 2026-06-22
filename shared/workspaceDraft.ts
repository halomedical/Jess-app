import type { HaloNote } from './types';

/** Hidden JSON in each patient’s “Patient Notes” Drive folder — source of truth for editor + scribe state. */
export const HALO_WORKSPACE_DRAFT_FILENAME = '__Halo_clinical_workspace.json';

/** Internal Drive folder for short-lived DOCX→PDF preview conversions — not a patient. */
export const HALO_PREVIEW_TEMP_FOLDER_NAME = '__Halo_Preview_Temp';

const HALO_SYSTEM_FOLDER_NAMES = new Set([HALO_PREVIEW_TEMP_FOLDER_NAME]);

/** Folders under Halo_Patients that must never appear in the patient list or workspace UI. */
export function isHaloSystemDriveFolder(
  name: string,
  appProperties?: Record<string, string> | null
): boolean {
  const n = (name ?? '').trim();
  if (HALO_SYSTEM_FOLDER_NAMES.has(n)) return true;
  if (appProperties?.haloSystem === 'previewTemp') return true;
  return false;
}

export function isHaloWorkspaceDraftFile(name: string): boolean {
  return name === HALO_WORKSPACE_DRAFT_FILENAME;
}

/** Temporary Google Docs created for in-app PDF preview — must not appear in the file browser. */
export function isHaloEphemeralPreviewFile(name: string, mimeType?: string): boolean {
  const n = (name ?? '').trim();
  if (/^note_preview_preview_/i.test(n)) return true;
  if (/_preview_\d{10,}/i.test(n)) return true;
  if (mimeType === 'application/vnd.google-apps.document' && /_preview_/i.test(n)) return true;
  return false;
}

export interface ClinicalWorkspaceDraft {
  pendingTranscript: string | null;
  notes: HaloNote[];
  activeNoteIndex: number;
  selectedTemplatesForGenerate: string[];
  templateId: string;
  /** Local YYYY-MM-DD date for the currently open consultation. */
  openConsultationDate?: string;
  /** Stable grouping key for same-patient/same-day appending. */
  openConsultationKey?: string;
}

export interface ClinicalWorkspaceDraftFile {
  savedAt: number;
  draft: ClinicalWorkspaceDraft;
}
