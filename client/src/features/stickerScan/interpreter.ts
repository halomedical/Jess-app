export type InterpretedPatient = {
  firstName?: string;
  surname?: string;
  dob?: string; // YYYY-MM-DD
  sex?: 'M' | 'F';
  folderNumber?: string;
  contactNumber?: string;
  /** Optional: extracted but not persisted yet */
  address?: string;
};

export type InterpretationDecision =
  | { accepted: true; reason: string[] }
  | { accepted: false; reason: string[] };

export type InterpretationDebug = {
  normalizedSample: string;
  lines: string[];
  nameLines: string[];
  remainingLines: string[];
  detected: {
    firstName?: string;
    surname?: string;
    dob?: string;
    sex?: string;
    folderNumber?: string;
    contactNumber?: string;
    address?: string;
  };
  decision: InterpretationDecision;
};

function normSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeOcrText(raw: string): string {
  // Normalize OCR output while preserving reading order.
  return (raw ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[•·]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => normSpaces(l))
    .filter(Boolean);
}

function looksLikeDateLine(line: string): boolean {
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(line) ||
    /\b\d{2}[/-]\d{2}[/-]\d{4}\b/.test(line) ||
    /\b\d{2}\s+\d{2}\s+\d{4}\b/.test(line)
  );
}

function looksLikePhoneLine(line: string): boolean {
  return /\b0\d{2}\s?\d{3}\s?\d{4}\b/.test(line) || /\b\+27\s?\d{2}\s?\d{3}\s?\d{4}\b/.test(line);
}

function looksLikeIdLine(line: string): boolean {
  // Broad: alphanumeric token length>=5 or long numeric token length>=6
  const t = line.replace(/\s/g, '');
  if (/\b\d{6,}\b/.test(t)) return true;
  if (/\b[A-Za-z0-9-]{5,}\b/.test(t) && /\d/.test(t)) return true;
  return false;
}

function looksLikeSexLine(line: string): boolean {
  return /\b(m|f|male|female)\b/i.test(line);
}

function isNameLikeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Ignore if it looks like any known non-name signal
  if (looksLikeDateLine(t) || looksLikePhoneLine(t) || looksLikeIdLine(t) || looksLikeSexLine(t)) return false;
  // Ignore if mostly numeric/symbolic
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits > 0) return false;
  if (letters < 2) return false;
  // Allow spaces and hyphen/apostrophe within names
  return /^[A-Za-z][A-Za-z\s'\-]+$/.test(t);
}

function extractNameBlock(lines: string[]): { firstName?: string; surname?: string; nameLines: string[]; remainingLines: string[] } {
  const nameLines: string[] = [];
  const remainingLines: string[] = [];

  let i = 0;
  // Scan top→bottom; take first 1–2 consecutive name-like lines.
  while (i < lines.length) {
    const line = lines[i];
    if (isNameLikeLine(line)) {
      nameLines.push(line);
      i += 1;
      // allow only the first consecutive block (max 2 lines)
      while (i < lines.length && nameLines.length < 2 && isNameLikeLine(lines[i])) {
        nameLines.push(lines[i]);
        i += 1;
      }
      break;
    }
    i += 1;
  }

  // Remaining lines are everything except the chosen name lines occurrence.
  // (Keep reading order; remove first occurrences only.)
  const toRemove = new Map<string, number>();
  for (const nl of nameLines) toRemove.set(nl, (toRemove.get(nl) ?? 0) + 1);
  for (const l of lines) {
    const n = toRemove.get(l) ?? 0;
    if (n > 0) toRemove.set(l, n - 1);
    else remainingLines.push(l);
  }

  const firstName = nameLines[0] ? normSpaces(nameLines[0]) : undefined;
  const surname = nameLines[1] ? normSpaces(nameLines[1]) : undefined;
  return { firstName, surname, nameLines, remainingLines };
}

