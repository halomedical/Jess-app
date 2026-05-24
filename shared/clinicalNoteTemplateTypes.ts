/** Field definition from Halo template editor (matches Firebase / Python template JSON). */
export interface ClinicalNoteTemplateField {
  key: string;
  description: string;
  default?: string;
  spell_check?: string[];
}

export interface ClinicalNoteTemplateDefinition {
  template_id: string;
  name: string;
  description?: string;
  doc_path?: string;
  fields: ClinicalNoteTemplateField[];
}
