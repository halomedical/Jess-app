import { buildClientClinicalNotePrompt } from './buildClientClinicalNotePrompt';

/** @deprecated Use buildClientClinicalNotePrompt */
export function buildGeminiClinicalNoteUserPrompt(transcript: string, templateId: string): string {
  return buildClientClinicalNotePrompt(transcript, templateId);
}
