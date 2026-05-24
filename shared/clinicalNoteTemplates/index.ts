import type { ClinicalNoteTemplateDefinition } from '../clinicalNoteTemplateTypes';
import { ECHO_CLINICAL_TEMPLATE } from './echo';
import { REPORT_CLINICAL_TEMPLATE } from './report';
import { ROOMS_CONSULT_CLINICAL_TEMPLATE } from './roomsConsult';
import { ECHO_TEMPLATE_ID, REPORT_TEMPLATE_ID, ROOMS_CONSULT_TEMPLATE_ID } from '../haloTemplates';

const LOCAL_TEMPLATES: Record<string, ClinicalNoteTemplateDefinition> = {
  [REPORT_TEMPLATE_ID]: REPORT_CLINICAL_TEMPLATE,
  [ROOMS_CONSULT_TEMPLATE_ID]: ROOMS_CONSULT_CLINICAL_TEMPLATE,
  [ECHO_TEMPLATE_ID]: ECHO_CLINICAL_TEMPLATE,
};

export function getLocalClinicalNoteTemplate(
  templateId: string
): ClinicalNoteTemplateDefinition | undefined {
  return LOCAL_TEMPLATES[templateId];
}

export { REPORT_CLINICAL_TEMPLATE, ROOMS_CONSULT_CLINICAL_TEMPLATE, ECHO_CLINICAL_TEMPLATE };
