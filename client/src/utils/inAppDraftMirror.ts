import { DEFAULT_HALO_TEMPLATE_ID } from '../../../shared/haloTemplates';
import type { ClinicalWorkspaceDraft } from '../../../shared/workspaceDraft';

const PREFIX = 'halo_inAppPatientDraft_v1:';

export function inAppPatientMirrorKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function emptyDraft(): ClinicalWorkspaceDraft {
  return {
    pendingTranscript: null,
    notes: [],
    activeNoteIndex: 0,
    selectedTemplatesForGenerate: [DEFAULT_HALO_TEMPLATE_ID],
    templateId: DEFAULT_HALO_TEMPLATE_ID,
  };
}

/**
 * Merges new transcription into the patient-only localStorage mirror so it survives
 * logout, remounts, and cases where the workspace listener is not registered yet.
 */
export function mergeTranscriptIntoInAppMirrorDraft(patientId: string, transcript: string): void {
  const chunk = transcript.trim();
  if (!chunk) return;
  try {
    const key = inAppPatientMirrorKey(patientId);
    const raw = localStorage.getItem(key);
    let draft: ClinicalWorkspaceDraft;
    if (raw) {
      const parsed = JSON.parse(raw) as { draft?: ClinicalWorkspaceDraft; savedAt?: number };
      const d = parsed.draft;
      if (d && typeof d === 'object') {
        draft = {
          ...emptyDraft(),
          ...d,
          notes: Array.isArray(d.notes) ? d.notes : [],
          selectedTemplatesForGenerate: Array.isArray(d.selectedTemplatesForGenerate)
            ? d.selectedTemplatesForGenerate
            : [DEFAULT_HALO_TEMPLATE_ID],
          templateId: typeof d.templateId === 'string' ? d.templateId : DEFAULT_HALO_TEMPLATE_ID,
        };
      } else {
        draft = emptyDraft();
      }
    } else {
      draft = emptyDraft();
    }
    const prev = draft.pendingTranscript?.trim();
    draft.pendingTranscript = prev ? `${prev}\n\n${chunk}` : chunk;
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), draft }));
  } catch {
    /* quota / private mode */
  }
}
