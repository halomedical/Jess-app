import fs from 'fs';
import mammoth from 'mammoth';
import { RICH_LETTERHEAD_MARKER } from '../../shared/richDoctorLetterhead';
import { buildPracticeDocxTemplatePath } from './practiceDocxTemplates';

const letterheadCache = new Map<string, string>();

/** Extract letterhead HTML from Word template (content before first {{ field }}). */
export async function extractLetterheadHtmlFromDocx(templatePath: string): Promise<string> {
  const buffer = fs.readFileSync(templatePath);
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const cut = html.search(/\{\{/);
  const head = (cut > 0 ? html.slice(0, cut) : html).trim();

  const cleaned = head
    .replace(/<a id="[^"]*"><\/a>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .trim();

  return `<div id="rich-doctor-letterhead" class="rich-letterhead docx-letterhead" ${RICH_LETTERHEAD_MARKER} style="max-width:100%;margin:0;padding:0;">${cleaned}</div>`;
}

export async function getPracticeLetterheadHtmlForTemplate(
  templateId: string
): Promise<string | null> {
  const templatePath = buildPracticeDocxTemplatePath(templateId);
  if (!templatePath) return null;

  const cached = letterheadCache.get(templatePath);
  if (cached) return cached;

  try {
    const html = await extractLetterheadHtmlFromDocx(templatePath);
    letterheadCache.set(templatePath, html);
    return html;
  } catch (err) {
    console.warn('[practiceLetterheadHtml] extract failed:', templatePath, err);
    return null;
  }
}
