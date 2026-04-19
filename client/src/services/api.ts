import type { Patient, DriveFile, LabAlert, ChatMessage, UserSettings, HaloNote } from '../../../shared/types';
import type { ClinicalWorkspaceDraft, ClinicalWorkspaceDraftFile } from '../../../shared/workspaceDraft';

const API_BASE = import.meta.env.VITE_API_URL || '';

// --- Structured Error ---
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cold hosts (e.g. Heroku free) often return 502/503 on first touch; a short backoff usually succeeds. */
function isTransientApiFailure(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 0 ||
    err.status === 429 ||
    err.status === 502 ||
    err.status === 503 ||
    err.status === 504
  );
}

/**
 * Same as `request`, but retries a few times on transient gateway / overload / cold-start failures
 * so users are not forced to tap Retry after dictation.
 */
async function requestWithTransientRetry<T = unknown>(
  path: string,
  options: RequestInit = {},
  retryOpts?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<T> {
  const maxAttempts = retryOpts?.maxAttempts ?? 5;
  const baseDelayMs = retryOpts?.baseDelayMs ?? 900;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await request<T>(path, options);
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !isTransientApiFailure(e)) throw e;
      const jitter = Math.floor(Math.random() * 250);
      await delay(baseDelayMs * attempt + jitter);
    }
  }
  throw lastError;
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[API] Making request to: ${url}`);
  
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    console.error('[API] Network error:', error);
    throw new ApiError(
      `Failed to connect to server. Make sure the server is running on port 3000. ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }

  const raw = await res.text();

  let data: unknown = null;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      console.error('[API] Non-JSON body (first 300 chars):', raw.slice(0, 300));
      if (res.status === 401) {
        window.location.href = '/';
        throw new ApiError('Not authenticated', 401);
      }
      const hint =
        res.status === 503 || res.status === 502
          ? 'Service temporarily unavailable. If you are on free cloud hosting, the app may be waking from sleep—wait 30–60 seconds and try again. If it keeps happening, the backend may be overloaded.'
          : 'The server sent a non-JSON response (often an HTML error page from a proxy or host). Check your network or try again in a moment.';
      throw new ApiError(`${hint} (HTTP ${res.status})`, res.status);
    }
  }

  if (res.status === 401) {
    window.location.href = '/';
    throw new ApiError('Not authenticated', 401);
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string')
        ? (data as { error: string }).error
        : res.status === 503 || res.status === 502
          ? 'Service temporarily unavailable. Wait a moment and retry (host may be waking from idle).'
          : `Request failed (${res.status})`;
    console.error('[API] Request failed:', message);
    throw new ApiError(message, res.status);
  }

  return data as T;
}

// --- AUTH ---
export const getLoginUrl = () => request<{ url: string }>('/api/auth/login-url');
export const checkAuth = () => request<{ signedIn: boolean; email?: string }>('/api/auth/me');
export const logout = () => request('/api/auth/logout', { method: 'POST' });

/** Run note conversion scheduler now (txt→docx after 10h, docx→pdf after 24h). Requires jobs to be due. */
export const runSchedulerNow = () =>
  request<{ ok: boolean; message: string }>('/api/drive/run-scheduler', { method: 'POST' });

/** Check scheduler for pending conversion jobs */
export const getSchedulerStatus = () =>
  request<{ totalPending: number; totalDue: number; jobs: Array<{ fileId: string; status: string; savedAt: string }> }>(
    '/api/drive/scheduler-status'
  );

/** Send a new template request to admin (description + optional file attachments as base64) */
export const requestNewTemplate = (params: {
  description: string;
  attachments?: Array<{ name: string; content: string }>;
}) =>
  request<{ ok: boolean; message: string }>('/api/request-template', {
    method: 'POST',
    body: JSON.stringify(params),
  });

// --- PATIENTS (paginated) ---
interface PatientsResponse {
  patients: Patient[];
  nextPage: string | null;
}

