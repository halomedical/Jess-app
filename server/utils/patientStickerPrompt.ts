export function patientStickerExtractionPrompt(): string {
  return `You extract patient identifiers from a photo of a hospital wristband, ward sticker, ID label, admissions armband, or handwritten clinical note.
Read all visible text. Return ONLY valid JSON (no markdown) with this exact shape:
{"firstName":null,"lastName":null,"dob":null,"cellphoneNumber":null,"hospitalFolderNumber":null}
Rules:
- firstName: patient given/first name. If multiple given names, put them all in firstName.
- lastName: patient surname / family name.
- dob: use YYYY-MM-DD when possible; otherwise null.
- cellphoneNumber: patient cellphone/phone number if visible; otherwise null.
- hospitalFolderNumber: MRN / folder / file / hospital number if visible; otherwise null.
- If the image has no patient text, return all nulls.
- Return JSON only.`;
}

