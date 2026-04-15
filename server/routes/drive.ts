import path from 'path';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { config } from '../config';
import {
  driveRequest,
  getHaloRootFolder,
  loadWorkspaceDraftFile,
  saveWorkspaceDraftFile,
  sanitizeString,
  isValidDate,
  isValidSex,
  isValidVisitType,
  parseFolderString,
  parsePatientFolder,
} from '../services/drive';
import { recoverPendingJobs, runSchedulerNow, getSchedulerStatus } from '../jobs/scheduler';

const router = Router();
router.use(requireAuth);

const { driveApi, uploadApi } = config;

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/** When the browser sends an empty type, infer from extension (must stay in sync with ALLOWED). */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const REPORTED_MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
};

function resolveUploadMimeType(fileName: string, reportedRaw: string): string | null {
  let t = (reportedRaw || '').trim().toLowerCase();
  if (t && REPORTED_MIME_ALIASES[t]) t = REPORTED_MIME_ALIASES[t];
  if (t && ALLOWED_UPLOAD_TYPES.includes(t)) return t;
  const ext = path.extname(fileName).toLowerCase();
  const inferred = EXTENSION_TO_MIME[ext];
  if (inferred && ALLOWED_UPLOAD_TYPES.includes(inferred)) return inferred;
  return null;
}

