/**
 * Remove a leading Rooms-style patient grid from model output when the app injects
 * the table from the chart below RICH_DOCTOR_LETTERHEAD.
 */
export function stripLeadingRoomsPatientDemographics(content: string): string {
  let t = (content ?? '').replace(/\r\n/g, '\n').trim();
  if (!t) return t;

  const label =
    /^(?:Name|Folder number|Age|Contact number|Referring Doctor|Ref Dr Contact)\s*:/im;

  const lines = t.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (label.test(line)) {
      i++;
      continue;
    }
    break;
  }

  if (i === 0) return t;
  return lines.slice(i).join('\n').replace(/^\n+/, '').trim();
}
