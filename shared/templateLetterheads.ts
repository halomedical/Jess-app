import {
  ECHO_TEMPLATE_ID,
  REPORT_TEMPLATE_ID,
  ROOMS_CONSULT_TEMPLATE_ID,
} from './haloTemplates';

/** Marker for HTML letterhead blocks (kept here to avoid circular import with richDoctorLetterhead.ts). */
export const RICH_LETTERHEAD_MARKER = 'data-rich-doctor-letterhead="true"';

const LETTERHEAD_FONT = "font-family:'Baskerville','Times New Roman',serif;";

function buildRichLetterheadHtml(opts: {
  doctorName: string;
  qualifications: string;
  registrationLine: string;
  leftLines: string[];
  rightLines: string[];
}): string {
  const left = opts.leftLines.map((l) => `${l}<br/>`).join('');
  const right = opts.rightLines.map((l) => {
    if (l.toLowerCase().startsWith('e-mail:')) {
      const email = l.replace(/^e-mail:\s*/i, '').trim();
      return `<a href="mailto:${email}" style="color:#000;text-decoration:underline;${LETTERHEAD_FONT}">E-mail: ${email}</a><br/>`;
    }
    return `${l}<br/>`;
  }).join('');

  return `<div id="rich-doctor-letterhead" class="rich-letterhead" ${RICH_LETTERHEAD_MARKER} style="${LETTERHEAD_FONT}color:#000;max-width:100%;margin:0;padding:0;">
  <p class="rich-lh-name" style="margin:0 0 4px;text-align:center;font-size:clamp(14px,4.5vw,22pt);font-weight:bold;letter-spacing:0.03em;text-transform:uppercase;line-height:1.1;${LETTERHEAD_FONT}">${opts.doctorName}</p>
  <p class="rich-lh-quals" style="margin:0 0 5px;text-align:center;font-size:clamp(7px,2.1vw,10pt);line-height:1.2;${LETTERHEAD_FONT}">${opts.qualifications}</p>
  <div class="rich-lh-ecg" style="width:100%;margin:clamp(4px,1.5vw,12px) 0;line-height:0;">
    <svg class="rich-lh-ecg-svg" viewBox="0 0 300 40" preserveAspectRatio="none" role="img" aria-hidden="true" style="display:block;width:100%;height:40px;max-height:40px;overflow:visible;">
      <path d="M0,20 L72,20 L82,20 Q90,12 97,20 L100,26 L106,4 L112,26 L115,20 L137,20 Q147,10 157,20 L187,20 L190,26 L196,4 L202,26 L205,20 L228,20 L300,20" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <p class="rich-lh-cardio" style="margin:0 0 6px;text-align:center;font-size:clamp(8px,2.4vw,11pt);font-weight:bold;letter-spacing:0.1em;${LETTERHEAD_FONT}">CARDIOLOGIST</p>
  <p class="rich-lh-reg" style="margin:0 0 6px;text-align:center;font-size:clamp(7px,2vw,10pt);line-height:1.2;${LETTERHEAD_FONT}">${opts.registrationLine}</p>
  <table class="rich-lh-contact" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;font-size:clamp(7px,2vw,10pt);line-height:1.25;margin:0 0 6px;${LETTERHEAD_FONT}">
    <tr>
      <td class="rich-lh-contact-left" style="width:50%;vertical-align:top;text-align:left;padding:0 8px 0 0;${LETTERHEAD_FONT}">${left}</td>
      <td class="rich-lh-contact-right" style="width:50%;vertical-align:top;text-align:right;padding:0 0 0 8px;${LETTERHEAD_FONT}">${right}</td>
    </tr>
  </table>
  <div class="rich-lh-rule" style="border-top:2px solid #000;border-bottom:1px solid #000;height:2px;margin:0;font-size:0;line-height:0;">&nbsp;</div>
</div>`.trim();
}

/** Matches Templates/Jess rooms_consult template.docx letterhead (Dr T J John). */
export const ROOMS_CONSULT_RICH_LETTERHEAD = buildRichLetterheadHtml({
  doctorName: 'DR T J JOHN',
  qualifications:
    'MBChB(UCT) / Dip HIV Man (SA) / FCP (SA) / M.Med (Int) (Stell) / MRCP (UK) / Cert Cardio (SA)',
  registrationLine: 'MP No: 0746240/ PR No: 1028103',
  leftLines: [
    'Mediclinic Panorama',
    'Suite H01, Heart Unit',
    'Rothschild Boulevard',
    'Panorama, 7500',
  ],
  rightLines: [
    'Tel: 021 930 3222',
    'Fax: 021 930 3299',
    'ROOMS E-mail: matitia@corbettcardio.co.za',
    'PO BOX 3391, Tygervalley, 7536',
  ],
});

/** Matches Templates/Jess Echo Template.docx letterhead (Dr Jess John). */
export const ECHO_RICH_LETTERHEAD = buildRichLetterheadHtml({
  doctorName: 'DR JESS JOHN',
  qualifications:
    'MBChB (UCT) / Dip HIV Man (SA) / FCP (SA) / M.Med (Int) (Stell) / MRCP (UK) / Cert Cardio (SA)',
  registrationLine: 'MP No: 0746240/ PR No: 1077163',
  leftLines: ['Mediclinic Panorama', 'Suite H01, Heart Unit'],
  rightLines: ['Tel: 021 930 3222', 'E-mail: reception@corbettcardio.co.za'],
});

/** Matches Templates/Jess report template.docx letterhead (Dr Jess John). */
export const REPORT_RICH_LETTERHEAD = buildRichLetterheadHtml({
  doctorName: 'DR JESS JOHN',
  qualifications:
    'MB.Ch.B (UCT) / FCP (SA) / Cert. Cardio (CMSA) / M.Phil (Cardio) / M.Med (Int) / MRCP (UK) / Dip HIV Man (SA)',
  registrationLine: 'Practice number: 1077163 · HPCSA MP number: 0746240',
  leftLines: [
    'Mediclinic Panorama',
    'Suite H01, Heart Unit',
    'Rothschild Boulevard',
    'Panorama, 7500',
  ],
  rightLines: [
    'Practice telephone number: 021 930 3222',
    'E-mail: info@corbettcardio.co.za',
  ],
});

export function getRichLetterheadForTemplate(templateId: string): string {
  const id = (templateId ?? '').trim().toLowerCase();
  if (id === ROOMS_CONSULT_TEMPLATE_ID) return ROOMS_CONSULT_RICH_LETTERHEAD;
  if (id === ECHO_TEMPLATE_ID) return ECHO_RICH_LETTERHEAD;
  if (id === REPORT_TEMPLATE_ID) return REPORT_RICH_LETTERHEAD;
  return REPORT_RICH_LETTERHEAD;
}
