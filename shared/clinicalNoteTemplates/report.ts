import type { ClinicalNoteTemplateDefinition } from '../clinicalNoteTemplateTypes';
import { REPORT_TEMPLATE_ID } from '../haloTemplates';

/** Local copy of Halo "Report" template field instructions (template editor). */
export const REPORT_CLINICAL_TEMPLATE: ClinicalNoteTemplateDefinition = {
  template_id: REPORT_TEMPLATE_ID,
  name: 'Report',
  description: '',
  doc_path: 'Templates/Jess report template.docx',
  fields: [
    {
      key: 'date',
      description:
        'Be a professional medical typist and extract this field exactly as Dr John dictates. Insert the date the letter is being dictated or issued, in DD-MM-YYYY format (e.g., 10-09-2025).',
    },
    {
      key: 'addressee',
      description:
        "Extract the full name and title of the referring clinician or addressee (e.g., 'Dr Marius Wasserfall', 'Dr Adriano Pellizzon', 'Dr Debra Harmuth').",
    },
    {
      key: 'addressee_location',
      description:
        "Extract the addressee's physical practice address or location (e.g., 'Mediclinic Panorama', '2 Augsburg Road Clanwilliam').",
    },
    {
      key: 'addressee_email',
      description:
        "Extract the addressee's email address if dictated (e.g., 'admin@drwasserfall.co.za').",
    },
    {
      key: 'patient_name',
      description:
        "Extract the full patient name as used in the 'RE:' line (e.g., 'Sarilene Phillips').",
    },
    {
      key: 'id_no',
      description: "Extract the patient's South African ID number as dictated (e.g., 8310020186081).",
    },
    {
      key: 'file_no',
      description: "Extract the internal practice or hospital file number (e.g., '22330 – 1026').",
    },
    {
      key: 'background',
      description:
        "This is the **History / Background** section. Include: patient's age and gender, past medical and surgical history, relevant family and social history, allergies, medications, and full history of the presenting problem. End this section by numbering the **main acute problems** on new lines with ICD-10 codes if available.",
    },
    {
      key: 'clinical_examination',
      description:
        'This is the **Clinical Examination** section. Include only objective findings such as general appearance, GCS, vital signs, rhythm, JVP, cardiac and respiratory findings, and any signs of heart failure. Use standard medical formatting and abbreviations for all SI units and measurements.',
    },
    {
      key: 'special_investigations',
      description:
        'This is the **Special Investigations** section. Include all investigations (ECG, echocardiogram, angiogram, bloods). Present each as a **separate paragraph** with a blank line in between for readability. Preserve exact technical detail and formatting of values.',
    },
    {
      key: 'assessment_plan',
      description:
        'This is the **Assessment and Plan** section. Summarise the key conclusions and management steps. Structure the plan as **numbered steps**, each on a new line. Include outcomes, discharge status, medication adjustments, follow-up instructions, and target parameters (e.g., LDL < 1.4).',
    },
  ],
};
