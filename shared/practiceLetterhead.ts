/** Programmatic DOCX fallback only — matches Templates/Jess rooms_consult template.docx letterhead. */
export const PRACTICE_LETTERHEAD = {
  doctorName: 'DR T J JOHN',
  qualifications:
    'MBChB(UCT) / Dip HIV Man (SA) / FCP (SA) / M.Med (Int) (Stell) / MRCP (UK) / Cert Cardio (SA)',
  registrationLine: 'MP No: 0746240/ PR No: 1028103',
  roomsLabel: 'ROOMS',
  locationLines: [
    'Mediclinic Panorama',
    'Suite H01, Heart Unit',
    'Rothschild Boulevard',
    'Panorama, 7500',
  ],
  contactLines: [
    'Tel: 021 930 3222',
    'Fax: 021 930 3299',
    'E-mail: matitia@corbettcardio.co.za',
    'PO BOX 3391, Tygervalley, 7536',
  ],
  /** Report letter closing (not used on Rooms Consult). */
  closingLines: [
    'Thank you very much.',
    '',
    '',
    '',
    'Dictated but not read',
    'DR TJ JOHN',
    '',
    'CONFIDENTIAL  NOTICE',
    'The information contained herein is intended for use by the individual to whom it is addressed. It may contain information that is privileged, confidential and exempt for disclosure under applicable law.  If you are not the intended recipient, you are hereby notified that any distribution, dissemination, copying or any use of this communication in any form is strictly prohibited. If you have received this communication in error, please notify the sender immediately and destroy the original without retaining any copies.',
  ],
} as const;