function toIsoDob(raw: string): string | null {
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m1 = t.match(iso);
  if (m1) return t;
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
  const m2 = t.match(dmy);
  if (m2) {
    const [, dd, mm, yyyy] = m2;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Space-separated: 12 03 1982
  const dmySpace = /^(\d{2})\s+(\d{2})\s+(\d{4})$/;
  const m3 = t.match(dmySpace);
  if (m3) {
    const [, dd, mm, yyyy] = m3;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function extractDobFromText(text: string): string | undefined {
  const candidates = [
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1],
    text.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/)?.[1],
    text.match(/\b(\d{2}\s+\d{2}\s+\d{4})\b/)?.[1],
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const iso = toIsoDob(c);
    if (iso) return iso;
  }
  return undefined;
}

function extractSexFromText(text: string): 'M' | 'F' | undefined {
  const s = text.toLowerCase();
  const m = s.match(/\b(m|male|f|female)\b/);
  if (!m) return undefined;
  return m[1].startsWith('m') ? 'M' : 'F';
}

function extractPhoneFromText(text: string): string | undefined {
  const m = text.match(/\b(0\d{2}\s?\d{3}\s?\d{4})\b/) ?? text.match(/\b(\+27\s?\d{2}\s?\d{3}\s?\d{4})\b/);
  return m?.[1] ? normSpaces(m[1]) : undefined;
}

function extractFolderNumberFromText(text: string): string | undefined {
  // Prefer alphanumeric-with-digits token; fallback to long numeric.
  const token = text.match(/\b([A-Za-z0-9-]{5,})\b/g) ?? [];
  const best = token.find((t) => /\d/.test(t) && /[A-Za-z]/.test(t)) ?? token.find((t) => /^\d{6,}$/.test(t));
  return best?.trim() || undefined;
}

function extractAddressFromLines(lines: string[]): string | undefined {
  // Very loose: take leftover lines that are neither DOB/phone/sex/id and are not name-like.
  const kept = lines.filter((l) => {
    if (looksLikeDateLine(l) || looksLikePhoneLine(l) || looksLikeSexLine(l) || looksLikeIdLine(l)) return false;
    if (isNameLikeLine(l)) return false;
    // Avoid super short noise
    return l.length >= 6;
  });
  const addr = kept.join(', ').trim();
  return addr ? addr : undefined;
}

function validateParsed(p: InterpretedPatient): InterpretationDecision {
  const reasons: string[] = [];
  const hasName = !!(p.firstName && p.firstName.trim().length >= 2);
  if (!hasName) reasons.push('missing_firstName');
  const hasDobOrId = !!(p.dob || p.folderNumber);
  if (!hasDobOrId) reasons.push('missing_dob_or_id');
  if (hasName && hasDobOrId) return { accepted: true, reason: ['accepted'] };
  return { accepted: false, reason: reasons.length ? reasons : ['rejected'] };
}

export function interpretStickerText(raw: string): { patient: InterpretedPatient; debug: InterpretationDebug } {
  const normalized = normalizeOcrText(raw);
  const lines = splitLines(normalized);

  const { firstName, surname, nameLines, remainingLines } = extractNameBlock(lines);
  const remainingText = remainingLines.join('\n');

  const dob = extractDobFromText(remainingText);
  const sex = extractSexFromText(remainingText);
  const contactNumber = extractPhoneFromText(remainingText);
  const folderNumber = extractFolderNumberFromText(remainingText);
  const address = extractAddressFromLines(remainingLines);

  const patient: InterpretedPatient = {
    firstName,
    surname,
    dob,
    sex,
    folderNumber,
    contactNumber,
    address,
  };

  const decision = validateParsed(patient);

  const debug: InterpretationDebug = {
    normalizedSample: normalized.slice(0, 400),
    lines,
    nameLines,
    remainingLines,
    detected: {
      firstName,
      surname,
      dob,
      sex,
      folderNumber,
      contactNumber,
      address,
    },
    decision,
  };

  return { patient, debug };
}

