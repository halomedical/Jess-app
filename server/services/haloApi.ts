/**
 * Halo Functions API client.
 * Centralizes calls to generate_note and get_templates with error handling.
 */

import { config } from '../config';
import { generateClinicalNoteFromTranscript } from './gemini';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

const BASE = config.haloApiBaseUrl;

export interface NoteField {
  label: string;
  body: string;
}

export interface HaloNote {
  noteId: string;
  title: string;
  content: string;
  template_id: string;
  lastSavedAt?: string;
  dirty?: boolean;
  /** Structured fields from generate_note (for preview before DOCX) */
  fields?: NoteField[];
}

const META_KEYS = new Set(['noteId', 'id', 'title', 'name', 'template_id', 'templateId', 'lastSavedAt', 'sections', 'fields', 'notes', 'data']);

/** Extract structured fields from raw generate_note response (object with named sections). */
function extractFieldsFromNoteData(data: unknown): NoteField[] | null {
  if (data == null || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Shape: { "sections": [ { "name": "X", "content": "Y" } ] }
  if (Array.isArray(obj.sections)) {
    const fields: NoteField[] = [];
    for (const s of obj.sections as Array<Record<string, unknown>>) {
      const label = (s.name ?? s.title ?? s.label) as string;
      const body = (s.content ?? s.body ?? s.value ?? s.text ?? '') as string;
      if (label && typeof label === 'string') fields.push({ label, body: String(body ?? '') });
    }
    if (fields.length > 0) return fields;
  }

  // Shape: { "fields": [ { "label": "X", "value": "Y" } ] } or body
  if (Array.isArray(obj.fields)) {
    const fields: NoteField[] = [];
    for (const f of obj.fields as Array<Record<string, unknown>>) {
      const label = (f.label ?? f.name ?? f.title) as string;
      const body = (f.value ?? f.body ?? f.content ?? f.text ?? '') as string;
      if (label && typeof label === 'string') fields.push({ label, body: String(body ?? '') });
    }
    if (fields.length > 0) return fields;
  }

  // Shape: { "Subjective": "...", "Objective": "...", "Plan": "..." } — object with string values
  const entries = Object.entries(obj).filter(
    ([k]) => !META_KEYS.has(k) && !k.startsWith('_')
  );
  const allStrings = entries.length > 0 && entries.every(([, v]) => typeof v === 'string');
  if (allStrings && entries.length > 0) {
    return entries.map(([label, body]) => ({ label, body: (body as string) || '' }));
  }

  return null;
}

function fieldsToContent(fields: NoteField[]): string {
  return fields.map(f => (f.label ? `${f.label}:\n${f.body || ''}` : f.body)).filter(Boolean).join('\n\n');
}

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];

function stripMarkdownInline(text: string): string {
  // Remove common markdown tokens while keeping readable text.
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold markers
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1') // links
    .replace(/^\s*[-*]\s+/g, '• ') // bullets
    .trimEnd();
}

function stripMarkdownHeadingPrefix(line: string): { level: HeadingLevelValue | null; text: string } {
  const trimmed = line.trim();
  if (trimmed.startsWith('### ')) return { level: HeadingLevel.HEADING_3, text: trimmed.slice(4).trim() };
  if (trimmed.startsWith('## ')) return { level: HeadingLevel.HEADING_2, text: trimmed.slice(3).trim() };
  if (trimmed.startsWith('# ')) return { level: HeadingLevel.HEADING_1, text: trimmed.slice(2).trim() };
  return { level: null, text: line };
}

