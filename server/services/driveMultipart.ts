/**
 * RFC 2387 multipart/related body for Google Drive multipart uploads.
 * Must end with CRLF before the closing boundary (matches Drive route upload).
 */
export function buildDriveMultipartBody(
  boundary: string,
  metadata: { name: string; parents: string[]; mimeType: string; appProperties?: Record<string, string> },
  mediaBytes: Buffer,
  /** When converting upload (e.g. DOCX → Google Doc), media type differs from metadata mimeType. */
  mediaMimeType?: string
): Buffer {
  const metaPart = JSON.stringify(metadata);
  const partMime = mediaMimeType ?? metadata.mimeType;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
      `--${boundary}\r\nContent-Type: ${partMime}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([head, mediaBytes, tail]);
}