export const fetchPatients = (page?: string): Promise<PatientsResponse> => {
  const params = new URLSearchParams();
  params.set('pageSize', '100');
  if (page) params.set('page', page);
  return request<PatientsResponse>(`/api/drive/patients?${params.toString()}`);
};

export async function fetchAllPatients(): Promise<Patient[]> {
  const all: Patient[] = [];
  let page: string | undefined;

  do {
    const data = await fetchPatients(page);
    all.push(...data.patients);
    page = data.nextPage ?? undefined;
  } while (page);

  return all;
}

export const createPatient = (
  name: string,
  dob: string,
  sex: 'M' | 'F',
  opts?: {
    folderNumber?: string;
    contactNumber?: string;
    referringDoctor?: string;
    visitType?: 'new' | 'follow_up';
    visitDate?: string;
  }
) =>
  request<Patient>('/api/drive/patients', {
    method: 'POST',
    body: JSON.stringify({
      name,
      dob,
      sex,
      ...(opts?.folderNumber?.trim() ? { folderNumber: opts.folderNumber.trim() } : {}),
      ...(opts?.contactNumber?.trim() ? { contactNumber: opts.contactNumber.trim() } : {}),
      ...(opts?.referringDoctor?.trim() ? { referringDoctor: opts.referringDoctor.trim() } : {}),
      visitType: opts?.visitType ?? 'new',
      visitDate: opts?.visitDate ?? '',
    }),
  });

export const updatePatient = (
  id: string,
  updates: {
    name?: string;
    dob?: string;
    sex?: string;
    folderNumber?: string;
    contactNumber?: string;
    referringDoctor?: string;
    visitType?: 'new' | 'follow_up';
    visitDate?: string;
  }
) =>
  request(`/api/drive/patients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

export const deletePatient = (id: string) =>
  request(`/api/drive/patients/${id}`, { method: 'DELETE' });

// --- FILES / FOLDER CONTENTS (paginated) ---
interface FilesResponse {
  files: DriveFile[];
  nextPage: string | null;
}

/** Fetch first page of files only (for fast initial render). Returns { files, nextPage }. */
export const fetchFilesFirstPage = async (
  patientId: string,
  pageSize = 100
): Promise<{ files: DriveFile[]; nextPage: string | null }> => {
  const data = await request<FilesResponse>(
    `/api/drive/patients/${patientId}/files?pageSize=${pageSize}`
  );
  return { files: data.files || [], nextPage: data.nextPage ?? null };
};

/** Fetch a single page of files by token (for pagination). */
export const fetchFilesPage = async (
  patientId: string,
  pageToken: string
): Promise<{ files: DriveFile[]; nextPage: string | null }> => {
  const data = await request<FilesResponse>(
    `/api/drive/patients/${patientId}/files?pageSize=100&page=${encodeURIComponent(pageToken)}`
  );
  return { files: data.files || [], nextPage: data.nextPage ?? null };
};

/** Fetch all pages of files (can be slow for large folders). */
export const fetchFiles = async (patientId: string): Promise<DriveFile[]> => {
  const all: DriveFile[] = [];
  let page: string | undefined;

  do {
    const data = await request<FilesResponse>(
      `/api/drive/patients/${patientId}/files?pageSize=100${page ? `&page=${encodeURIComponent(page)}` : ''}`
    );
    all.push(...data.files);
    page = data.nextPage ?? undefined;
  } while (page);

  return all;
};

// Fetch contents of any folder by its Drive ID (used for subfolder navigation)
export const fetchFolderContents = async (folderId: string): Promise<DriveFile[]> => {
  const all: DriveFile[] = [];
  let page: string | undefined;

  do {
    const data = await request<FilesResponse>(
      `/api/drive/patients/${folderId}/files?pageSize=100${page ? `&page=${encodeURIComponent(page)}` : ''}`
    );
    all.push(...data.files);
    page = data.nextPage ?? undefined;
  } while (page);

  return all;
};

export const uploadFile = async (
  patientId: string,
  file: File,
  customName?: string,
  opts?: { haloTemplateId?: string }
) => {
  const base64 = await fileToBase64(file);
  const fileType = resolveUploadMimeType(file);
  return request(`/api/drive/patients/${patientId}/upload`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: customName || file.name,
      fileType,
      fileData: base64,
      ...(opts?.haloTemplateId ? { haloTemplateId: opts.haloTemplateId } : {}),
    }),
  });
};

export const updateFileMetadata = (_patientId: string, fileId: string, newName: string) =>
  request(`/api/drive/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: newName }),
  });

