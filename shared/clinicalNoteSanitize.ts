/**
 * Remove a second leading patient-demographics block when the model outputs
 * two similar headers before the first Markdown ## section (common when chart
 * identifiers are in the prompt and the template also asks for a patient header).
 */
export function stripDuplicateLeadingPatientDemographics(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return content;

  const m = /\n##\s/.exec(normalized);
  if (!m || m.index === undefined) return content;

  const preamble = normalized.slice(0, m.index).trimEnd();
  const rest = normalized.slice(m.index + 1);

  const parts = preamble.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return content;

  const demogScore = (p: string): number => {
    const low = p.toLowerCase();
    let n = 0;
    if (/(^|\n)\s*(patient|patient name)\b/m.test(low)) n++;
    if (/\bdob\b|date of birth/.test(low)) n++;
    if (/\bage\b/.test(low)) n++;
    if (/\bsex\b/.test(low)) n++;
    if (/visit (type|date)/.test(low)) n++;
    if (/contact|cellphone|cell phone|phone/.test(low)) n++;
    return n;
  };

  const out: string[] = [];
  let keptDemog = false;
  for (const p of parts) {
    if (demogScore(p) >= 3) {
      if (!keptDemog) {
        out.push(p);
        keptDemog = true;
      }
    } else {
      out.push(p);
    }
  }

  if (out.length === parts.length) return content;
  return `${out.join('\n\n')}\n${rest}`;
}
