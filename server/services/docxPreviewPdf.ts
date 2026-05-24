import crypto from 'crypto';
import { config } from '../config';
import { buildDriveMultipartBody } from './driveMultipart';
import { withDriveFileAccessQuery } from './driveFileAccess';
import { getOrCreateHaloPreviewTempFolder } from './drive';

const { driveApi, uploadApi } = config;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Import a DOCX buffer as a temporary Google Doc, export as PDF, then delete the temp doc.
 * Temp files live in __Halo_Preview_Temp (not patient folders).
 */
export async function convertDocxBufferToPdfBuffer(
  accessToken: string,
  docxBuffer: Buffer,
  tempBaseName = 'preview'
): Promise<Buffer> {
  const tempFolderId = await getOrCreateHaloPreviewTempFolder(accessToken);
  const boundary = `halo_preview_${crypto.randomUUID()}`;
  const importBody = buildDriveMultipartBody(
    boundary,
    {
      name: `${tempBaseName}_${Date.now()}`,
      parents: [tempFolderId],
      mimeType: 'application/vnd.google-apps.document',
      appProperties: { haloEphemeralPreview: 'true' },
    },
    docxBuffer,
    DOCX_MIME
  );

  const importRes = await fetch(`${uploadApi}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: importBody,
  });

  if (!importRes.ok) {
    const errText = await importRes.text().catch(() => '');
    throw new Error(
      `Could not prepare Word preview (${importRes.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`
    );
  }

  const importedDoc = (await importRes.json()) as { id: string };

  try {
    const pdfRes = await fetch(
      `${driveApi}${withDriveFileAccessQuery(`/files/${importedDoc.id}/export?mimeType=application/pdf`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!pdfRes.ok) {
      throw new Error(`Could not export preview PDF (${pdfRes.status})`);
    }
    return Buffer.from(await pdfRes.arrayBuffer());
  } finally {
    const delRes = await fetch(`${driveApi}${withDriveFileAccessQuery(`/files/${importedDoc.id}`)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!delRes.ok) {
      console.warn(`[docxPreviewPdf] Failed to delete temp Google Doc ${importedDoc.id} (${delRes.status})`);
    }
  }
}
