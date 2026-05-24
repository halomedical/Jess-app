import { stripDuplicateLeadingPatientDemographics } from './clinicalNoteSanitize';
import { getEditorTemplateString } from './clinicalNoteEditorTemplates';
import {
  enrichParsedDataWithChart,
  parseGeminiJsonResponse,
  populateEditorTemplate,
} from './populateClinicalNoteTemplate';
import type { PatientForDocuments } from './patientDemographics';
import { stripLeadingRoomsPatientDemographics } from './stripLeadingRoomsPatientDemographics';
import { stripPracticeLetterheadFromNote } from './stripPracticeLetterhead';

/**
 * Parse Gemini JSON, interpolate into the {{ }} editor template, and return populated plain text.
 * Never returns raw model output or ---FIELD markers.
 */
export function prepareClinicalBodyForRichLetterhead(
  templateId: string,
  rawFromModel: string,
  patient: PatientForDocuments
): string {
  let t = stripPracticeLetterheadFromNote((rawFromModel ?? '').trim());
  t = stripDuplicateLeadingPatientDemographics(t);
  t = stripLeadingRoomsPatientDemographics(t);

  const parsedData = parseGeminiJsonResponse(t);
  const enriched = enrichParsedDataWithChart(templateId, parsedData, patient);

  return populateEditorTemplate(getEditorTemplateString(templateId), enriched);
}