export const deleteFile = (fileId: string) =>
  request(`/api/drive/files/${fileId}`, { method: 'DELETE' });

export const getFileDownloadUrl = (fileId: string) =>
  request<{ downloadUrl: string; viewUrl: string; name: string; mimeType: string }>(
    `/api/drive/files/${fileId}/download`
  );

export const createFolder = (parentId: string, name: string) =>
  request<DriveFile>(`/api/drive/patients/${parentId}/folder`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

/** Editor + scribe state mirrored under Patient Notes as __Halo_clinical_workspace.json */
export const fetchWorkspaceDraft = (patientId: string) =>
  request<{ savedAt: number; draft: ClinicalWorkspaceDraft } | { draft: null }>(
    `/api/drive/patients/${patientId}/workspace-draft`
  );

export const saveWorkspaceDraft = (patientId: string, body: ClinicalWorkspaceDraftFile) =>
  request<{ ok: boolean }>(`/api/drive/patients/${patientId}/workspace-draft`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

// --- AI ---
export const generatePatientSummary = async (patientName: string, files: DriveFile[], patientId?: string): Promise<string[]> => {
  return request<string[]>('/api/ai/summary', {
    method: 'POST',
    body: JSON.stringify({ patientName, patientId, files }),
  });
};

export const extractLabAlerts = async (content: string): Promise<LabAlert[]> => {
  return request<LabAlert[]>('/api/ai/lab-alerts', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
};

export const analyzeAndRenameImage = async (base64Image: string): Promise<string> => {
  const data = await request<{ filename: string }>('/api/ai/analyze-image', {
    method: 'POST',
    body: JSON.stringify({ base64Image }),
  });
  return data.filename;
};

export const extractEchoReportText = async (params: {
  base64Data: string;
  mimeType?: string;
}): Promise<string> => {
  const data = await request<{ text: string }>('/api/ai/echo-report-extract', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.text ?? '';
};

export const extractDocumentText = async (params: {
  base64Data: string;
  mimeType?: string;
}): Promise<string> => {
  const data = await request<{ text: string }>('/api/ai/document-extract', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.text ?? '';
};

/** Transcribe audio to text only (no SOAP/note generation). Use Halo generate_note for notes. */
export const transcribeAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
  const data = await request<{ transcript: string }>('/api/ai/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, mimeType }),
  });
  return data.transcript ?? '';
};

// --- Halo API (note generation + templates) ---
export const getHaloTemplates = (userId?: string) =>
  request<Record<string, unknown>>('/api/halo/templates', {
    method: 'POST',
    body: JSON.stringify(userId ? { user_id: userId } : {}),
  });

/** Generate note preview (return_type=note). Returns normalized notes array. */
export const generateNotePreview = (params: { template_id: string; text: string; user_id?: string }) =>
  requestWithTransientRetry<{ notes: HaloNote[] }>('/api/halo/generate-note', {
    method: 'POST',
    body: JSON.stringify({ ...params, return_type: 'note' }),
  });

/** Build inline PDF preview from the same full text used for DOCX (chart + note). */
export async function fetchNotePreviewPdf(text: string, signal?: AbortSignal): Promise<Blob> {
  const maxAttempts = 5;
  const baseDelayMs = 900;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = `${API_BASE}/api/halo/note-preview-pdf`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });
      if (res.status === 401) {
        window.location.href = '/';
        throw new ApiError('Not authenticated', 401);
      }
      if (!res.ok) {
        let msg = `PDF preview failed (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (typeof j.error === 'string') msg = j.error;
        } catch {
          /* ignore */
        }
        throw new ApiError(msg, res.status);
      }
      return res.blob();
    } catch (e) {
      lastError = e;
      if (signal?.aborted) throw e;
      if (attempt >= maxAttempts || !isTransientApiFailure(e)) throw e;
      const jitter = Math.floor(Math.random() * 250);
      await delay(baseDelayMs * attempt + jitter);
    }
  }
  throw lastError;
}

/** Generate DOCX and save to patient folder on Drive. Returns { success, fileId, name }. */
export const saveNoteAsDocx = (params: {
  patientId: string;
  template_id: string;
  text: string;
  fileName?: string;
  user_id?: string;
}) =>
  request<{ success: boolean; fileId: string; name: string }>('/api/halo/generate-note', {
    method: 'POST',
    body: JSON.stringify({
      template_id: params.template_id,
      text: params.text,
      return_type: 'docx',
      patientId: params.patientId,
      fileName: params.fileName,
      user_id: params.user_id,
    }),
  });

/** Email the current note; attaches Word when template_id is set. Body stays short when .docx attaches (full text only if attachment fails). */
export const sendClinicalNoteEmail = (params: {
  subject?: string;
  text: string;
  patientName?: string;
  template_id?: string;
  attachDocx?: boolean;
  docxFileName?: string;
}) =>
  request<{ ok: boolean; message: string }>('/api/email-note', {
    method: 'POST',
    body: JSON.stringify(params),
  });

/** Email a workspace Drive file: attachment when possible; short body (no full extracted text when attached). */
export const sendWorkspaceFileEmail = (params: {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileUrl?: string;
  patient: {
    name: string;
    dob: string;
    sex: 'M' | 'F';
    folderNumber?: string;
    contactNumber?: string;
    referringDoctor?: string;
    visitType?: 'new' | 'follow_up';
    visitDate?: string;
  };
}) =>
  request<{ ok: boolean; message: string }>('/api/email-workspace-file', {
    method: 'POST',
    body: JSON.stringify(params),
  });

export const searchPatientsByConcept = async (
  query: string,
  patients: Patient[],
  files: Record<string, DriveFile[]>
): Promise<string[]> => {
  return request<string[]>('/api/ai/search', {
    method: 'POST',
    body: JSON.stringify({ query, patients, files }),
  });
};

export const askHalo = async (
  patientId: string,
  question: string,
  history: ChatMessage[]
): Promise<{ reply: string }> => {
  return request<{ reply: string }>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ patientId, question, history }),
  });
};

/**
 * Stream HALO chat response via SSE. Calls onChunk for each text chunk,
 * onComplete when done. Uses 90s timeout for slow Gemini responses.
 */
export const askHaloStream = async (
  patientId: string,
  question: string,
  history: ChatMessage[],
  onChunk: (text: string) => void
): Promise<void> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${API_BASE}/api/ai/chat-stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, question, history }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 401) {
      window.location.href = '/';
      throw new ApiError('Not authenticated', 401);
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(err.error || `Request failed (${res.status})`, res.status);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new ApiError('No response body', 500);

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data) as string;
            if (typeof parsed === 'string') onChunk(parsed);
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

// --- SETTINGS ---
export const loadSettings = () =>
  request<{ settings: UserSettings | null }>('/api/drive/settings');

export const saveSettings = (settings: UserSettings) =>
  request<{ success: boolean }>('/api/drive/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

// --- UTILS ---
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Match server allowlist / extension map when `File.type` is missing (common on some OS / exports). */
function resolveUploadMimeType(file: File): string {
  const raw = (file.type || '').trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw) return file.type.trim();
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  const EXT: Record<string, string> = {
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
  return EXT[ext] || '';
}
