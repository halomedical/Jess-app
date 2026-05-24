/** Append shared-drive flags required for files.get / files.list on Workspace shared drives. */
export function withDriveFileAccessQuery(path: string): string {
  if (!path.startsWith('/files')) return path;
  const sep = path.includes('?') ? '&' : '?';
  const parts: string[] = [];
  if (!path.includes('supportsAllDrives')) parts.push('supportsAllDrives=true');
  if (path.startsWith('/files?') && !path.includes('includeItemsFromAllDrives')) {
    parts.push('includeItemsFromAllDrives=true');
  }
  if (parts.length === 0) return path;
  return `${path}${sep}${parts.join('&')}`;
}

/** Google Drive file IDs are opaque alphanumeric strings (typically 25–50 chars). */
export function assertValidDriveFileId(fileId: unknown, label = 'fileId'): asserts fileId is string {
  if (typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]{10,}$/.test(fileId.trim())) {
    throw new Error(`Invalid ${label}: expected a Google Drive file id.`);
  }
}
