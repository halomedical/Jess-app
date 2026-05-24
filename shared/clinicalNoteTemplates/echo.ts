import type { ClinicalNoteTemplateDefinition } from '../clinicalNoteTemplateTypes';
import { ECHO_TEMPLATE_ID } from '../haloTemplates';

/** Local copy of Halo "Echo Report" template field instructions (template editor). */
export const ECHO_CLINICAL_TEMPLATE: ClinicalNoteTemplateDefinition = {
  template_id: ECHO_TEMPLATE_ID,
  name: 'Echo Report',
  description: '',
  doc_path: 'Templates/Jess Echo Template.docx',
  fields: [
    {
      key: 'patient_name',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the patient's full name, including initials. Example: John M. Smith or Sipho van der Merwe.",
    },
    {
      key: 'folder_no',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the patient's unique folder or file number as used by the practice. Example: 123456.",
    },
    {
      key: 'date',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the exact date the echocardiogram was performed in DD/MM/YYYY format. Example: 16/10/2025.',
    },
    {
      key: 'echocardiographer',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the name of the person who performed the echocardiogram. This may be the doctor, a sonographer, or another clinician. Example: Dr. Jess John or Sonographer V. Naidoo.',
    },
    {
      key: 'indication',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the clinical reason or diagnosis for which the echocardiogram was requested. This should be a concise phrase or sentence. Example: Assessment of new-onset dyspnoea and known mild aortic stenosis.',
    },
    {
      key: 'lvidd',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Left Ventricular Internal Diameter in Diastole (LVIDd) measurement in millimeters (mm). Example: 50.',
    },
    {
      key: 'lvids',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Left Ventricular Internal Diameter in Systole (LVIDs) measurement in millimeters (mm). Example: 35.',
    },
    {
      key: 'la_diameter',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Left Atrial (LA) diameter measurement in millimeters (mm). Example: 40.',
    },
    {
      key: 'lvsd',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Interventricular Septum thickness in Diastole (IVSd) measurement in millimeters (mm). Example: 10.',
    },
    {
      key: 'lvef',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Left Ventricular Ejection Fraction (LVEF) as a percentage (%). Example: 55.',
    },
    {
      key: 'la_area',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Left Atrial (LA) area measurement in square centimeters (cm²). Example: 18.5.',
    },
    {
      key: 'ra_area',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Right Atrial (RA) area measurement in square centimeters (cm²). Example: 12.0.',
    },
    {
      key: 'lvpwd',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Left Ventricular Posterior Wall thickness in Diastole (LVPWd) measurement in millimeters (mm). Example: 10.',
    },
    {
      key: 'ewave',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Mitral E wave velocity measurement in centimeters per second (cm/s). Example: 80.',
    },
    {
      key: 'medial_e',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Medial Mitral Annular e' (tissue Doppler) velocity measurement in centimeters per second (cm/s). Example: 8.",
    },
    {
      key: 'awave',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Mitral A wave velocity measurement in centimeters per second (cm/s). Example: 60.',
    },
    {
      key: 'lateral_e',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Lateral Mitral Annular e' (tissue Doppler) velocity measurement in centimeters per second (cm/s). Example: 12.",
    },
    {
      key: 'edecel',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the Mitral E wave deceleration time (E Decel) measurement in milliseconds (ms). Example: 180.',
    },
    {
      key: 'ecg_rhythm',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the ECG rhythm observed during the study. Example: Sinus rhythm or Atrial fibrillation.',
    },
    {
      key: 'dilated_y_n',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Indicate if the Left Ventricle is 'Dilated' with a Yes or No. Example: No.",
    },
    {
      key: 'lvh_y_n',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Indicate if Left Ventricular Hypertrophy (LVH) is present with a Yes or No. Example: Yes.',
    },
    {
      key: 'systolic_fx',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the Left Ventricular Systolic Function. Use terms like 'Normal', 'Mildly impaired', 'Moderately impaired', or 'Severely impaired'. Include LVEF if dictated. Example: Mildly impaired (LVEF 45%).",
    },
    {
      key: 'filling_pattern',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the Left Ventricular Diastolic Filling pattern/function. Example: Impaired relaxation (Grade 1).',
    },
    {
      key: 'rwma',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe any Regional Wall Motion Abnormalities (RWMAs), specifying the location. If none, write 'None'. Example: Apical hypokinesis.",
    },
    {
      key: 'la_findings',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the findings for the Left Atrium. Example: Moderately dilated.',
    },
    {
      key: 'ra_findings',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the findings for the Right Atrium. Example: Normal size and appearance.',
    },
    {
      key: 'mitral',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the Mitral Valve structure and function, including any stenosis or regurgitation. Example: Mild annular calcification, trace regurgitation, no stenosis.',
    },
    {
      key: 'aortic',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the Aortic Valve structure and function, including any stenosis or regurgitation. Example: Tricuspid, mild calcification, mild stenosis (Peak Gradient 25mmHg).',
    },
    {
      key: 'rv_size',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the size of the Right Ventricle. Use terms like 'Normal', 'Mildly enlarged', 'Moderately enlarged', or 'Severely enlarged'. Example: Normal.",
    },
    {
      key: 'rv_function',
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the function of the Right Ventricle. Use terms like 'Normal', 'Mildly impaired', 'Moderately impaired', or 'Severely impaired'. Example: Normal (TAPSE 22mm).",
    },
    {
      key: 'tricuspid',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the Tricuspid Valve structure and function, including any regurgitation. Example: Trace regurgitation, otherwise normal.',
    },
    {
      key: 'pulmonic',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe the Pulmonic Valve structure and function, including any insufficiency. Example: Normal morphology, no significant insufficiency.',
    },
    {
      key: 'notes',
      description:
        'Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate any other important findings not covered above, such as pericardial effusion, masses, shunts (e.g., PFO/ASD), or prosthetic valve details. If multiple points, use a bulleted list. Example: Mild pericardial effusion, circumferentially. OR: PFO visualized with bubble study.',
    },
  ],
};
