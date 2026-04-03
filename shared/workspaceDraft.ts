import type { HaloNote } from './types';

/** Hidden JSON in each patient’s “Patient Notes” Drive folder — source of truth for editor + scribe state. */
export const HALO_WORKSPACE_DRAFT_FILENAME = '__Halo_clinical_workspace.json';

export function isHaloWorkspaceDraftFile(name: string): boolean {
  return name === HALO_WORKSPACE_DRAFT_FILENAME;
}

export interface ClinicalWorkspaceDraft {
  pendingTranscript: string | null;
  notes: HaloNote[];
  activeNoteIndex: number;
  selectedTemplatesForGenerate: string[];
  templateId: string;
}

export interface ClinicalWorkspaceDraftFile {
  savedAt: number;
  draft: ClinicalWorkspaceDraft;
}
