/** Remove embedded practice letterhead / chart preamble from note text before DOCX build. */
export function stripPracticeLetterheadFromNote(text: string): string {
  let t = (text ?? '').replace(/\r\n/g, '\n').trim();
  t = t.replace(/^--- Patient identifiers[\s\S]*?--- End patient identifiers ---\s*/i, '');
  t = t.replace(/^--- Note content ---\s*/i, '');
  t = t.replace(/^--- Clinical dictation ---\s*/i, '');
  t = t.replace(
    /^DR\s+(?:T?J|JESS)\s+JOHN[\s\S]*?(?:\n{2,}|(?=\n(?:RE:|## |Reason for|Patient:|Folder|Name:)))/i,
    ''
  );
  t = t.replace(/^MB[,.]?Ch\.?B[\s\S]*?CARDIOLOGIST\s*\n+/i, '');
  t = t.replace(/^Mediclinic Panorama[\s\S]*?(?:corbettcardio\.co\.za|Tygervalley)[^\n]*\n+/i, '');
  t = t.replace(/^MP No:[\s\S]*?ROOMS\s*\n+/i, '');
  t = t.replace(/^Practice number:[\s\S]*?(?:\n{2,}|(?=\n(?:Name:|## |RE:)))/im, '');
  t = t.replace(/^Thank you very much\.[\s\S]*$/i, '');
  t = t.replace(/^CONFIDENTIAL\s+NOTICE[\s\S]*$/im, '');
  return t.trim();
}