async function createLocalDocxFromText(text: string, title?: string): Promise<Buffer> {
  const cleaned = (text ?? '').toString();
  const parts = cleaned
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, '  '))
    .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''));

  const paragraphs: Paragraph[] = [];

  if (title?.trim()) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: title.trim() })],
      })
    );
  }

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line.trim()) continue;

    const { level, text: headingText } = stripMarkdownHeadingPrefix(line);
    const out = stripMarkdownInline(level ? headingText : line);
    paragraphs.push(
      new Paragraph({
        heading: level ?? undefined,
        children: [new TextRun({ text: out })],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: paragraphs.length ? paragraphs : [new Paragraph('')],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/** Normalize upstream response to array of HaloNote. Handles various shapes from Halo webhook. */
function normalizeNotesResponse(data: unknown, templateId: string): HaloNote[] {
  const now = new Date().toISOString();
  const oneNote = (content: string, title = 'Note 1', fields?: NoteField[]): HaloNote => ({
    noteId: `note-0-${Date.now()}`,
    title,
    content,
    template_id: templateId,
    lastSavedAt: now,
    dirty: false,
    ...(fields && fields.length > 0 ? { fields } : {}),
  });

  if (data == null) return [];

  if (typeof data === 'string' && data.trim()) {
    return [oneNote(data.trim())];
  }

  if (Array.isArray(data)) {
    return data.map((item: any, i: number) => {
      const fields = extractFieldsFromNoteData(item);
      const content = typeof item.content === 'string' ? item.content : (item.text ?? item.note ?? item.body ?? '');
      const finalContent = content || (fields ? fieldsToContent(fields) : String(item));
      return {
        noteId: item.noteId ?? item.id ?? `note-${i}-${Date.now()}`,
        title: item.title ?? item.name ?? `Note ${i + 1}`,
        content: finalContent,
        template_id: item.template_id ?? item.templateId ?? templateId,
        lastSavedAt: item.lastSavedAt ?? now,
        dirty: false,
        ...(fields && fields.length > 0 ? { fields } : {}),
      };
    }).filter(n => n.content.length > 0);
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj !== 'object') return [];

  if (obj.notes && Array.isArray(obj.notes)) {
    return normalizeNotesResponse(obj.notes, templateId);
  }
  if (obj.data != null) {
    const out = normalizeNotesResponse(obj.data, templateId);
    if (out.length > 0) return out;
  }

  // Try structured fields from the root object (e.g. { Subjective: "...", Objective: "..." })
  const fields = extractFieldsFromNoteData(obj);
  if (fields && fields.length > 0) {
    const content = fieldsToContent(fields);
    const title = (obj.title as string) ?? (obj.name as string) ?? 'Note 1';
    return [oneNote(content, title, fields)];
  }

  const content = obj.content ?? obj.text ?? obj.note ?? obj.body ?? obj.result;
  if (typeof content === 'string' && content.trim()) {
    return [oneNote(content.trim(), (obj.title as string) ?? (obj.name as string) ?? 'Note 1')];
  }

  return [];
}

/**
 * Fetch templates for a user from Halo (Firebase RTDB).
 */
export async function getTemplates(userId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/get_templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!res.ok) {
    if (res.status === 400) throw new Error('Invalid request to Halo templates.');
    if (res.status === 502) throw new Error('Halo templates service unavailable. Please try again.');
    throw new Error(`Halo templates error: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

export interface GenerateNoteParams {
  user_id: string;
  template_id: string;
  text: string;
  return_type: 'note' | 'docx';
}

/**
 * Generate note (preview) or DOCX. For return_type 'note' returns normalized notes array.
 * For return_type 'docx' returns the raw buffer.
 */
export async function generateNote(params: GenerateNoteParams): Promise<HaloNote[] | Buffer> {
  const { return_type } = params;

  async function noteFallback(reason: string): Promise<HaloNote[]> {
    console.warn(`[Halo] generate_note ${reason}; using Gemini clinical note fallback.`);
    let content: string;
    try {
      content = await generateClinicalNoteFromTranscript(params.text, params.template_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Gemini fallback requires Generative Language API enabled on the GCP project
      // associated with GEMINI_API_KEY. Surface an actionable message.
      if (msg.includes('SERVICE_DISABLED') || msg.includes('403') || msg.toLowerCase().includes('generativelanguage')) {
        throw new Error(
          [
            'Gemini fallback failed because the Generative Language API is disabled.',
            'To fix: enable the API for the Google Cloud project used by your GEMINI_API_KEY, then retry in a few minutes.',
            'Activation link (from your error): https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=999125654566',
          ].join(' ')
        );
      }
      throw err;
    }
    return normalizeNotesResponse(content, params.template_id);
  }

  async function docxFallback(reason: string): Promise<Buffer> {
    console.warn(`[Halo] generate_note docx ${reason}; using local DOCX from structured fallback text.`);
    const title = `Clinical Note (${params.template_id})`;
    try {
      const content = await generateClinicalNoteFromTranscript(params.text, params.template_id);
      return await createLocalDocxFromText(content, title);
    } catch {
      console.warn('[Halo] docx fallback: Gemini failed; using raw transcript in DOCX.');
      return await createLocalDocxFromText(params.text, title);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/generate_note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: params.user_id,
        template_id: params.template_id,
        text: params.text,
        return_type,
      }),
    });
  } catch (e) {
    if (return_type === 'note') {
      return noteFallback(`network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (return_type === 'docx') {
      return docxFallback(`network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    throw e instanceof Error ? e : new Error(String(e));
  }

  if (!res.ok) {
    // Halo may return 400/404 when template_id is unknown on the Python side or validation fails.
    // Fall back to Gemini (and local DOCX) so Echo Report, Report, and Rooms Consult all stay usable.
    const errBody = await res.text().catch(() => '');
    if (errBody) {
      const snip = errBody.length > 300 ? `${errBody.slice(0, 300)}…` : errBody;
      console.warn(`[Halo] generate_note HTTP ${res.status}: ${snip}`);
    }
    if (return_type === 'note') {
      return noteFallback(`HTTP ${res.status}`);
    }
    if (return_type === 'docx') {
      return docxFallback(`HTTP ${res.status}`);
    }
    throw new Error(`Halo generate_note error: ${res.status}`);
  }

  if (return_type === 'docx') {
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer;
  }

  let data: unknown;
  try {
    data = (await res.json()) as unknown;
  } catch {
    return noteFallback('invalid JSON from Halo');
  }
  const notes = normalizeNotesResponse(data, params.template_id);
  if (notes.length === 0) {
    return noteFallback('empty or unparseable Halo response');
  }
  return notes;
}
