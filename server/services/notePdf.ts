import PDFDocument from 'pdfkit';

const MAX_INPUT_CHARS = 1_500_000;

function looksLikeDocumentTitle(firstSection: string): boolean {
  const t = firstSection.trim();
  if (t.length === 0 || t.length > 140) return false;
  if (/^Patient:/i.test(t)) return false;
  if (t.includes('DOB:') && t.includes('Age:')) return false;
  return true;
}

/**
 * Renders clinical preview PDF: optional centered title, then body with readable typography.
 */
export function renderClinicalTextToPdfBuffer(text: string): Promise<Buffer> {
  const raw = (text ?? '').length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text ?? '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const safe = raw.trim() || '(Empty)';
    const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const firstBreak = safe.indexOf('\n\n');
    const firstSection = firstBreak === -1 ? safe : safe.slice(0, firstBreak);
    const remainder = firstBreak === -1 ? '' : safe.slice(firstBreak + 2).trim();

    if (remainder && looksLikeDocumentTitle(firstSection)) {
      doc.font('Helvetica-Bold').fontSize(14);
      doc.text(firstSection.trim(), { align: 'center', width: textWidth });
      doc.moveDown(0.85);
      doc.fontSize(10).font('Helvetica');
      doc.text(remainder, {
        width: textWidth,
        align: 'left',
        lineGap: 3,
      });
    } else {
      doc.font('Helvetica').fontSize(10);
      doc.text(safe, {
        width: textWidth,
        align: 'left',
        lineGap: 3,
      });
    }
    doc.end();
  });
}
