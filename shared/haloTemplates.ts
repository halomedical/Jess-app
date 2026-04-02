/**
 * Halo / Python generate_note template IDs and UI labels.
 * Must match the template_id values exposed by get_templates / generate_note.
 */

/** Default Firebase / API user that owns these templates (Python backend). */
export const DEFAULT_HALO_API_USER_ID = 'fcb5cfec-e10e-4c3a-bd44-064a788a6243';

export const ROOMS_CONSULT_TEMPLATE_ID = 'rooms_consult';
export const REPORT_TEMPLATE_ID = 'report';
export const ECHO_TEMPLATE_ID = 'echo';

export const DEFAULT_HALO_TEMPLATE_ID = ROOMS_CONSULT_TEMPLATE_ID;

/** Options shown in Settings, note editor, and scribe template picker */
export const HALO_TEMPLATE_OPTIONS: { id: string; name: string }[] = [
  { id: ROOMS_CONSULT_TEMPLATE_ID, name: 'Rooms Consult' },
  { id: REPORT_TEMPLATE_ID, name: 'Report' },
  { id: ECHO_TEMPLATE_ID, name: 'Echo Report' },
];

/**
 * Section guides for Gemini when generate_note is unavailable (fallback only).
 * Kept in sync with Python template intent so previews stay structured per template.
 */
export const HALO_TEMPLATE_GEMINI_GUIDES: Record<string, string> = {
  [ROOMS_CONSULT_TEMPLATE_ID]: `
Use exactly these ## sections in order:
## Reason for consultation / Indication
## History of present illness
## Past medical history & medications (as dictated)
## Examination / pertinent positives (if dictated)
## Investigations (labs, imaging, echo summary if mentioned)
## Assessment
## Plan and follow-up

Write concise clinical prose suitable for a consult note.`,

  [REPORT_TEMPLATE_ID]: `
Use exactly these ## sections in order:
## Report header (procedure or report type as dictated; include date if given)
## Clinical indication / history
## Technique or context (if applicable)
## Findings / procedure details
## Complications (state "None" or "Not discussed")
## Impression / diagnosis
## Recommendations / follow-up

Use formal report tone.`,

  [ECHO_TEMPLATE_ID]: `
Use exactly these ## sections in order (echo / cardiac ultrasound style):
## Study information (study type, indication if dictated)
## Quality / windows (if mentioned)
## Chambers & function (including LVEF and dimensions if dictated; otherwise N/A)
## Valves (stenosis/regurgitation as stated)
## Great vessels / other structures (if dictated)
## Impression
## Recommendations / follow-up

Use standard echo terminology; do not fabricate measurements.`,
};

export function getGeminiGuideForTemplate(templateId: string): string | undefined {
  return HALO_TEMPLATE_GEMINI_GUIDES[templateId];
}
