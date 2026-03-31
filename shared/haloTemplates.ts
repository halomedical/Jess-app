/**
 * Halo generate_note template IDs and UI labels.
 * Default clinical note uses Jess template (not legacy string keys).
 */

/** Jess clinical note template in Halo */
export const JESS_CLINICAL_TEMPLATE_ID = 'fcb5cfec-e10e-4c3a-bd44-064a788a6243';

export const DEFAULT_HALO_TEMPLATE_ID = JESS_CLINICAL_TEMPLATE_ID;

/** Options shown in Settings, note editor, and scribe template picker (Jess only) */
export const HALO_TEMPLATE_OPTIONS: { id: string; name: string }[] = [
  { id: JESS_CLINICAL_TEMPLATE_ID, name: 'Clinical Note (Jess)' },
];
