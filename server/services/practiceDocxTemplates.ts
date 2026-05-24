import fs from 'fs';
import path from 'path';
import {
  PRACTICE_TEMPLATES_DIR_NAME,
  TEMPLATE_ID_MATCHERS,
  normalizePracticeTemplateId,
} from '../../shared/practiceDocxTemplates';

/** Resolve absolute path to repo Templates/ directory. */
export function resolvePracticeTemplatesDirectory(): string {
  const candidates = [
    path.join(process.cwd(), PRACTICE_TEMPLATES_DIR_NAME),
    path.join(process.cwd(), '..', PRACTICE_TEMPLATES_DIR_NAME),
    path.join(__dirname, '..', '..', PRACTICE_TEMPLATES_DIR_NAME),
    path.join(__dirname, '..', '..', '..', PRACTICE_TEMPLATES_DIR_NAME),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return path.resolve(dir);
      }
    } catch {
      /* ignore */
    }
  }
  return path.resolve(process.cwd(), PRACTICE_TEMPLATES_DIR_NAME);
}

/**
 * Build absolute path to the .docx template for a workspace template_id.
 * Scans Templates/ dynamically (no hardcoded filename).
 */
export function buildPracticeDocxTemplatePath(
  templateId: string,
  templatesRoot?: string
): string | null {
  const root = templatesRoot ?? resolvePracticeTemplatesDirectory();
  if (!fs.existsSync(root)) return null;

  const files = fs
    .readdirSync(root)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));

  if (files.length === 0) return null;

  const id = normalizePracticeTemplateId(templateId);
  const matchers = TEMPLATE_ID_MATCHERS[id] ?? [id.replace(/_/g, ' ')];

  for (const needle of matchers) {
    const n = needle.toLowerCase();
    const hit = files.find((f) => f.toLowerCase().includes(n));
    if (hit) return path.join(root, hit);
  }

  return null;
}

export function hasPracticeDocxTemplateFile(templateId: string): boolean {
  return buildPracticeDocxTemplatePath(templateId) != null;
}

export function listPracticeDocxTemplateFiles(
  templatesRoot?: string
): { templateId: string; fileName: string; absolutePath: string }[] {
  const root = templatesRoot ?? resolvePracticeTemplatesDirectory();
  if (!fs.existsSync(root)) return [];

  const files = fs
    .readdirSync(root)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));

  const knownIds = Object.keys(TEMPLATE_ID_MATCHERS);
  const out: { templateId: string; fileName: string; absolutePath: string }[] = [];

  for (const id of knownIds) {
    const p = buildPracticeDocxTemplatePath(id, root);
    if (p) {
      out.push({ templateId: id, fileName: path.basename(p), absolutePath: p });
    }
  }

  for (const fileName of files) {
    if (!out.some((o) => o.fileName === fileName)) {
      out.push({
        templateId: fileName.replace(/\.docx$/i, ''),
        fileName,
        absolutePath: path.join(root, fileName),
      });
    }
  }

  return out;
}
