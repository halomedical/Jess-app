import { AlignmentType, Document, Packer, Paragraph, Table } from 'docx';
import { parseReportNoteFields } from '../../shared/parseReportNoteContent';
import { PRACTICE_LETTERHEAD } from '../../shared/practiceLetterhead';
import type { PatientForDocuments } from '../../shared/patientDemographics';
import {
  bodyParagraph,
  bodyParagraphs,
  buildPracticeLetterheadSection,
  run,
} from './practiceDocxShared';

function reportBodyParagraphs(f: ReturnType<typeof parseReportNoteFields>): Paragraph[] {
  const paras: Paragraph[] = [];

  paras.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [run(f.date)],
    })
  );

  paras.push(bodyParagraph(f.addressee));
  paras.push(bodyParagraph(f.addressee_location));
  paras.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        f.addressee_email.trim() ? run(f.addressee_email, { underline: true }) : run(' '),
      ],
    })
  );

  paras.push(new Paragraph({ spacing: { after: 120 } }));

  paras.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [run('RE:  ', { bold: true }), run(f.patient_name || ' ')],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [run('ID no. ', { bold: true }), run(f.id_no || ' ')],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [run('File no. ', { bold: true }), run(f.file_no || ' ')],
    })
  );

  paras.push(...bodyParagraphs(f.background));

  if (f.clinical_examination.trim()) {
    paras.push(new Paragraph({ spacing: { before: 120, after: 80 } }));
    paras.push(bodyParagraph('CLINICAL EXAMINATION:', { bold: true, spacingAfter: 80 }));
    paras.push(...bodyParagraphs(f.clinical_examination));
  }

  if (f.special_investigations.trim()) {
    paras.push(new Paragraph({ spacing: { before: 120, after: 80 } }));
    paras.push(bodyParagraph('SPECIAL INVESTIGATIONS:', { bold: true, spacingAfter: 80 }));
    paras.push(...bodyParagraphs(f.special_investigations));
  }

  if (f.assessment_plan.trim()) {
    paras.push(new Paragraph({ spacing: { before: 120, after: 80 } }));
    paras.push(bodyParagraph('ASSESSMENT AND PLAN:', { bold: true, spacingAfter: 80 }));
    paras.push(...bodyParagraphs(f.assessment_plan));
  }

  paras.push(new Paragraph({ spacing: { before: 240, after: 120 } }));
  for (const line of PRACTICE_LETTERHEAD.closingLines) {
    if (!line.trim()) {
      paras.push(new Paragraph({ spacing: { after: 120 } }));
    } else if (line.startsWith('CONFIDENTIAL')) {
      paras.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [run(line, { bold: true })],
        })
      );
    } else if (line === 'DR TJ JOHN') {
      paras.push(bodyParagraph(line, { bold: true }));
    } else {
      paras.push(bodyParagraph(line));
    }
  }

  return paras;
}

export async function buildReportDocxBuffer(
  noteText: string,
  patient?: PatientForDocuments | null
): Promise<Buffer> {
  const fields = parseReportNoteFields(noteText, patient);
  const children: (Paragraph | Table)[] = [
    ...buildPracticeLetterheadSection(),
    ...reportBodyParagraphs(fields),
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
