import { Document, Packer, Paragraph, Table } from 'docx';
import { stripPracticeLetterheadFromNote } from '../../shared/stripPracticeLetterhead';
import type { PatientForDocuments } from '../../shared/patientDemographics';
import {
  bodyParagraph,
  bodyParagraphs,
  buildPatientDetailsTable,
  buildPracticeLetterheadSection,
} from './practiceDocxShared';

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/** Split note body into ## sections or plain paragraphs. */
function consultBodyParagraphs(noteText: string): Paragraph[] {
  const cleaned = stripPracticeLetterheadFromNote(noteText);
  const normalized = cleaned.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [new Paragraph({ spacing: { after: 120 } })];

  const sectionRe = /^##\s+(.+)$/gm;
  const parts = normalized.split(sectionRe);
  const paras: Paragraph[] = [];

  if (parts.length === 1) {
    return bodyParagraphs(stripMarkdownInline(normalized));
  }

  const preamble = (parts[0] ?? '').trim();
  if (preamble) paras.push(...bodyParagraphs(stripMarkdownInline(preamble)));

  for (let i = 1; i < parts.length; i += 2) {
    const heading = stripMarkdownInline((parts[i] ?? '').trim());
    const body = stripMarkdownInline((parts[i + 1] ?? '').trim());
    if (heading) {
      paras.push(new Paragraph({ spacing: { before: 160, after: 80 } }));
      paras.push(bodyParagraph(heading, { bold: true, spacingAfter: 80 }));
    }
    if (body) paras.push(...bodyParagraphs(body));
  }

  return paras.length ? paras : [new Paragraph({ spacing: { after: 120 } })];
}

export async function buildRoomsConsultDocxBuffer(
  noteText: string,
  patient?: PatientForDocuments | null
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    ...buildPracticeLetterheadSection(),
    buildPatientDetailsTable(patient),
    new Paragraph({ spacing: { before: 200, after: 120 } }),
    ...consultBodyParagraphs(noteText),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
