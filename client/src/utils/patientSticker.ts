export type PatientStickerFields = {
  name?: string;
  dob?: string; // YYYY-MM-DD
  sex?: 'M' | 'F';
  folderNumber?: string;
  contactNumber?: string;
  referringDoctor?: string;
};

function normSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function toIsoDob(raw: string): string | null {
  const t = raw.trim();
  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m1 = t.match(iso);
  if (m1) return t;

  // Common sticker formats: DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/;
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
    raw.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/)?.[1],
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
    raw.match(/\b(?:mrn|folder|file|patient\s*no|patient\s*nr|hospital\s*no)\s*[:=]?\s*([A-Za-z0-9\-\/]{3,})\b/i) ??
    raw.match(/\b(?:mrn)\s*#?\s*([A-Za-z0-9\-\/]{3,})\b/i);
  return m?.[1]?.trim() ?? null;
}

function extractPhone(raw: string): string | null {
  // Very light heuristic; keep original spacing if possible.
  const m = raw.match(/\b(0\d{2}\s?\d{3}\s?\d{4})\b/);
  return m?.[1]?.trim() ?? null;
}

function extractReferring(raw: string): string | null {
  const m = raw.match(/\b(?:ref(?:erring)?\s*(?:dr|doc|doctor)?|doctor)\s*[:=]\s*([^\n\r,;]+)\b/i);
  return m?.[1] ? normSpaces(m[1]) : null;
}

function extractName(raw: string): string | null {
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (!line) return null;
  // If the first line contains a DOB/sex token, it's likely not a pure name.
  if (/\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(line)) return null;
  if (/\b(?:sex|gender|dob|mrn|folder|file)\b/i.test(line)) return null;
  // Remove labels like "Name:".
  const cleaned = line.replace(/\bname\s*[:=]\s*/i, '').trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * Parse a patient sticker payload (barcode/QR text, or keyboard-wedge scan) into patient fields.
 * Designed to be resilient to unknown formats; returns only what it can confidently extract.
 */
export function parsePatientSticker(raw: string): PatientStickerFields {
  const text = (raw ?? '').trim();
  if (!text) return {};

  const name = extractName(text) ?? undefined;
  const dob = extractDob(text) ?? undefined;
  const sex = extractSex(text) ?? undefined;
  const folderNumber = extractFolderNumber(text) ?? undefined;
  const contactNumber = extractPhone(text) ?? undefined;
  const referringDoctor = extractReferring(text) ?? undefined;

  return { name, dob, sex, folderNumber, contactNumber, referringDoctor };
}