/** Drive multipart uploads expect raw media bytes in part 2, not base64 text. */
function buildDriveMultipartBody(
  boundary: string,
  metadata: { name: string; parents: string[]; mimeType: string },
  mediaBytes: Buffer
): Buffer {
  const metaPart = JSON.stringify(metadata);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
      `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([head, mediaBytes, tail]);
}

const DEFAULT_PAGE_SIZE = 50;

// --- Routes ---

// GET /patients?page=<token>&pageSize=<number>
router.get('/patients', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;

    // On first auth request after restart, recover any pending conversion jobs from Drive
    const refreshToken = req.session.refreshToken || '';
    recoverPendingJobs(token, refreshToken).catch(() => {});

    const rootId = await getHaloRootFolder(token);

    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 100);
    const pageToken = typeof req.query.page === 'string' ? req.query.page : undefined;

    let url = `/files?q=${encodeURIComponent(
      `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    )}&fields=files(id,name,appProperties,createdTime),nextPageToken&pageSize=${pageSize}`;

    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const data = await driveRequest(token, url);
    const patients = (data.files || []).map(parsePatientFolder);

    // Auto-heal: update appProperties if folder name was changed in Drive
    for (const f of data.files || []) {
      if (!f.name.includes('__')) continue;
      const parsed = parseFolderString(f.name);
      if (!parsed) continue;
      const storedName = f.appProperties?.patientName;
      const storedDob = f.appProperties?.patientDob;
      const storedSex = f.appProperties?.patientSex;
      if (parsed.pName !== storedName || parsed.pDob !== storedDob || parsed.pSex !== storedSex) {
        const prev = (f as { appProperties?: Record<string, string> }).appProperties || {};
        fetch(`${driveApi}/files/${f.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appProperties: {
              ...prev,
              patientName: parsed.pName,
              patientDob: parsed.pDob,
              patientSex: parsed.pSex,
            },
          }),
        }).catch(() => {});
      }
    }

    res.json({ patients, nextPage: data.nextPageToken || null });
  } catch (err) {
    console.error('Fetch patients error:', err);
    res.status(500).json({ error: 'Failed to fetch patients.' });
  }
});

// POST /run-scheduler — run conversion jobs immediately (no wait for 5-min interval)
router.post('/run-scheduler', async (_req: Request, res: Response) => {
  try {
    await runSchedulerNow();
    res.json({ ok: true, message: 'Scheduler ran. Due conversions have been processed.' });
  } catch (err) {
    console.error('Run scheduler error:', err);
    res.status(500).json({ error: 'Scheduler run failed.' });
  }
});

// GET /scheduler-status — check pending conversion jobs count
router.get('/scheduler-status', async (_req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();
    const pendingJobs = status.jobs.filter(j => j.status !== 'done');
    const dueJobs = pendingJobs.filter(j => {
      const elapsed = Date.now() - new Date(j.savedAt).getTime();
      if (j.status === 'pending_docx') return elapsed >= 10 * 60 * 60 * 1000;
      if (j.status === 'pending_pdf') return elapsed >= 24 * 60 * 60 * 1000;
      return false;
    });
    res.json({
      totalPending: pendingJobs.length,
      totalDue: dueJobs.length,
      jobs: pendingJobs.map(j => ({
        fileId: j.fileId,
        status: j.status,
        savedAt: j.savedAt,
      })),
    });
  } catch (err) {
    console.error('Scheduler status error:', err);
    res.status(500).json({ error: 'Failed to get scheduler status.' });
  }
});

// POST /patients
router.post('/patients', async (req: Request, res: Response) => {
  try {
    const name = sanitizeString(req.body.name);
    const dob = sanitizeString(req.body.dob);
    const sex = sanitizeString(req.body.sex);
    const folderNumber = sanitizeString(req.body.folderNumber, 80);
    const contactNumber = sanitizeString(req.body.contactNumber, 80);
    const referringDoctor = sanitizeString(req.body.referringDoctor, 200);
    const visitTypeRaw = sanitizeString(req.body.visitType, 20);
    const visitType = isValidVisitType(visitTypeRaw) ? visitTypeRaw : 'new';
    const visitDate = sanitizeString(req.body.visitDate, 12);

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Patient name must be at least 2 characters.' });
      return;
    }
    if (!dob || !isValidDate(dob)) {
      res.status(400).json({ error: 'Invalid date of birth. Use YYYY-MM-DD format.' });
      return;
    }
    if (!isValidSex(sex)) {
      res.status(400).json({ error: 'Sex must be M or F.' });
      return;
    }
    if (!visitDate || !isValidDate(visitDate)) {
      res.status(400).json({ error: 'Visit date is required (YYYY-MM-DD).' });
      return;
    }

    const token = req.session.accessToken!;
    const rootId = await getHaloRootFolder(token);

    const createRes = await fetch(`${driveApi}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${name}__${dob}__${sex}`,
        parents: [rootId],
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: {
          type: 'patient_folder',
          patientName: name,
          patientDob: dob,
          patientSex: sex,
          ...(folderNumber ? { patientFolderNumber: folderNumber } : {}),
          ...(contactNumber ? { patientContact: contactNumber } : {}),
          ...(referringDoctor ? { patientReferringDoctor: referringDoctor } : {}),
          patientVisitType: visitType,
          patientVisitDate: visitDate,
        },
      }),
    });

    const body = (await createRes.json()) as { id?: string; error?: { message: string } };
    if (!createRes.ok || !body.id) {
      const msg = body.error?.message || `Drive API error (${createRes.status})`;
      console.error('Drive create folder failed:', createRes.status, body);
      res.status(createRes.ok ? 500 : createRes.status).json({ error: msg });
      return;
    }

    const folder = body;
    res.json({
      id: folder.id,
      name,
      dob,
      sex,
      lastVisit: new Date().toISOString().split('T')[0],
      alerts: [],
      ...(folderNumber ? { folderNumber } : {}),
      ...(contactNumber ? { contactNumber } : {}),
      ...(referringDoctor ? { referringDoctor } : {}),
      visitType,
      visitDate,
    });
  } catch (err) {
    console.error('Create patient error:', err);
    res.status(500).json({ error: 'Failed to create patient.' });
  }
});

// PATCH /patients/:id
router.patch('/patients/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const { id } = req.params;

    const name = req.body.name ? sanitizeString(req.body.name) : undefined;
    const dob = req.body.dob ? sanitizeString(req.body.dob) : undefined;
    const sex = req.body.sex ? sanitizeString(req.body.sex) : undefined;
    const folderNumber =
      req.body.folderNumber !== undefined ? sanitizeString(req.body.folderNumber, 80) : undefined;
    const contactNumber =
      req.body.contactNumber !== undefined ? sanitizeString(req.body.contactNumber, 80) : undefined;
    const referringDoctor =
      req.body.referringDoctor !== undefined ? sanitizeString(req.body.referringDoctor, 200) : undefined;
    const visitTypeBody = req.body.visitType;
    const visitTypePatch =
      visitTypeBody !== undefined ? sanitizeString(visitTypeBody, 20) : undefined;
    const visitDatePatch =
      req.body.visitDate !== undefined ? sanitizeString(req.body.visitDate, 12) : undefined;

    if (name !== undefined && name.length < 2) {
      res.status(400).json({ error: 'Patient name must be at least 2 characters.' });
      return;
    }
    if (dob !== undefined && !isValidDate(dob)) {
      res.status(400).json({ error: 'Invalid date of birth. Use YYYY-MM-DD format.' });
      return;
    }
    if (sex !== undefined && !isValidSex(sex)) {
      res.status(400).json({ error: 'Sex must be M or F.' });
      return;
    }
    if (visitTypePatch !== undefined && visitTypePatch !== '' && !isValidVisitType(visitTypePatch)) {
      res.status(400).json({ error: 'Visit type must be new or follow_up.' });
      return;
    }
    if (visitDatePatch !== undefined && visitDatePatch !== '' && !isValidDate(visitDatePatch)) {
      res.status(400).json({ error: 'Invalid visit date. Use YYYY-MM-DD.' });
      return;
    }

    const current = await driveRequest(token, `/files/${id}?fields=name,appProperties`);

    let currentName = current.appProperties?.patientName;
    let currentDob = current.appProperties?.patientDob;
    let currentSex = current.appProperties?.patientSex;

    const needsParsing = !currentName || currentName === 'Unknown' || currentName?.includes('_');
    if (needsParsing && current.name?.includes('__')) {
      const parsed = parseFolderString(current.name);
      if (parsed) {
        currentName = parsed.pName;
        currentDob = parsed.pDob;
        currentSex = parsed.pSex;
      }
    }

    const finalName = name || currentName || 'Unknown';
    const finalDob = dob || currentDob || 'Unknown';
    const finalSex = sex || currentSex || 'M';

    const prevProps = { ...(current.appProperties || {}) };
    const appProperties: Record<string, string> = {
      ...prevProps,
      type: prevProps.type || 'patient_folder',
      patientName: finalName,
      patientDob: finalDob,
      patientSex: finalSex,
    };
    if (folderNumber !== undefined) {
      appProperties.patientFolderNumber = folderNumber;
    }
    if (contactNumber !== undefined) {
      appProperties.patientContact = contactNumber;
    }
    if (referringDoctor !== undefined) {
      appProperties.patientReferringDoctor = referringDoctor;
    }
    if (visitTypePatch !== undefined && visitTypePatch !== '') {
      appProperties.patientVisitType = visitTypePatch;
    }
    if (visitDatePatch !== undefined && visitDatePatch !== '') {
      appProperties.patientVisitDate = visitDatePatch;
    }

    await fetch(`${driveApi}/files/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${finalName}__${finalDob}__${finalSex}`,
        appProperties,
      }),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update patient error:', err);
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

// DELETE /patients/:id
router.delete('/patients/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    await fetch(`${driveApi}/files/${req.params.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete patient error:', err);
    res.status(500).json({ error: 'Failed to delete patient.' });
  }
});

// POST /patients/:id/folder - Create a subfolder
router.post('/patients/:id/folder', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const name = sanitizeString(req.body.name, 255);

    if (!name || name.length < 1) {
      res.status(400).json({ error: 'Folder name is required.' });
      return;
    }

    const createRes = await fetch(`${driveApi}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        parents: [req.params.id],
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    const folder = (await createRes.json()) as { id: string; name: string; mimeType: string; createdTime?: string };
    res.json({
      id: folder.id,
      name: folder.name,
      mimeType: folder.mimeType,
      url: '',
      createdTime: folder.createdTime?.split('T')[0] ?? new Date().toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder.' });
  }
});

// GET /patients/:id/workspace-draft — clinical editor + scribe state stored in Patient Notes as JSON
router.get('/patients/:id/workspace-draft', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const patientFolderId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const raw = await loadWorkspaceDraftFile(token, patientFolderId);
    if (!raw?.trim()) {
      res.json({ draft: null });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      res.status(400).json({ error: 'Invalid workspace draft file on Drive.' });
      return;
    }
    const obj = data as { savedAt?: unknown; draft?: unknown };
    if (typeof obj.savedAt !== 'number' || obj.draft === undefined || obj.draft === null) {
      res.json({ draft: null });
      return;
    }
    res.json({ savedAt: obj.savedAt, draft: obj.draft });
  } catch (err) {
    console.error('workspace-draft GET:', err);
    res.status(500).json({ error: 'Failed to load workspace draft.' });
  }
});

// PUT /patients/:id/workspace-draft
router.put('/patients/:id/workspace-draft', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const patientFolderId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const { savedAt, draft } = req.body as { savedAt?: unknown; draft?: unknown };
    if (typeof savedAt !== 'number' || draft === undefined || draft === null || typeof draft !== 'object') {
      res.status(400).json({ error: 'Invalid workspace draft payload.' });
      return;
    }
    const json = JSON.stringify({ savedAt, draft });
    if (json.length > 12 * 1024 * 1024) {
      res.status(400).json({ error: 'Workspace draft too large.' });
      return;
    }
    await saveWorkspaceDraftFile(token, patientFolderId, json);
    res.json({ ok: true });
  } catch (err) {
    console.error('workspace-draft PUT:', err);
    res.status(500).json({ error: 'Failed to save workspace draft.' });
  }
});

// GET /patients/:id/files?page=<token>&pageSize=<number>
router.get('/patients/:id/files', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 100);
    const pageToken = typeof req.query.page === 'string' ? req.query.page : undefined;

    let url = `/files?q=${encodeURIComponent(
      `'${req.params.id}' in parents and trashed=false`
    )}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime,appProperties),nextPageToken&pageSize=${pageSize}`;

    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const data = await driveRequest(token, url);

    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      url: f.webViewLink ?? '',
      thumbnail: f.thumbnailLink ?? '',
      createdTime: f.createdTime?.split('T')[0] ?? '',
      haloTemplateId:
        typeof (f as { appProperties?: Record<string, unknown> }).appProperties?.haloTemplateId === 'string'
          ? ((f as { appProperties?: Record<string, unknown> }).appProperties!.haloTemplateId as string)
          : undefined,
    }));

    res.json({ files, nextPage: data.nextPageToken || null });
  } catch (err) {
    console.error('Fetch files error:', err);
    res.status(500).json({ error: 'Failed to fetch files.' });
  }
});

// POST /patients/:id/upload
router.post('/patients/:id/upload', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const parentFolderId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const fileName = sanitizeString(req.body.fileName, 255);
    const fileTypeRaw = sanitizeString(req.body.fileType, 100);
    const fileData = req.body.fileData as string;
    const haloTemplateId = sanitizeString(req.body.haloTemplateId, 80);

    if (!fileName) {
      res.status(400).json({ error: 'File name is required.' });
      return;
    }
    if (!fileData || typeof fileData !== 'string') {
      res.status(400).json({ error: 'File data is required.' });
      return;
    }

    const fileType = resolveUploadMimeType(fileName, fileTypeRaw);
    if (!fileType) {
      res.status(400).json({
        error: `File type not allowed or unknown (reported: "${fileTypeRaw || 'empty'}"). Allowed: ${ALLOWED_UPLOAD_TYPES.join(', ')}`,
      });
      return;
    }

    let mediaBytes: Buffer;
    try {
      mediaBytes = Buffer.from(fileData.replace(/\s/g, ''), 'base64');
    } catch {
      res.status(400).json({ error: 'Invalid file data encoding.' });
      return;
    }
    if (mediaBytes.length === 0) {
      res.status(400).json({ error: 'Empty file.' });
      return;
    }
    if (mediaBytes.length > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` });
      return;
    }

    const metadata = {
      name: fileName,
      parents: [parentFolderId],
      mimeType: fileType,
      ...(haloTemplateId ? { appProperties: { haloTemplateId } } : {}),
    };

    const boundary = 'halo_upload_boundary_' + Math.random().toString(36).slice(2);
    const multipartBody = buildDriveMultipartBody(boundary, metadata, mediaBytes);

    const uploadRes = await fetch(
      `${uploadApi}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Drive upload failed:', uploadRes.status, errText);
      res.status(500).json({ error: 'Google Drive upload failed.' });
      return;
    }

    const data = (await uploadRes.json()) as { id: string; name: string; mimeType: string; webViewLink?: string };
    res.json({
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      url: data.webViewLink ?? '',
      createdTime: new Date().toISOString().split('T')[0],
      ...(haloTemplateId ? { haloTemplateId } : {}),
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// PATCH /files/:fileId
router.patch('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const name = sanitizeString(req.body.name, 255);

    if (!name) {
      res.status(400).json({ error: 'File name is required.' });
      return;
    }

    await fetch(`${driveApi}/files/${req.params.fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update file error:', err);
    res.status(500).json({ error: 'Failed to update file.' });
  }
});

// DELETE /files/:fileId - Trash a file
router.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    await fetch(`${driveApi}/files/${req.params.fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

// GET /files/:fileId/download - Get download URL
router.get('/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const data = await driveRequest(
      token,
      `/files/${req.params.fileId}?fields=webContentLink,webViewLink,name,mimeType`
    );

    res.json({
      downloadUrl: (data as Record<string, unknown>).webContentLink || '',
      viewUrl: (data as Record<string, unknown>).webViewLink || '',
      name: data.name ?? '',
      mimeType: data.mimeType ?? '',
    });
  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).json({ error: 'Failed to get download link.' });
  }
});

// GET /files/:fileId/proxy — stream file content for in-app viewer
router.get('/files/:fileId/proxy', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const fileId = req.params.fileId;

    // Get file metadata first
    const meta = await driveRequest(token, `/files/${fileId}?fields=name,mimeType`);
    const mimeType = meta.mimeType ?? 'application/octet-stream';
    const name = meta.name ?? 'file';

    let contentResponse: globalThis.Response;

    // Google Workspace files need export, not direct download
    if (mimeType === 'application/vnd.google-apps.document') {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', mimeType);
    }

    if (!contentResponse.ok) {
      res.status(contentResponse.status).json({ error: 'Failed to fetch file content.' });
      return;
    }

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);

    const arrayBuffer = await contentResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('File proxy error:', err);
    res.status(500).json({ error: 'Failed to proxy file.' });
  }
});

// --- USER SETTINGS (stored as a JSON file in Halo root folder) ---

const SETTINGS_FILE_NAME = 'halo_user_settings.json';

async function findSettingsFile(token: string, rootId: string): Promise<string | null> {
  const query = encodeURIComponent(
    `'${rootId}' in parents and name='${SETTINGS_FILE_NAME}' and mimeType='application/json' and trashed=false`
  );
  const data = await driveRequest(token, `/files?q=${query}&fields=files(id)`);
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

// GET /settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const rootId = await getHaloRootFolder(token);
    const fileId = await findSettingsFile(token, rootId);

    if (!fileId) {
      res.json({ settings: null });
      return;
    }

    const dlRes = await fetch(`${driveApi}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settings = await dlRes.json();
    res.json({ settings });
  } catch (err) {
    console.error('Load settings error:', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// PUT /settings
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Settings object is required.' });
      return;
    }

    const rootId = await getHaloRootFolder(token);
    const existingFileId = await findSettingsFile(token, rootId);
    const content = JSON.stringify(settings);

    if (existingFileId) {
      // Update existing file
      await fetch(`${uploadApi}/files/${existingFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: content,
      });
    } else {
      // Create new file
      const metadata = {
        name: SETTINGS_FILE_NAME,
        parents: [rootId],
        mimeType: 'application/json',
      };
      const boundary = 'halo_settings_boundary';
      const body = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
        `--${boundary}--`
      );
      await fetch(`${uploadApi}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

export default router;
