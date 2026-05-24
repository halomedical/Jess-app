import type { ClinicalNoteTemplateDefinition } from '../clinicalNoteTemplateTypes';
import { ROOMS_CONSULT_TEMPLATE_ID } from '../haloTemplates';

/** Local copy of Halo "Rooms Consult" template field instructions (template editor). */
export const ROOMS_CONSULT_CLINICAL_TEMPLATE: ClinicalNoteTemplateDefinition = {
  template_id: ROOMS_CONSULT_TEMPLATE_ID,
  name: 'Rooms Consult',
  description: '',
  doc_path: 'Templates/Jess rooms_consult template.docx',
  fields: [
    {
      key: "patient_name",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Populate the patient's full name as dictated (include title if given). Do not include folder numbers, age, or contact details here. Formatting: single line only. Example: 'Mr Sipho Mhlongo'.",
    },
    {
      key: "folder_no",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter the Tygerberg/Mediclinic folder or MRN exactly as spoken. Digits only unless letters are dictated. No spaces unless explicitly dictated. Example: '18739245'.",
    },
    {
      key: "age",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter age in completed years only (no units). If months are dictated for paediatrics, convert to years with one decimal only if explicitly instructed; otherwise type as dictated. Example: '64'.",
    },
    {
      key: "contact",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. South African phone format preferred; keep any country code if dictated. No commentary. Example: '082 123 4567' or '+27 82 123 4567'.",
    },
    {
      key: "referring_doctor",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record the referring clinician's name and title only. Do not include their contact number here. Example: 'Dr A. Naidoo'.",
    },
    {
      key: "referring_doctor_contact",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter the referring doctor's contact number or email exactly as dictated. Example: '021 938 0000' or 'refdoc@hospital.org'.",
    },
    {
      key: "new_or_follow_up",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter exactly 'New' or 'Follow-up' as dictated. If both are mentioned, select the one the doctor confirms last. Example: 'Follow-up'.",
    },
    {
      key: "date",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Use DD/MM/YYYY unless the doctor uses another format. Example: '16/10/2025'.",
    },
    {
      key: "clinical_background",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. One concise paragraph summarising relevant past cardiac history and context only (no current symptoms). Include key prior diagnoses/interventions and pertinent negatives. Example: 'Known hypertension and dyslipidaemia; ex-smoker (10 PY). No prior MI or revascularisation. Referred for evaluation of exertional dyspnoea.'",
    },
    {
      key: "hypertension",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record hypertension risk factor status as 'Yes' or 'No'. If details are dictated (duration/control/meds), add a brief phrase after a dash. Example: 'Yes – 8 years, on amlodipine'.",
    },
    {
      key: "family_hx",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Summarise family history relevant to cardiovascular risk (premature CAD, sudden death). Keep to one line. Example: 'Father MI at 52; no sudden deaths.'",
    },
    {
      key: "dyslipidaemia",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record dyslipidaemia risk factor status as 'Yes' or 'No', with brief treatment note if given. Example: 'Yes – on rosuvastatin 20 mg nocte'.",
    },
    {
      key: "smoker",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Indicate tobacco status succinctly: 'Current – X pack years', 'Previous – X pack years', or 'Never'. Example: 'Previous – 12 pack years'.",
    },
    {
      key: "etoh",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Summarise alcohol intake briefly. Use standard phrasing: 'None', 'Social', or units/week if given. Example: 'Social – ~4 units/week'.",
    },
    {
      key: "diabetes",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record diabetes status as 'No' or 'Yes – Type and control'. Include therapy if dictated. Example: 'Yes – Type 2, on metformin; last HbA1c 7.2%'.",
    },
    {
      key: "known_cad",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. State whether coronary artery disease is known. If yes, add succinct detail of prior MI/PCI/CABG with year. Example: 'Yes – PCI to LAD (2021)'.",
    },
    {
      key: "presenting_complaints",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Bullet-style (each on a new line) or short paragraph listing CURRENT complaints only. Do not include exam findings. Example: '• Chest tightness on exertion (3/12)\n• Palpitations at night'.",
    },
    {
      key: "angina",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter 'Yes' or 'No'. If yes, optionally append CCS class if dictated. Example: 'Yes – CCS II'.",
    },
    {
      key: "dyspnoea",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter 'Yes' or 'No'. If severity is dictated, append NYHA class. Example: 'Yes – NYHA III'.",
    },
    {
      key: "pnd",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter 'Yes' or 'No' for paroxysmal nocturnal dyspnoea. Example: 'No'.",
    },
    {
      key: "orthopnoea",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter 'Yes' or 'No' for orthopnoea. Example: 'Yes'.",
    },
    {
      key: "oedema_symptom",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record patient-reported ankle/leg swelling (symptom). Enter 'Yes' or 'No'. Do not duplicate physical exam findings here. Example: 'No'.",
    },
    {
      key: "palpitations",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. 'Yes' or 'No'. If frequency/trigger is dictated, add a brief qualifier. Example: 'Yes – nocturnal episodes'.",
    },
    {
      key: "syncope",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. 'Yes' or 'No'. If yes, note brief context (exertional/vasovagal) only if dictated. Example: 'No'.",
    },
    {
      key: "claudication",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Peripheral vascular symptom: 'Yes' or 'No'. Example: 'No'.",
    },
    {
      key: "allergies",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. List drug/contrast/latex allergies; if none, type 'None'. One per line or comma-separated as dictated. Example: 'Penicillin – rash'.",
    },
    {
      key: "occupation",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Job title only. Do not include employer contact details. Example: 'Electrician'.",
    },
    {
      key: "bleeding_history",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Summarise peptic ulcer disease/bleeding history relevant to antiplatelet/anticoagulant use. Example: 'PUD in 2019; no recent GI bleed'.",
    },
    {
      key: "surgical_history",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. List key prior surgeries with year only if dictated. Example: 'Appendicectomy (2010); Cholecystectomy (2018)'.",
    },
    {
      key: "medication",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Current medications: one per line, include dose and frequency in standard abbreviations (OD/BD/TDS/PRN). Example: 'Amlodipine 10 mg OD'.",
    },
    {
      key: "medication_changes",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record changes initiated today only (start/stop/adjust), one per line. Example: 'Start rosuvastatin 20 mg nocte; stop simvastatin'.",
    },
    {
      key: "bp_sitting",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Sitting blood pressure as 'SBP/DBP mmHg'. Example: '138/84 mmHg'.",
    },
    {
      key: "pulse_rate",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Pulse rate as a number in bpm. Do not append 'bpm' if the template already shows it. Example: '76'.",
    },
    {
      key: "pulse_character",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Short phrase for character only (e.g., 'Regular', 'Irregularly irregular', 'Thready', 'Bounding'). Example: 'Regular'.",
    },
    {
      key: "spo2",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Oxygen saturation on room air unless otherwise specified. Enter as percentage with '%'. Example: '97% (RA)'.",
    },
    {
      key: "bp_standing",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Standing blood pressure as 'SBP/DBP mmHg'. Example: '126/82 mmHg'.",
    },
    {
      key: "oedema_exam",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Physical examination finding of peripheral oedema. Enter 'Present' or 'Absent', and if graded/described, append briefly (e.g., 'Present – pitting to mid-shin'). Do not duplicate symptom status here. Example: 'Absent'.",
    },
    {
      key: "pale",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter 'Yes' or 'No' for pallor on examination. Example: 'No'.",
    },
    {
      key: "cyanosis",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Enter 'Yes' or 'No' for cyanosis. Example: 'No'.",
    },
    {
      key: "carotid",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Brief carotid exam comment (bruits/character). Example: 'No bruits; normal upstroke'.",
    },
    {
      key: "clubbing",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. 'Yes' or 'No' for digital clubbing. Example: 'No'.",
    },
    {
      key: "lad",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Record lymphadenopathy presence as 'Yes' or 'No'. Example: 'No'.",
    },
    {
      key: "jaundice",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. 'Yes' or 'No' for jaundice. Example: 'No'.",
    },
    {
      key: "clinical_dyslipidaemia",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Clinical examination for stigmata of dyslipidaemia (xanthelasma, tendon xanthomas, corneal arcus). Enter one short line. If normal, record the doctor's wording (e.g., 'No lipid stigmata'). Example: 'Xanthelasma present; otherwise normal'.",
    },
    {
      key: "jvp",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Jugular venous pressure: 'Normal', 'Raised', or numeric cm H2O if dictated. Example: 'Normal'.",
    },
    {
      key: "psh",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Parasternal heave: 'Present' or 'Absent'. Example: 'Absent'.",
    },
    {
      key: "apex",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Apex beat position/character in short echo-style phrasing. Example: '5th ICS MCL; normal'.",
    },
    {
      key: "s1s2",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. State S1/S2 character succinctly (e.g., 'Normal', 'Loud P2', 'Split S2'). Example: 'Normal'.",
    },
    {
      key: "heart_sounds",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Describe murmurs/added sounds with grade, timing, area, radiation. One to two short lines. Example: 'Grade 3/6 ejection systolic murmur at RUSB radiating to carotids'.",
    },
    {
      key: "other_systems",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Summarise other system exams (Resp/Abdo/CNS) if abnormal; if normal, use the doctor's wording (e.g., 'Resp normal; Abdo normal; CNS normal'). Do not repeat cardiac findings.",
    },
    {
      key: "resting_ecg",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Single concise line of ECG interpretation. Example: 'Sinus rhythm, LVH voltage, non-specific ST-T changes'.",
    },
    {
      key: "echo",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. One–three short lines summarising key transthoracic echo findings (LV/RV function, valves, effusion). Example: 'LVEF ~55%; mild MR; no pericardial effusion'.",
    },
    {
      key: "exercise_stress",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Summarise stress test protocol, duration, METs if stated, and outcome. Example: 'Bruce II – 7:30 min, negative for ischaemia'.",
    },
    {
      key: "holter",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Summarise Holter findings (dominant rhythm, ectopy, pauses, AF burden). Example: 'Predominant sinus; occasional PVCs; no sustained arrhythmia'.",
    },
    {
      key: "angiogram",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Brief coronary angiogram summary: vessels with lesions and management. Example: 'Single-vessel disease: 80% mid-LAD; PCI performed'.",
    },
    {
      key: "bloods",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. List pertinent labs with values and dates where provided, each on a new line. Example: 'Hb 12.6 g/dL (16/10/2025)'.",
    },
    {
      key: "ldl",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. LDL cholesterol as a value with units mmol/L, and date if provided. Example: '2.3 mmol/L (Aug 2025)'.",
    },
    {
      key: "hb",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Haemoglobin value with units. Example: '13.4 g/dL'.",
    },
    {
      key: "hba1c",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. HbA1c as % with date if given. Example: '7.1% (Sep 2025)'.",
    },
    {
      key: "creat",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Creatinine value with units (µmol/L unless otherwise stated). Example: '92 µmol/L'.",
    },
    {
      key: "imaging",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Other imaging summaries (CXR, CT, MRI) each on a new line with date if given. Example: 'CXR (16/10/2025): no acute changes'.",
    },
    {
      key: "assessment",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. One concise paragraph impression integrating diagnosis and severity. Use cardiology style. Example: 'Stable angina with multiple CVRFs; likely microvascular component; no features of decompensated HF'.",
    },
    {
      key: "plan",
      description:
        "Be a professional medical typist and extract this field based on the transcript in the exact style and format the doctor usually dictates. Numbered or bulleted management plan; one action per line (investigations, medications with doses, lifestyle, follow-up). Example: '1) Start bisoprolol 2.5 mg OD\n2) Titrate statin to target LDL <1.4 mmol/L\n3) Stress ECG if symptoms persist\n4) Review in 6 weeks'.",
    }
  ],
};
