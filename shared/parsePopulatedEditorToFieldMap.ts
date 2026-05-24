import { getEditorTemplateString } from './clinicalNoteEditorTemplates';
import { getLocalClinicalNoteTemplate } from './clinicalNoteTemplates';
import { parseFieldBlocks, parseMarkdownLabelFields, mergeFieldMaps, sanitizeTemplateFieldValue } from './clinicalNoteFieldParse';
import { ECHO_TEMPLATE_ID, REPORT_TEMPLATE_ID, ROOMS_CONSULT_TEMPLATE_ID } from './haloTemplates';
import { ROOMS_CONSULT_FIELD_KEYS } from './parseRoomsConsultNoteContent';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type PlaceholderSpec = { key: string; inlineLabel: string | null; blockAnchor: string | null };

function listPlaceholdersFromEditorTemplate(templateId: string): PlaceholderSpec[] {
  const template = getEditorTemplateString(templateId);
  const specs: PlaceholderSpec[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const key = m[1];
    const before = template.slice(0, m.index);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = template.indexOf('\n', m.index);
    const line = template
      .slice(lineStart, lineEnd === -1 ? m.index + m[0].length : lineEnd)
      .trim();
    const inlineOnLine = line.match(/^(.+?):\s*\{\{\s*\w+\s*\}\}\s*$/);
    const inlineLabel = inlineOnLine ? inlineOnLine[1].trim() : null;
    const linesBefore = before
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const blockAnchor =
      inlineLabel == null && linesBefore.length > 0 ? linesBefore[linesBefore.length - 1] : null;
    specs.push({ key, inlineLabel, blockAnchor });
  }
  return specs;
}

function extractInlineValue(text: string, label: string): string {
  const escaped = escapeRegExp(label);
  const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n]+)`, 'im');
  const m = text.match(re);
  return m?.[1]?.trim() ?? '';
}

function extractBlockValue(text: string, anchor: string, stopAnchors: string[]): string {
  const a = escapeRegExp(anchor);
  const stops = stopAnchors.filter(Boolean).map(escapeRegExp);
  const stopPart = stops.length > 0 ? `(?=\\n(?:${stops.join('|')})\\b)` : '$';
  const re = new RegExp(`(?:^|\\n)\\s*${a}\\s*\\n+([\\s\\S]*?)${stopPart}`, 'im');
  const m = text.match(re);
  return m?.[1]?.trim() ?? '';
}

/**
 * Recover template field values from populated editor plain text (after Gemini + {{ }} fill).
 */
export function parsePopulatedEditorToFieldMap(
  templateId: string,
  plainText: string,
  keys: readonly string[]
): Record<string, string> {
  const normalized = (plainText ?? '').replace(/\r\n/g, '\n').trim();
  const specs = listPlaceholdersFromEditorTemplate(templateId);
  const allowed = new Set(keys);
  const fromLayout: Record<string, string> = {};

  const blockAnchors = specs
    .filter((s) => allowed.has(s.key) && s.blockAnchor)
    .map((s) => s.blockAnchor!);

  for (const spec of specs) {
    if (!allowed.has(spec.key)) continue;
    if (spec.inlineLabel) {
      const v = extractInlineValue(normalized, spec.inlineLabel);
      if (v) fromLayout[spec.key] = sanitizeTemplateFieldValue(v);
      continue;
    }
    if (spec.blockAnchor) {
      const idx = blockAnchors.indexOf(spec.blockAnchor);
      const stops = blockAnchors.slice(idx + 1);
      const v = extractBlockValue(normalized, spec.blockAnchor, stops);
      if (v) fromLayout[spec.key] = sanitizeTemplateFieldValue(v);
    }
  }

  const fromBlocks = parseFieldBlocks(normalized, keys);
  const fromLabels = parseMarkdownLabelFields(normalized, keys);
  return mergeFieldMaps(fromLayout, fromLabels, fromBlocks);
}

export function fieldKeysForTemplate(templateId: string): readonly string[] {
  const id = (templateId ?? '').trim().toLowerCase();
  if (id === ROOMS_CONSULT_TEMPLATE_ID) return ROOMS_CONSULT_FIELD_KEYS;
  if (id === REPORT_TEMPLATE_ID) {
    return [
      'date',
      'addressee',
      'addressee_location',
      'addressee_email',
      'patient_name',
      'id_no',
      'file_no',
      'background',
      'clinical_examination',
      'special_investigations',
      'assessment_plan',
    ] as const;
  }
  if (id === ECHO_TEMPLATE_ID) {
    return getLocalClinicalNoteTemplate(ECHO_TEMPLATE_ID)?.fields.map((f) => f.key) ?? [];
  }
  const local = getLocalClinicalNoteTemplate(templateId);
  return local?.fields.map((f) => f.key) ?? [];
}
