export type PatientStickerFields = {
  name?: string;
  surname?: string;
  dob?: string; // YYYY-MM-DD
  sex?: 'M' | 'F';
  folderNumber?: string;
  contactNumber?: string;
  referringDoctor?: string;
};

function normSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeOcrNoise(raw: string): string {
  // Normalize common OCR oddities while keeping content intact.
  return (raw ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function toIsoDob(raw: string): string | null {
  const t = raw.trim();
  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m1 = t.match(iso);
  if (m1) return t;

  // Common sticker formats: DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
  const m2 = t.match(dmy);
  if (m2) {
    const [, dd, mm, yyyy] = m2;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function extractDob(raw: string): string | null {
  const candidates = [
    raw.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1],
    raw.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/)?.[1],
    raw.match(/\b(?:dob|d\.o\.b|date\s*of\s*birth|birth\s*date)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1],
    raw.match(/\b(?:dob|d\.o\.b|date\s*of\s*birth|birth\s*date)\s*[:=]?\s*(\d{2}[/-]\d{2}[/-]\d{4})\b/i)?.[1],
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const iso = toIsoDob(c);
    if (iso) return iso;
  }
  return null;
}

function extractSex(raw: string): 'M' | 'F' | null {
  const s = raw.toLowerCase();
  // Prefer explicit "sex:" / "gender:".
  const m1 = s.match(/\b(?:sex|gender)\s*[:=]\s*(m|male|f|female)\b/);
  if (m1) return m1[1].startsWith('m') ? 'M' : 'F';
  // Fallback: standalone M/F token.
  const m2 = s.match(/\b(m|f)\b/);
  if (m2) return m2[1] === 'm' ? 'M' : 'F';
  return null;
}

function extractFolderNumber(raw: string): string | null {
  const m =
    raw.match(/\b(?:mrn|folder|file|patient\s*(?:no|nr|id)|hospital\s*no)\s*[:=]?\s*([A-Za-z0-9-/]{3,})\b/i) ??
    raw.match(/\b(?:mrn)\s*#?\s*([A-Za-z0-9-/]{3,})\b/i);
  return m?.[1]?.trim() ?? null;
}

function extractPhone(raw: string): string | null {
  // Very light heuristic; keep original spacing if possible.
  const m =
    raw.match(/\b(0\d{2}\s?\d{3}\s?\d{4})\b/) ??
    raw.match(/\b(\+27\s?\d{2}\s?\d{3}\s?\d{4})\b/);
  return m?.[1]?.trim() ?? null;
}

function extractReferring(raw: string): string | null {
  const m = raw.match(/\b(?:ref(?:erring)?\s*(?:dr|doc|doctor)?|doctor)\s*[:=]\s*([^\n\r,;]+)\b/i);
  return m?.[1] ? normSpaces(m[1]) : null;
}

function extractNameParts(raw: string): { name?: string; surname?: string } {
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (!line) return {};
  // If the first line contains a DOB/sex token, it's likely not a pure name.
  if (/\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4}/.test(line)) return {};
  if (/\b(?:sex|gender|dob|d\.o\.b|mrn|folder|file|patient\s*(?:no|nr|id))\b/i.test(line)) return {};
  // Remove labels like "Name:".
  const cleaned = normSpaces(line.replace(/\bname\s*[:=]\s*/i, '').trim());
  if (cleaned.length < 2) return {};

  // Formats:
  // - "Surname, Name"
  const comma = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (comma.length === 2) {
    const surname = comma[0] || undefined;
    const given = comma[1] || undefined;
    const full = normSpaces([given, surname].filter(Boolean).join(' '));
    return { name: full || undefined, surname };
  }

  // - "First Middle Last" → surname = last token, name = full
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1];
    return { name: cleaned, surname };
  }

  return { name: cleaned };
}

/**
 * Parse a patient sticker payload (barcode/QR text, or keyboard-wedge scan) into patient fields.
 * Designed to be resilient to unknown formats; returns only what it can confidently extract.
 */
export function parsePatientSticker(raw: string): PatientStickerFields {
  const text = normalizeOcrNoise(raw);
  if (!text) return {};

  const { name, surname } = extractNameParts(text);
  const dob = extractDob(text) ?? undefined;
  const sex = extractSex(text) ?? undefined;
  const folderNumber = extractFolderNumber(text) ?? undefined;
  const contactNumber = extractPhone(text) ?? undefined;
  const referringDoctor = extractReferring(text) ?? undefined;

  return { name, surname, dob, sex, folderNumber, contactNumber, referringDoctor };
}

