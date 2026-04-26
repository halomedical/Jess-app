export function patientStickerExtractionPrompt(): string {
  return `You extract patient identifiers from a photo of a hospital wristband, ward sticker, ID label, admissions armband, or handwritten clinical note.
Read all visible text. Return ONLY valid JSON (no markdown) with this exact shape:
{"firstName":null,"lastName":null,"sex":null,"dob":null,"cellphoneNumber":null,"idNumber":null,"hospitalFolderNumber":null,"ward":null,"medicalAidName":null,"medicalAidPackage":null,"medicalAidMemberNumber":null,"medicalAidPhone":null,"rawNotes":null}
Rules:
- firstName: patient given/first name. If multiple given names, put them all in firstName.
- lastName: patient surname / family name.
- sex: "M", "F", or null if not visible.
- dob: use YYYY-MM-DD when possible; otherwise null.
- cellphoneNumber: patient cellphone/phone number if visible; otherwise null.
- idNumber: national ID, hospital MR#, account number, or similar if visible; otherwise null.
- hospitalFolderNumber: folder / file / episode / hospital number if visible; otherwise null.
- ward: ward name or number if visible; otherwise null.
- medicalAidName: medical scheme / insurer / medical aid name if visible; otherwise null.
- medicalAidPackage: plan, option, network, or package name if visible; otherwise null.
- medicalAidMemberNumber: member, beneficiary, or dependent number if visible; otherwise null.
- medicalAidPhone: scheme or authorisation phone if visible; otherwise null.
- rawNotes: other legible text not captured above (short); otherwise null.
- If the image has no patient text, return all nulls.
- Return JSON only.`;
}

