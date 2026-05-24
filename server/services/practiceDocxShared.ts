import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { PRACTICE_LETTERHEAD } from '../../shared/practiceLetterhead';
import { formatAgeFromIsoDob, type PatientForDocuments } from '../../shared/patientDemographics';

export const SERIF = 'Times New Roman';
export const BODY_SIZE = 22; // 11pt
export const TITLE_SIZE = 32; // 16pt
export const SMALL_SIZE = 20; // 10pt

/** Right tab stop for two-column letterhead rows (prevents narrow-table vertical text). */
const LETTERHEAD_TAB_RIGHT = 9026;

export function run(
  text: string,
  opts?: { bold?: boolean; size?: number; underline?: boolean; italics?: boolean }
): TextRun {
  return new TextRun({
    text: text || ' ',
    font: SERIF,
    size: opts?.size ?? BODY_SIZE,
    bold: opts?.bold,
    italics: opts?.italics,
    underline: opts?.underline ? {} : undefined,
  });
}

export function bodyParagraph(
  text: string,
  opts?: { bold?: boolean; spacingAfter?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] }
): Paragraph {
  return new Paragraph({
    alignment: opts?.alignment,
    spacing: { after: opts?.spacingAfter ?? 120 },
    children: [run(text, { bold: opts?.bold })],
  });
}

export function bodyParagraphs(text: string): Paragraph[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: Paragraph[] = [];
  for (const line of lines) {
    if (!line.trim()) out.push(new Paragraph({ spacing: { after: 80 } }));
    else out.push(bodyParagraph(line));
  }
  return out.length ? out : [new Paragraph({ spacing: { after: 120 } })];
}

/** Centered letterhead matching the practice Word template. */
export function buildPracticeLetterheadSection(): (Paragraph | Table)[] {
  const h = PRACTICE_LETTERHEAD;
  const items: (Paragraph | Table)[] = [];

  items.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [run(h.doctorName, { bold: true, size: TITLE_SIZE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [run(h.qualifications, { size: SMALL_SIZE, underline: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [run(h.registrationLine, { size: SMALL_SIZE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [run(h.roomsLabel, { bold: true, size: BODY_SIZE })],
    })
  );

  const rowCount = Math.max(h.locationLines.length, h.contactLines.length);
  for (let i = 0; i < rowCount; i++) {
    const left = h.locationLines[i] ?? '';
    const right = h.contactLines[i] ?? '';
    const underlineRight =
      right.toLowerCase().startsWith('e-mail') || right.startsWith('PO BOX');
    items.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: LETTERHEAD_TAB_RIGHT }],
        spacing: { after: 40 },
        children: [
          run(left, { size: SMALL_SIZE, underline: !!left }),
          new TextRun({ text: '\t', font: SERIF, size: SMALL_SIZE }),
          run(right, { size: SMALL_SIZE, underline: underlineRight }),
        ],
      })
    );
  }

  items.push(
    new Paragraph({
      spacing: { before: 120, after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      children: [],
    })
  );

  return items;
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
  };
}

const LABEL_SHADE = 'E7E6E6';
const PATIENT_COL_LABEL = 3200;
const PATIENT_COL_VALUE = 5800;

function labelCell(label: string): TableCell {
  return new TableCell({
    width: { size: PATIENT_COL_LABEL, type: WidthType.DXA },
    shading: { fill: LABEL_SHADE, type: ShadingType.CLEAR },
    borders: tableBorders(),
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [run(label, { bold: true, size: SMALL_SIZE })],
      }),
    ],
  });
}

function valueCell(value: string): TableCell {
  return new TableCell({
    width: { size: PATIENT_COL_VALUE, type: WidthType.DXA },
    borders: tableBorders(),
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [run(value || ' ', { size: SMALL_SIZE })],
      }),
    ],
  });
}

function tableBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  };
}

/** Patient details table below letterhead (Rooms Consult template). */
export function buildPatientDetailsTable(patient?: PatientForDocuments | null): Table {
  const name = (patient?.name ?? '').trim() || ' ';
  const folder = (patient?.folderNumber ?? '').trim() || ' ';
  const age = patient?.dob ? formatAgeFromIsoDob(patient.dob) : ' ';
  const ageDisplay = age === '—' ? ' ' : age;
  const contact = (patient?.contactNumber ?? '').trim() || ' ';
  const refDoc = (patient?.referringDoctor ?? '').trim() || ' ';
  const refContact = ' ';

  const rows = [
    ['Name:', name],
    ['Folder number:', folder],
    ['Age:', ageDisplay],
    ['Contact number:', contact],
    ['Referring Doctor:', refDoc],
    ['Ref Dr Contact:', refContact],
  ];

  return new Table({
    width: { size: PATIENT_COL_LABEL + PATIENT_COL_VALUE, type: WidthType.DXA },
    columnWidths: [PATIENT_COL_LABEL, PATIENT_COL_VALUE],
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [labelCell(label), valueCell(value)],
        })
    ),
  });
}
