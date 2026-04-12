import PDFDocument from 'pdfkit';

const MAX_INPUT_CHARS = 1_500_000;

/**
 * Renders the same clinical text string used for DOCX/email into a multi-page PDF buffer.
 * Layout is simple typeset text (not identical to Word, but true PDF for inline preview).
 */
export function renderClinicalTextToPdfBuffer(text: string): Promise<Buffer> {
  const body = (text ?? '').length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text ?? '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const safe = body.trim() || '(Empty)';
    const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('Helvetica').fontSize(10);
    doc.text(safe, {
      width: textWidth,
      align: 'left',
      lineGap: 2,
    });
    doc.end();
  });
}
