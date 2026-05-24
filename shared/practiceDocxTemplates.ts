/** Folder at repo root containing Jess practice .docx templates (user-uploaded). */
export const PRACTICE_TEMPLATES_DIR_NAME = 'Templates';

/** Substrings used to match template_id → filename in Templates/ (case-insensitive). */
export const TEMPLATE_ID_MATCHERS: Record<string, string[]> = {
  report: ['report'],
  rooms_consult: ['rooms_consult', 'rooms consult', 'rooms'],
  echo: ['echo'],
  angiogram: ['angiogram'],
};

export function normalizePracticeTemplateId(templateId: string): string {
  return (templateId ?? '').trim().toLowerCase();
}
