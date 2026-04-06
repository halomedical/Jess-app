import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Patient, DriveFile, LabAlert, BreadcrumbItem, ChatMessage, HaloNote } from '../../../shared/types';
import { HALO_TEMPLATE_OPTIONS, DEFAULT_HALO_TEMPLATE_ID } from '../../../shared/haloTemplates';
import { detectTemplateIntentFromDictationHead, stripLeadingDictationTemplateCue } from '../../../shared/dictationTemplateIntent';
import { buildNotePlainText } from '../../../shared/notePlainText';
import { buildClinicalNoteInputFromDictation, buildNoteTextWithPatientChart } from '../../../shared/patientChartContext';
import { formatAgeFromIsoDob } from '../../../shared/patientDemographics';
import type { ClinicalWorkspaceDraft as PatientEditorDraft, ClinicalWorkspaceDraftFile } from '../../../shared/workspaceDraft';
import { isHaloWorkspaceDraftFile } from '../../../shared/workspaceDraft';
import { AppStatus, FOLDER_MIME_TYPE } from '../../../shared/types';

import {
  fetchFiles, fetchFilesFirstPage, fetchFilesPage, fetchFolderContents, uploadFile, updatePatient,
  updateFileMetadata, generatePatientSummary, analyzeAndRenameImage,
  extractLabAlerts, deleteFile, createFolder, askHaloStream,
  generateNotePreview, saveNoteAsDocx, sendClinicalNoteEmail, sendWorkspaceFileEmail,
  fetchWorkspaceDraft, saveWorkspaceDraft,
} from '../services/api';
import {
  Upload, Calendar, Clock, CheckCircle2, ChevronLeft, Loader2,
  CloudUpload, Pencil, X, Trash2, FolderOpen, MessageCircle,
  FolderPlus, ChevronRight, Mail, Phone, Hash,
} from 'lucide-react';
import { SmartSummary } from '../features/smart-summary/SmartSummary';
import { LabAlerts } from '../features/lab-alerts/LabAlerts';
import { useRecordingSessions } from '../features/scribe/RecordingSessionsContext';
import { FileViewer } from '../components/FileViewer';
import { FileBrowser } from '../components/FileBrowser';
import { NoteEditor } from '../components/NoteEditor';
import { PatientChat } from '../components/PatientChat';
import { getErrorMessage, formatDocumentDateDisplay, sanitizeDocxFileBase } from '../utils/formatting';
import { inAppPatientMirrorKey } from '../utils/inAppDraftMirror';

interface Props {
  patient: Patient;
  onBack: () => void;
  onDataChange: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  userEmail?: string;
  templateId?: string;
}

const DRAFT_STORAGE_VERSION = 1 as const;
/** Local draft retention (notes should not vanish because of age). */
const DRAFT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const WORKSPACE_TAB_STORAGE_PREFIX = 'halo_patientWorkspaceTab_v1:';

type WorkspaceTab = 'overview' | 'notes' | 'chat';

function readStoredWorkspaceTab(patientId: string): WorkspaceTab {
  try {
    const v = sessionStorage.getItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${patientId}`);
    if (v === 'overview' || v === 'notes' || v === 'chat') return v;
  } catch {
    /* private mode */
  }
  return 'overview';
}

function persistWorkspaceTab(patientId: string, tab: WorkspaceTab): void {
  try {
    sessionStorage.setItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${patientId}`, tab);
  } catch {
    /* private mode */
  }
}

function draftStorageKey(userEmail: string | undefined, patientId: string): string {
  const who = (userEmail || 'anon').toLowerCase().trim() || 'anon';
  return `halo_editorScribeDraft_v${DRAFT_STORAGE_VERSION}:${who}:${patientId}`;
}

function safeParseDraft(raw: string | null): { savedAt: number; draft: PatientEditorDraft } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: number; draft?: PatientEditorDraft };
    if (!parsed?.draft) return null;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now();
    const d = parsed.draft;
    return {
      savedAt,
      draft: {
        pendingTranscript: typeof d.pendingTranscript === 'string' ? d.pendingTranscript : null,
        notes: Array.isArray(d.notes) ? d.notes : [],
        activeNoteIndex: typeof d.activeNoteIndex === 'number' ? d.activeNoteIndex : 0,
        selectedTemplatesForGenerate: Array.isArray(d.selectedTemplatesForGenerate) ? d.selectedTemplatesForGenerate : [DEFAULT_HALO_TEMPLATE_ID],
        templateId: typeof d.templateId === 'string' ? d.templateId : DEFAULT_HALO_TEMPLATE_ID,
      },
    };
  } catch {
    return null;
  }
}

function draftHasContent(d: PatientEditorDraft): boolean {
  return (d.notes?.length ?? 0) > 0 || !!(d.pendingTranscript && d.pendingTranscript.trim());
}

function withinDraftTtl(s: ReturnType<typeof safeParseDraft>): boolean {
  return !!(s && Date.now() - s.savedAt <= DRAFT_TTL_MS);
}

/**
 * Best local draft for this patient: scans every storage key for this patientId (any signed-in user / anon)
 * so notes reappear after account switches; prefers drafts with real content over empty + newer timestamp.
 */
function pickStoredDraft(
  userEmail: string | undefined,
  patientId: string
): { savedAt: number; draft: PatientEditorDraft } | null {
  const prefix = `halo_editorScribeDraft_v${DRAFT_STORAGE_VERSION}:`;
  const suffix = `:${patientId}`;
  const seenKeys = new Set<string>();
  const candidates: { savedAt: number; draft: PatientEditorDraft }[] = [];

  const pushKey = (key: string) => {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const s = safeParseDraft(localStorage.getItem(key));
    if (s && withinDraftTtl(s)) candidates.push(s);
  };

  pushKey(draftStorageKey(userEmail, patientId));
  pushKey(draftStorageKey(undefined, patientId));
  pushKey(inAppPatientMirrorKey(patientId));

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue;
      pushKey(key);
    }
  } catch {
    /* private mode / quota */
  }

  if (candidates.length === 0) return null;

  const withContent = candidates.filter((c) => draftHasContent(c.draft));
  const pool = withContent.length > 0 ? withContent : candidates;

  pool.sort((a, b) => {
    const ac = draftHasContent(a.draft);
    const bc = draftHasContent(b.draft);
    if (ac !== bc) return ac ? -1 : 1;
    const an = a.draft.notes?.length ?? 0;
    const bn = b.draft.notes?.length ?? 0;
    if (an !== bn) return bn - an;
    const alen = (a.draft.pendingTranscript ?? '').length;
    const blen = (b.draft.pendingTranscript ?? '').length;
    if (alen !== blen) return blen - alen;
    return b.savedAt - a.savedAt;
  });

  return pool[0];
}

/** Apply Drive backup only when it would not wipe richer local data (timestamp alone is not enough). */
function shouldApplyRemoteWorkspace(
  local: { savedAt: number; draft: PatientEditorDraft } | null,
  remote: { savedAt: number; draft: PatientEditorDraft }
): boolean {
  const lHas = local && draftHasContent(local.draft);
  const rHas = draftHasContent(remote.draft);
  if (rHas && !lHas) return true;
  if (lHas && !rHas) return false;
  if (!rHas && !lHas) return remote.savedAt > (local?.savedAt ?? 0);
  const ln = local!.draft.notes?.length ?? 0;
  const rn = remote.draft.notes?.length ?? 0;
  if (rn > ln) return true;
  if (ln > rn) return false;
  return remote.savedAt > local!.savedAt;
}

export const PatientWorkspace: React.FC<Props> = ({ patient, onBack, onDataChange, onToast, userEmail, templateId: propTemplateId }) => {
  const scribeSessions = useRecordingSessions();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [summary, setSummary] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<LabAlert[]>([]);
  const [notes, setNotes] = useState<HaloNote[]>([]);
  const [activeNoteIndex, setActiveNoteIndex] = useState(0);
  const [templateId, setTemplateId] = useState(propTemplateId || DEFAULT_HALO_TEMPLATE_ID);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  /** Mirrors pendingTranscript for merge logic before React commits (scribe backlog + chained dictation). */
  const pendingTranscriptRef = useRef<string | null>(null);
  const [selectedTemplatesForGenerate, setSelectedTemplatesForGenerate] = useState<string[]>([DEFAULT_HALO_TEMPLATE_ID]);
  /** After a finished recording, prompt for note type when dictation did not name one (multi-template only). */
  const [postRecordTemplateModalOpen, setPostRecordTemplateModalOpen] = useState(false);
  const [postRecordTemplateSelection, setPostRecordTemplateSelection] = useState<string[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => readStoredWorkspaceTab(patient.id));
  const [savingNoteIndex, setSavingNoteIndex] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAiPanel, setShowAiPanel] = useState(true);
  /** After Drive workspace draft fetch finishes (avoids overwriting cloud with empty before first load). */
  const [driveSyncReady, setDriveSyncReady] = useState(false);

  const setWorkspaceTab = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab);
    persistWorkspaceTab(patient.id, tab);
  }, [patient.id]);

  useEffect(() => {
    setActiveTab(readStoredWorkspaceTab(patient.id));
  }, [patient.id]);

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>(patient.id);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: patient.id, name: patient.name },
  ]);

  const [editingPatient, setEditingPatient] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editSex, setEditSex] = useState<'M' | 'F'>('M');
  const [editFolderNumber, setEditFolderNumber] = useState('');
  const [editContactNumber, setEditContactNumber] = useState('');

  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [editFileName, setEditFileName] = useState("");

  const [fileToDelete, setFileToDelete] = useState<DriveFile | null>(null);
  const [driveFileEmailTarget, setDriveFileEmailTarget] = useState<DriveFile | null>(null);
  const [driveFileEmailSending, setDriveFileEmailSending] = useState(false);

  const patientRef = useRef(patient);
  patientRef.current = patient;

  useEffect(() => {
    pendingTranscriptRef.current = pendingTranscript;
  }, [pendingTranscript]);

  const patientChartPayload = useMemo(
    () => ({
      name: patient.name,
      dob: patient.dob,
      sex: (patient.sex === 'F' ? 'F' : 'M') as 'M' | 'F',
      folderNumber: patient.folderNumber,
      contactNumber: patient.contactNumber,
    }),
    [patient.name, patient.dob, patient.sex, patient.folderNumber, patient.contactNumber]
  );
  const patientEditorDraftsRef = useRef<Record<string, PatientEditorDraft>>({});
  const activeDraftPatientIdRef = useRef(patient.id);

  const persistDraftToStorage = useCallback((patientId: string, draft: PatientEditorDraft) => {
    try {
      const key = draftStorageKey(userEmail, patientId);
      // Basic guard against runaway storage size
      const clipped: PatientEditorDraft = {
        ...draft,
        pendingTranscript: draft.pendingTranscript && draft.pendingTranscript.length > 200_000
          ? draft.pendingTranscript.slice(-200_000)
          : draft.pendingTranscript,
        notes: draft.notes.map(n => ({
          ...n,
          content: n.content && n.content.length > 200_000 ? n.content.slice(-200_000) : n.content,
        })),
      };
      const savedAt = Date.now();
      const payload = JSON.stringify({ savedAt, draft: clipped });
      localStorage.setItem(key, payload);
      try {
        localStorage.setItem(inAppPatientMirrorKey(patientId), payload);
      } catch {
        /* mirror optional if quota tight */
      }
    } catch {
      // ignore storage failures (quota/private mode)
    }
  }, [userEmail]);

  /** Latest editor state for synchronous flush (tab close / background). */
  const latestWorkspaceRef = useRef<PatientEditorDraft | null>(null);
  latestWorkspaceRef.current = {
    pendingTranscript,
    notes,
    activeNoteIndex,
    selectedTemplatesForGenerate,
    templateId,
  };

  // File viewer state
  const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);

  // Chat state — use a ref to always have the latest messages for API calls
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLongWait, setChatLongWait] = useState(false);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const chatLongWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  chatMessagesRef.current = chatMessages;

  // Create folder state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Email note modal
  const [showEmailNoteModal, setShowEmailNoteModal] = useState(false);
  const [emailNoteIndex, setEmailNoteIndex] = useState(0);
  /** What to send: structured note, raw dictation, or chart identifiers only. */
  const [emailComposeMode, setEmailComposeMode] = useState<'note' | 'transcript' | 'chart_only'>('note');
  const [emailNoteSending, setEmailNoteSending] = useState(false);

  // Upload destination picker state
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string>(patient.id);
  const [uploadTargetLabel, setUploadTargetLabel] = useState<string>(patient.name);
  const [uploadPickerFolders, setUploadPickerFolders] = useState<DriveFile[]>([]);
  const [uploadPickerLoading, setUploadPickerLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isFolder = (file: DriveFile): boolean => file.mimeType === FOLDER_MIME_TYPE;

  const filesForBrowser = useMemo(
    () => files.filter((f) => !isHaloWorkspaceDraftFile(f.name)),
    [files]
  );

  // Load folder contents (with loading indicator)
  const loadFolderContents = useCallback(async (folderId: string) => {
    setStatus(AppStatus.LOADING);
    try {
      const contents = folderId === patient.id
        ? await fetchFiles(patient.id)
        : await fetchFolderContents(folderId);
      setFiles(contents);
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setStatus(AppStatus.IDLE);
  }, [patient.id, onToast]);

  // Silent refresh (no loading indicator — used for periodic polling)
  const silentRefresh = useCallback(async () => {
    try {
      const contents = currentFolderId === patient.id
        ? await fetchFiles(patient.id)
        : await fetchFolderContents(currentFolderId);
      setFiles(contents);
    } catch {
      // Silent — don't show errors for background refreshes
    }
  }, [currentFolderId, patient.id]);

  // Poll for external changes every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefresh();
      onDataChange();
    }, 30_000);
    return () => clearInterval(interval);
  }, [silentRefresh, onDataChange]);

  // Clean up upload progress interval on unmount
  useEffect(() => {
    return () => {
      if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    };
  }, []);

  // Initial load + AI summary (only at root patient folder)
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setStatus(AppStatus.LOADING);
      setFiles([]);
      setSummary([]);
      setAlerts([]);
      setChatMessages([]);
      setChatInput("");
      setUploadMessage(null);
      setCurrentFolderId(patient.id);
      setBreadcrumbs([{ id: patient.id, name: patient.name }]);
      setUploadTargetFolderId(patient.id);
      setUploadTargetLabel(patient.name);

      try {
        // Load first page only so the file list appears quickly; fetch rest in background
        const { files: firstFiles, nextPage } = await fetchFilesFirstPage(patient.id);
        if (!isMounted) return;
        setFiles(firstFiles);
        setStatus(AppStatus.IDLE);

        if (firstFiles.length > 0) {
          generatePatientSummary(patient.name, firstFiles, patient.id).then(res => {
            if (isMounted) setSummary(res);
          }).catch(() => {});

          const labFiles = firstFiles.filter(f =>
            f.name.toLowerCase().includes('lab') ||
            f.name.toLowerCase().includes('blood') ||
            f.name.toLowerCase().includes('result')
          );
          if (labFiles.length > 0) {
            const labContext = labFiles.map(f => f.name).join(', ');
            extractLabAlerts(`Patient files indicate lab results: ${labContext}`).then(res => {
              if (isMounted) setAlerts(res);
            }).catch(() => {});
          }
        }

        // Fetch remaining pages in background and append (so full list appears without blocking UI)
        if (nextPage) {
          (async () => {
            const all = [...firstFiles];
            let page: string | null = nextPage;
            while (page && isMounted) {
              try {
                const data = await fetchFilesPage(patient.id, page);
                all.push(...data.files);
                if (isMounted) setFiles([...all]);
                page = data.nextPage;
              } catch {
                break;
              }
            }
          })();
        }
      } catch (err) {
        if (isMounted) {
          onToast(getErrorMessage(err), 'error');
        }
        if (isMounted) setStatus(AppStatus.IDLE);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [patient.id, patient.name, onToast]);

  // Navigate into a subfolder
  const navigateToFolder = async (folder: DriveFile) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    await loadFolderContents(folder.id);
  };

  const navigateBack = async () => {
    if (breadcrumbs.length <= 1) return;
    const newBreadcrumbs = breadcrumbs.slice(0, -1);
    const parentId = newBreadcrumbs[newBreadcrumbs.length - 1].id;
    setBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(parentId);
    await loadFolderContents(parentId);
  };

  const navigateToBreadcrumb = async (index: number) => {
    if (index === breadcrumbs.length - 1) return;
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const targetId = newBreadcrumbs[newBreadcrumbs.length - 1].id;
    setBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(targetId);
    await loadFolderContents(targetId);
  };

  // Upload destination picker — always default to current patient so switching profiles doesn't show previous patient
  const openUploadPicker = async () => {
    setUploadTargetFolderId(patient.id);
    setUploadTargetLabel(patient.name);
    setShowUploadPicker(true);
    setUploadPickerLoading(true);
    try {
      const contents = await fetchFiles(patient.id);
      setUploadPickerFolders(contents.filter(f => f.mimeType === FOLDER_MIME_TYPE));
    } catch {
      setUploadPickerFolders([]);
    }
    setUploadPickerLoading(false);
  };

  const selectUploadFolder = async (folder: DriveFile) => {
    setUploadTargetFolderId(folder.id);
    setUploadTargetLabel(folder.name);
    setUploadPickerLoading(true);
    try {
      const contents = await fetchFolderContents(folder.id);
      setUploadPickerFolders(contents.filter(f => f.mimeType === FOLDER_MIME_TYPE));
    } catch {
      setUploadPickerFolders([]);
    }
    setUploadPickerLoading(false);
  };

  const confirmUploadDestination = () => {
    setShowUploadPicker(false);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const targetId = uploadTargetFolderId;

    setStatus(AppStatus.UPLOADING);
    setUploadProgress(10);
    setUploadMessage(`Uploading ${file.name}...`);

    // Track interval in a ref so it's cleaned up on unmount
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    uploadIntervalRef.current = setInterval(() => {
      setUploadProgress(prev => (prev >= 90 ? 90 : prev + 10));
    }, 200);

    await new Promise(r => setTimeout(r, 2000));
    if (uploadIntervalRef.current) {
      clearInterval(uploadIntervalRef.current);
      uploadIntervalRef.current = null;
    }
    setUploadProgress(100);

    setStatus(AppStatus.ANALYZING);
    setUploadMessage(null);

    const performUpload = async (base64?: string) => {
      let finalName = file.name;
      try {
        if (base64 && file.type.startsWith('image/')) {
          setUploadMessage("HALO is analyzing visual features...");
          finalName = await analyzeAndRenameImage(base64);
          setUploadMessage(`AI Renamed: ${finalName}`);
        }
      } catch {
        // AI rename not available
      }

      try {
        await uploadFile(targetId, file, finalName);
        await loadFolderContents(currentFolderId);
        onToast(`File uploaded to "${uploadTargetLabel}".`, 'success');
      } catch (err) {
        onToast(getErrorMessage(err), 'error');
      }
      setStatus(AppStatus.IDLE);
    };

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        performUpload(base64);
      };
      reader.readAsDataURL(file);
    } else {
      performUpload();
    }

    e.target.value = '';
  };

  useEffect(() => {
    setTemplateId(propTemplateId || DEFAULT_HALO_TEMPLATE_ID);
  }, [propTemplateId]);

  useEffect(() => {
    patientEditorDraftsRef.current[activeDraftPatientIdRef.current] = {
      pendingTranscript,
      notes,
      activeNoteIndex,
      selectedTemplatesForGenerate,
      templateId,
    };
    persistDraftToStorage(activeDraftPatientIdRef.current, {
      pendingTranscript,
      notes,
      activeNoteIndex,
      selectedTemplatesForGenerate,
      templateId,
    });
  }, [pendingTranscript, notes, activeNoteIndex, selectedTemplatesForGenerate, templateId, userEmail, persistDraftToStorage]);

  // In-app only: flush to localStorage when leaving the tab or closing (React effects can be skipped on hard close)
  useEffect(() => {
    const pid = patient.id;
    const flush = () => {
      const d = latestWorkspaceRef.current;
      if (!d) return;
      persistDraftToStorage(pid, d);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [patient.id, persistDraftToStorage]);

  const handleNoteChange = useCallback((noteIndex: number, updates: { title?: string; content?: string }) => {
    setNotes(prev => prev.map((n, i) => i !== noteIndex ? n : {
      ...n,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.content !== undefined && { content: updates.content }),
      ...(!n.createdAt ? { createdAt: new Date().toISOString() } : {}),
      dirty: true,
    }));
  }, []);

  const handleSaveAsDocx = useCallback(async (noteIndex: number) => {
    const note = notes[noteIndex];
    const plain = note ? buildNotePlainText(note) : '';
    if (!plain.trim()) return;
    const text = buildNoteTextWithPatientChart(patient, plain);
    setSavingNoteIndex(noteIndex);
    setStatus(AppStatus.SAVING);
    try {
      await saveNoteAsDocx({
        patientId: patient.id,
        template_id: note.template_id || templateId,
        text,
        fileName: sanitizeDocxFileBase(note.title || 'Note') || undefined,
      });
      setNotes(prev => prev.map((n, i) => i !== noteIndex ? n : { ...n, lastSavedAt: new Date().toISOString(), dirty: false }));
      await loadFolderContents(currentFolderId);
      onDataChange();
      onToast('Note saved as DOCX to Patient Notes folder.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setSavingNoteIndex(null);
    setStatus(AppStatus.IDLE);
  }, [notes, patient, templateId, currentFolderId, loadFolderContents, onDataChange, onToast]);

  const handleSaveAll = useCallback(async () => {
    setStatus(AppStatus.SAVING);
    let saved = 0;
    try {
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const plain = buildNotePlainText(note);
        if (!plain.trim()) continue;
        const text = buildNoteTextWithPatientChart(patient, plain);
        await saveNoteAsDocx({
          patientId: patient.id,
          template_id: note.template_id || templateId,
          text,
          fileName: sanitizeDocxFileBase(note.title || `Note ${i + 1}`) || undefined,
        });
        setNotes(prev => prev.map((n, j) => j !== i ? n : { ...n, lastSavedAt: new Date().toISOString(), dirty: false }));
        saved++;
      }
      if (saved > 0) {
        await loadFolderContents(currentFolderId);
        onDataChange();
        onToast(`Saved ${saved} note(s) as DOCX.`, 'success');
      }
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setStatus(AppStatus.IDLE);
  }, [notes, patient, templateId, currentFolderId, loadFolderContents, onDataChange, onToast]);

  const handleEmail = useCallback((noteIndex: number) => {
    if (!userEmail?.trim()) {
      onToast('Your Google email is not available. Sign out and sign in again.', 'error');
      return;
    }
    setDriveFileEmailTarget(null);
    setEmailComposeMode('note');
    setEmailNoteIndex(noteIndex);
    setShowEmailNoteModal(true);
  }, [userEmail, onToast]);

  const handleSendNoteEmail = useCallback(async () => {
    if (!userEmail?.trim()) {
      onToast('Your Google email is not available.', 'error');
      return;
    }
    const note = notes[emailNoteIndex];
    let plain = '';
    let subject = `Patient update — ${patient.name}`;
    let tid = templateId;
    let docBase = sanitizeDocxFileBase(`${patient.name} chart`);

    if (emailComposeMode === 'note') {
      plain = note ? buildNotePlainText(note) : '';
      tid = note?.template_id || templateId;
      subject = `Clinical note — ${patient.name} — ${note?.title || 'Note'}`;
      docBase = sanitizeDocxFileBase(`${note?.title || 'Note'} ${patient.name}`);
    } else if (emailComposeMode === 'transcript') {
      plain = (pendingTranscript ?? '').trim();
      subject = `Clinical dictation — ${patient.name}`;
      docBase = sanitizeDocxFileBase(`Dictation ${patient.name}`);
    } else {
      plain = '';
      subject = `Patient chart — ${patient.name}`;
      docBase = sanitizeDocxFileBase(`Patient chart ${patient.name}`);
    }

    const text = buildNoteTextWithPatientChart(patient, plain);
    setEmailNoteSending(true);
    try {
      const res = await sendClinicalNoteEmail({
        subject,
        text,
        patientName: patient.name,
        template_id: tid,
        docxFileName: docBase || undefined,
      });
      setShowEmailNoteModal(false);
      onToast(res.message?.trim() ? res.message : `Email sent to ${userEmail}`, 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setEmailNoteSending(false);
  }, [emailComposeMode, emailNoteIndex, notes, patient, pendingTranscript, templateId, userEmail, onToast]);

  /** Email anytime: prefer active note text, else dictation, else chart identifiers only. */
  const openEmailFromToolbar = useCallback(() => {
    if (!userEmail?.trim()) {
      onToast('Your Google email is not available. Sign out and sign in again.', 'error');
      return;
    }
    setWorkspaceTab('notes');
    const notePlain =
      notes.length > 0
        ? buildNotePlainText(notes[Math.min(activeNoteIndex, notes.length - 1)]).trim()
        : '';
    const dict = (pendingTranscript ?? '').trim();
    if (notes.length > 0 && notePlain) {
      setEmailComposeMode('note');
      setEmailNoteIndex(Math.min(activeNoteIndex, notes.length - 1));
    } else if (dict) {
      setEmailComposeMode('transcript');
      setEmailNoteIndex(0);
    } else {
      setEmailComposeMode('chart_only');
      setEmailNoteIndex(0);
    }
    setDriveFileEmailTarget(null);
    setShowEmailNoteModal(true);
  }, [userEmail, notes, activeNoteIndex, pendingTranscript, setWorkspaceTab, onToast]);

  useEffect(() => {
    const pid = patient.id;
    setPostRecordTemplateModalOpen(false);
    const memoryDraft = patientEditorDraftsRef.current[pid];
    const stored = pickStoredDraft(userEmail, pid);
    const draft = stored ? stored.draft : memoryDraft;
    activeDraftPatientIdRef.current = pid;
    const initialPending = draft?.pendingTranscript ?? null;
    setPendingTranscript(initialPending);
    pendingTranscriptRef.current = initialPending;
    setNotes(draft?.notes ?? []);
    setActiveNoteIndex(draft ? Math.min(draft.activeNoteIndex, Math.max((draft.notes?.length ?? 1) - 1, 0)) : 0);
    setSelectedTemplatesForGenerate(
      draft?.selectedTemplatesForGenerate?.length ? draft.selectedTemplatesForGenerate : [DEFAULT_HALO_TEMPLATE_ID]
    );
    setTemplateId(draft?.templateId ?? (propTemplateId || DEFAULT_HALO_TEMPLATE_ID));

    const applyTranscript = (text: string) => {
      if (!text.trim()) {
        onToast('No speech detected.', 'info');
        return;
      }
      if (patientRef.current.id !== pid) return;

      const prev = pendingTranscriptRef.current?.trim() ?? '';
      const trimmedText = text.trim();
      if (prev === trimmedText) {
        setWorkspaceTab('notes');
        return;
      }
      const merged = !prev ? trimmedText : `${prev}\n\n${trimmedText}`;

      const detected = !prev
        ? detectTemplateIntentFromDictationHead(merged)
        : detectTemplateIntentFromDictationHead(trimmedText);

      pendingTranscriptRef.current = merged;
      setPendingTranscript(merged);

      if (detected) {
        const label = HALO_TEMPLATE_OPTIONS.find((t) => t.id === detected)?.name ?? detected;
        setSelectedTemplatesForGenerate([detected]);
        setPostRecordTemplateModalOpen(false);
        onToast(`Using ${label} from your dictation.`, 'info');
      } else if (!prev && HALO_TEMPLATE_OPTIONS.length > 1) {
        setPostRecordTemplateSelection([]);
        setPostRecordTemplateModalOpen(true);
      }

      setWorkspaceTab('notes');
    };

    const unsub = scribeSessions.subscribeTranscription(pid, applyTranscript);
    const backlog = scribeSessions.consumeTranscriptionForPatient(pid);
    if (backlog != null) applyTranscript(backlog);
    return unsub;
  }, [patient.id, userEmail, propTemplateId, scribeSessions.subscribeTranscription, scribeSessions.consumeTranscriptionForPatient, onToast, setWorkspaceTab]);

  // Load clinical workspace from Google Drive (Patient Notes / __Halo_clinical_workspace.json) — source of truth across devices
  useEffect(() => {
    setDriveSyncReady(false);
    let cancelled = false;
    const pid = patient.id;
    (async () => {
      try {
        const remote = await fetchWorkspaceDraft(pid);
        if (cancelled) return;
        if (!remote || remote.draft === null) {
          setDriveSyncReady(true);
          return;
        }
        const parsed = safeParseDraft(
          JSON.stringify({ savedAt: remote.savedAt, draft: remote.draft })
        );
        if (!parsed) {
          setDriveSyncReady(true);
          return;
        }
        const freshLocal = pickStoredDraft(userEmail, pid);
        if (!shouldApplyRemoteWorkspace(freshLocal, parsed)) {
          setDriveSyncReady(true);
          return;
        }
        const p = parsed.draft.pendingTranscript ?? null;
        setPendingTranscript(p);
        pendingTranscriptRef.current = p;
        setNotes(parsed.draft.notes ?? []);
        setActiveNoteIndex(
          Math.min(
            parsed.draft.activeNoteIndex,
            Math.max((parsed.draft.notes?.length ?? 1) - 1, 0)
          )
        );
        setSelectedTemplatesForGenerate(
          parsed.draft.selectedTemplatesForGenerate?.length
            ? parsed.draft.selectedTemplatesForGenerate
            : [DEFAULT_HALO_TEMPLATE_ID]
        );
        setTemplateId(parsed.draft.templateId || propTemplateId || DEFAULT_HALO_TEMPLATE_ID);
        persistDraftToStorage(pid, parsed.draft);
      } catch {
        // offline or API error — keep local draft only
      } finally {
        if (!cancelled) setDriveSyncReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patient.id, userEmail, propTemplateId, persistDraftToStorage]);

  // Debounced sync to Drive (Patient Notes folder) — never upload an empty workspace (would wipe cloud backup)
  useEffect(() => {
    if (!driveSyncReady) return;
    const pid = patient.id;
    const draftPayload: PatientEditorDraft = {
      pendingTranscript,
      notes,
      activeNoteIndex,
      selectedTemplatesForGenerate,
      templateId,
    };
    if (!draftHasContent(draftPayload)) return;
    const t = window.setTimeout(() => {
      const payload: ClinicalWorkspaceDraftFile = {
        savedAt: Date.now(),
        draft: draftPayload,
      };
      saveWorkspaceDraft(pid, payload).catch(() => {});
    }, 2800);
    return () => clearTimeout(t);
  }, [
    driveSyncReady,
    patient.id,
    pendingTranscript,
    notes,
    activeNoteIndex,
    selectedTemplatesForGenerate,
    templateId,
  ]);

  const toggleTemplateForGenerate = useCallback((id: string) => {
    setSelectedTemplatesForGenerate(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }, []);

  const selectAllTemplatesForGenerate = useCallback(() => {
    setSelectedTemplatesForGenerate(HALO_TEMPLATE_OPTIONS.map(t => t.id));
  }, []);

  const togglePostRecordModalTemplate = useCallback((id: string) => {
    setPostRecordTemplateSelection((sel) =>
      sel.includes(id) ? sel.filter((t) => t !== id) : [...sel, id]
    );
  }, []);

  const handleGenerateFromTemplates = useCallback(async (templateIdsOverride?: string[]) => {
    const rawDictation = pendingTranscript?.trim() ?? '';
    const templateIds = templateIdsOverride ?? selectedTemplatesForGenerate;
    if (!rawDictation) {
      onToast('No dictation to generate from.', 'info');
      return;
    }
    if (templateIds.length === 0) {
      onToast('Select at least one template.', 'info');
      return;
    }
    setStatus(AppStatus.LOADING);
    const dictationForModel = stripLeadingDictationTemplateCue(rawDictation);
    const templateNames = Object.fromEntries(HALO_TEMPLATE_OPTIONS.map(t => [t.id, t.name]));
    const inputText = buildClinicalNoteInputFromDictation(patient, dictationForModel);
    try {
      const results = await Promise.all(
        templateIds.map(id => generateNotePreview({ template_id: id, text: inputText }))
      );
      const combined: HaloNote[] = results.map((res, i) => {
        const tid = templateIds[i];
        const name = templateNames[tid] ?? tid;
        const first = res.notes?.[0];
        const content = first?.content?.trim()
          ? first.content
          : dictationForModel;
        const createdAt = new Date().toISOString();
        return {
          noteId: first?.noteId ?? `note-${tid}-${Date.now()}`,
          title: `${name} ${formatDocumentDateDisplay()}`,
          content,
          template_id: tid,
          createdAt,
          lastSavedAt: createdAt,
          dirty: false,
          ...(first?.fields && first.fields.length > 0 ? { fields: first.fields } : {}),
        };
      });
      setNotes(prev => {
        const newIdx = prev.length;
        setActiveNoteIndex(newIdx);
        return [...prev, ...combined];
      });
      setPendingTranscript(null);
      pendingTranscriptRef.current = null;
      onToast(`Generated ${combined.length} note(s). You can edit and save as DOCX.`, 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setStatus(AppStatus.IDLE);
  }, [patient, pendingTranscript, selectedTemplatesForGenerate, onToast]);

  // Autosave: every 30s mark dirty notes as saved (client-side only; no DOCX generation)
  useEffect(() => {
    if (notes.length === 0) return;
    const interval = setInterval(() => {
      setNotes(prev => {
        const hasDirty = prev.some(n => n.dirty);
        if (!hasDirty) return prev;
        return prev.map(note => note.dirty ? { ...note, lastSavedAt: new Date().toISOString(), dirty: false } : note);
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [notes.length]);

  // Chat handler — uses streaming for progressive response display
  const handleSendChat = async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: question, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);
    setChatLongWait(false);

    if (chatLongWaitTimerRef.current) clearTimeout(chatLongWaitTimerRef.current);
    chatLongWaitTimerRef.current = setTimeout(() => setChatLongWait(true), 8000);

    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() };
    setChatMessages(prev => [...prev, assistantPlaceholder]);

    try {
      await askHaloStream(
        patient.id,
        question,
        chatMessagesRef.current,
        (chunk) => {
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            }
            return prev;
          });
        }
      );
    } catch (err) {
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          return [...prev.slice(0, -1), {
            ...last,
            content: 'Sorry, I encountered an error. Please try again.',
          }];
        }
        return prev;
      });
      onToast(getErrorMessage(err), 'error');
    } finally {
      setChatLoading(false);
      setChatLongWait(false);
      if (chatLongWaitTimerRef.current) {
        clearTimeout(chatLongWaitTimerRef.current);
        chatLongWaitTimerRef.current = null;
      }
    }
  };

  // Create folder handler
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(currentFolderId, name);
      setShowCreateFolderModal(false);
      setNewFolderName("");
      await loadFolderContents(currentFolderId);
      onToast(`Folder "${name}" created.`, 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const startEditPatient = () => {
    setEditName(patient.name);
    setEditDob(patient.dob);
    setEditSex(patient.sex || 'M');
    setEditFolderNumber(patient.folderNumber ?? '');
    setEditContactNumber(patient.contactNumber ?? '');
    setEditingPatient(true);
  };

  const savePatientEdit = async () => {
    if (!editName.trim() || !editDob) return;
    try {
      await updatePatient(patient.id, {
        name: editName,
        dob: editDob,
        sex: editSex,
        folderNumber: editFolderNumber.trim(),
        contactNumber: editContactNumber.trim(),
      });
      setEditingPatient(false);
      onDataChange();
      onToast('Patient details updated.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const handleSendDriveFileEmail = useCallback(async () => {
    const f = driveFileEmailTarget;
    if (!f || !userEmail?.trim()) return;
    setDriveFileEmailSending(true);
    try {
      const res = await sendWorkspaceFileEmail({
        fileId: f.id,
        fileName: f.name,
        mimeType: f.mimeType,
        fileUrl: f.url,
        patient: patientChartPayload,
      });
      setDriveFileEmailTarget(null);
      onToast(res.message?.trim() ? res.message : `Email sent to ${userEmail}`, 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setDriveFileEmailSending(false);
  }, [driveFileEmailTarget, userEmail, patientChartPayload, onToast]);

  const isPatientNotesSystemFolder = (f: DriveFile) =>
    f.mimeType === FOLDER_MIME_TYPE && f.name === 'Patient Notes';

  const startEditFile = (file: DriveFile) => {
    if (isPatientNotesSystemFolder(file)) {
      onToast('The Patient Notes folder cannot be renamed (used for clinical notes).', 'info');
      return;
    }
    setEditingFile(file);
    setEditFileName(file.name);
  };

  const saveFileEdit = async () => {
    if (!editingFile || !editFileName.trim()) return;
    try {
      await updateFileMetadata(patient.id, editingFile.id, editFileName);

      const crumbIndex = breadcrumbs.findIndex(b => b.id === editingFile.id);
      if (crumbIndex >= 0) {
        setBreadcrumbs(prev => prev.map((b, i) => i === crumbIndex ? { ...b, name: editFileName } : b));
      }

      setEditingFile(null);
      await loadFolderContents(currentFolderId);
      onDataChange();
      onToast('Item renamed.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    if (isPatientNotesSystemFolder(fileToDelete)) {
      onToast('The Patient Notes folder cannot be deleted (used for clinical notes).', 'info');
      setFileToDelete(null);
      return;
    }
    try {
      await deleteFile(fileToDelete.id);
      setFileToDelete(null);
      await loadFolderContents(currentFolderId);
      const kind = fileToDelete.mimeType === FOLDER_MIME_TYPE ? 'Folder' : 'File';
      onToast(`${kind} moved to trash.`, 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const hasAiContent = alerts.length > 0 || summary.length > 0;
  const emailActionsBusy = status === AppStatus.FILING || status === AppStatus.SAVING;
  const stickyEmailDisabled = emailActionsBusy || !userEmail?.trim();
  const patientAgeDisplay = formatAgeFromIsoDob(patient.dob);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white relative w-full max-w-[100vw]">
      {/* Header */}
      <div className="border-b border-slate-200 px-4 md:px-8 py-4 safe-pad-t flex flex-col md:flex-row md:justify-between md:items-start bg-white shadow-sm z-10 gap-4 shrink-0">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="md:hidden mt-1 p-2 -ml-2 text-slate-500 hover:text-teal-600 rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="group relative">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight leading-tight">{patient.name}</h1>
              <button onClick={startEditPatient} className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-full">
                <Pencil size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500 mt-2 font-medium">
              {patient.folderNumber?.trim() ? (
                <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                  <Hash className="w-3.5 h-3.5 shrink-0" /> Folder no. {patient.folderNumber.trim()}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                <Calendar className="w-3.5 h-3.5 shrink-0" /> DOB {patient.dob}
              </span>
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                Age: {patientAgeDisplay}
              </span>
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap">Sex: {patient.sex || 'Unknown'}</span>
              {patient.contactNumber?.trim() ? (
                <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                  <Phone className="w-3.5 h-3.5 shrink-0" /> {patient.contactNumber.trim()}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap"><Clock className="w-3.5 h-3.5 shrink-0" /> Last: {patient.lastVisit}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-auto">
          {status === AppStatus.UPLOADING ? (
            <div className="w-48">
              <div className="flex justify-between text-xs font-semibold text-teal-700 mb-1">
                <span>Uploading...</span><span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-teal-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={openUploadPicker}
                className="w-full md:w-auto flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg cursor-pointer transition-all shadow-md shadow-teal-600/20 text-sm font-semibold"
              >
                <Upload className="w-4 h-4" /> Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              />
            </>
          )}
          {uploadMessage && status !== AppStatus.UPLOADING && (
            <div className="w-full md:w-auto flex items-center gap-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" /> {uploadMessage}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-8 bg-slate-50/50">
        <div className="max-w-6xl mx-auto">
          {/* AI Panel */}
          {hasAiContent && showAiPanel && (
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Insights</span>
                <button onClick={() => setShowAiPanel(false)} className="text-xs font-medium text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-slate-100">
                  <X size={12} /> Hide
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SmartSummary summary={summary} loading={status === AppStatus.LOADING} />
                {alerts.length > 0 && <div><LabAlerts alerts={alerts} /></div>}
              </div>
            </div>
          )}

          {hasAiContent && !showAiPanel && (
            <div className="mb-4">
              <button onClick={() => setShowAiPanel(true)} className="text-xs font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-100">
                Show HALO AI Insights
              </button>
            </div>
          )}

          {/* Tabs + persistent Email (any tab, when notes exist) */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 mb-6">
            <div className="flex gap-6 md:gap-8 overflow-x-auto min-w-0 pb-px [-webkit-overflow-scrolling:touch]">
              <button type="button" onClick={() => setWorkspaceTab('overview')} className={`pb-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide whitespace-nowrap shrink-0 ${activeTab === 'overview' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Active Workspace</button>
              <button type="button" onClick={() => setWorkspaceTab('notes')} className={`pb-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide whitespace-nowrap shrink-0 ${activeTab === 'notes' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Editor &amp; Scribe</button>
              <button type="button" onClick={() => setWorkspaceTab('chat')} className={`pb-3 text-sm font-bold border-b-2 transition-colors uppercase tracking-wide whitespace-nowrap flex items-center gap-1.5 shrink-0 ${activeTab === 'chat' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <MessageCircle size={14} /> Ask HALO
              </button>
            </div>
            <button
              type="button"
              onClick={() => void openEmailFromToolbar()}
              disabled={stickyEmailDisabled}
              title={
                !userEmail?.trim()
                  ? 'Sign in with Google to enable email'
                  : 'Email note, dictation, or patient chart details to your inbox'
              }
              className="shrink-0 flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-all shadow-sm border border-slate-600/80 sm:mb-0.5"
            >
              <Mail className="w-4 h-4 shrink-0" aria-hidden />
              Email
            </button>
          </div>

          {activeTab === 'overview' ? (
            <FileBrowser
              files={filesForBrowser}
              status={status}
              breadcrumbs={breadcrumbs}
              onNavigateToFolder={navigateToFolder}
              onNavigateBack={navigateBack}
              onNavigateToBreadcrumb={navigateToBreadcrumb}
              onStartEditFile={startEditFile}
              onDeleteFile={setFileToDelete}
              onViewFile={setViewingFile}
              onCreateFolder={() => setShowCreateFolderModal(true)}
              onEmailFile={(file) => {
                if (!userEmail?.trim()) {
                  onToast('Your Google email is not available. Sign out and sign in again.', 'error');
                  return;
                }
                setShowEmailNoteModal(false);
                setDriveFileEmailTarget(file);
              }}
              isFolderProtected={isPatientNotesSystemFolder}
            />
          ) : activeTab === 'notes' ? (
            pendingTranscript ? (
              <div className="min-h-[240px] h-[min(600px,calc(100dvh-12rem))] max-h-[85dvh] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Generate clinical note</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    {HALO_TEMPLATE_OPTIONS.length > 1
                      ? 'Select which note types to generate from your dictation. Each will appear as a separate tab for editing.'
                      : 'Your dictation will be turned into a Clinical Note (Jess) for this patient.'}
                  </p>
                  {HALO_TEMPLATE_OPTIONS.length > 1 ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {HALO_TEMPLATE_OPTIONS.map((t) => {
                        const selected = selectedTemplatesForGenerate.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTemplateForGenerate(t.id)}
                            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border shadow-sm whitespace-nowrap ${
                              selected
                                ? 'bg-teal-50 border-teal-300 text-teal-800 ring-2 ring-teal-200'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 mb-4 font-medium">{HALO_TEMPLATE_OPTIONS[0]?.name ?? 'Clinical note'}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {HALO_TEMPLATE_OPTIONS.length > 1 ? (
                      <button
                        type="button"
                        onClick={selectAllTemplatesForGenerate}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
                      >
                        Select all
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleGenerateFromTemplates()}
                      disabled={selectedTemplatesForGenerate.length === 0 || status === AppStatus.LOADING}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm border border-teal-600"
                    >
                      {status === AppStatus.LOADING
                        ? 'Generating…'
                        : HALO_TEMPLATE_OPTIONS.length > 1
                          ? `Generate ${selectedTemplatesForGenerate.length} note(s)`
                          : 'Generate note'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingTranscript(null);
                        pendingTranscriptRef.current = null;
                        setPostRecordTemplateModalOpen(false);
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!userEmail?.trim()) {
                          onToast('Your Google email is not available. Sign out and sign in again.', 'error');
                          return;
                        }
                        if (!(pendingTranscript ?? '').trim()) {
                          onToast('No dictation to send yet.', 'info');
                          return;
                        }
                        setDriveFileEmailTarget(null);
                        setEmailComposeMode('transcript');
                        setEmailNoteIndex(0);
                        setShowEmailNoteModal(true);
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-600 text-white border border-slate-600 hover:bg-slate-700 transition shadow-sm flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4 shrink-0" aria-hidden />
                      Email dictation
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-auto bg-slate-50">
                  <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/90 px-4 py-3 text-sm text-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-teal-800 uppercase tracking-wider mb-2">
                      Patient on chart (sent with generate &amp; email)
                    </p>
                    <p><span className="font-semibold text-slate-700">Name:</span> {patient.name}</p>
                    <p><span className="font-semibold text-slate-700">DOB:</span> {patient.dob}</p>
                    <p><span className="font-semibold text-slate-700">Age:</span> {patientAgeDisplay}</p>
                    <p><span className="font-semibold text-slate-700">Sex:</span> {patient.sex || '—'}</p>
                    {patient.folderNumber?.trim() ? (
                      <p><span className="font-semibold text-slate-700">Folder no.:</span> {patient.folderNumber.trim()}</p>
                    ) : null}
                    {patient.contactNumber?.trim() ? (
                      <p><span className="font-semibold text-slate-700">Contact:</span> {patient.contactNumber.trim()}</p>
                    ) : null}
                    <p className="text-xs text-teal-900/80 mt-2 leading-snug">
                      These details are merged into generated notes, DOCX, and emails so templates stay aligned with the chart.
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Transcript preview</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{pendingTranscript}</p>
                </div>
              </div>
            ) : notes.length === 0 ? (
              <div className="min-h-[240px] h-[min(600px,calc(100dvh-12rem))] max-h-[85dvh] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex-1 flex items-center justify-center text-slate-400 px-4">
                  <p className="text-sm">No notes yet. Use the Scribe to dictate, then choose templates to generate notes.</p>
                </div>
              </div>
            ) : (
              <NoteEditor
                notes={notes}
                activeIndex={activeNoteIndex}
                onActiveIndexChange={setActiveNoteIndex}
                onNoteChange={handleNoteChange}
                status={status}
                templateId={templateId}
                templateOptions={HALO_TEMPLATE_OPTIONS}
                onTemplateChange={setTemplateId}
                onSaveAsDocx={handleSaveAsDocx}
                onSaveAll={handleSaveAll}
                onEmail={handleEmail}
                savingNoteIndex={savingNoteIndex}
              />
            )
          ) : (
            <PatientChat
              patientName={patient.name}
              chatMessages={chatMessages}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              chatLoading={chatLoading}
              chatLongWait={chatLongWait}
              onSendChat={handleSendChat}
            />
          )}
        </div>
      </div>

      {/* After recording: pick note type when dictation did not name one */}
      {postRecordTemplateModalOpen && HALO_TEMPLATE_OPTIONS.length > 1 ? (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-md sm:m-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Which note type?</h3>
            <p className="text-xs text-slate-500 mb-4">
              Your dictation did not say echo report, rooms consult, or report. Choose one or more — you can also say that at the start next time to skip this step.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {HALO_TEMPLATE_OPTIONS.map((t) => {
                const selected = postRecordTemplateSelection.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => togglePostRecordModalTemplate(t.id)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border shadow-sm whitespace-nowrap ${
                      selected
                        ? 'bg-teal-50 border-teal-300 text-teal-800 ring-2 ring-teal-200'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setPostRecordTemplateModalOpen(false);
                  setSelectedTemplatesForGenerate([DEFAULT_HALO_TEMPLATE_ID]);
                }}
              >
                Use default ({HALO_TEMPLATE_OPTIONS.find((t) => t.id === DEFAULT_HALO_TEMPLATE_ID)?.name ?? 'Rooms Consult'})
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                disabled={postRecordTemplateSelection.length === 0 || status === AppStatus.LOADING}
                onClick={() => {
                  if (postRecordTemplateSelection.length === 0) return;
                  setSelectedTemplatesForGenerate(postRecordTemplateSelection);
                  setPostRecordTemplateModalOpen(false);
                }}
              >
                Continue to transcript
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-teal-600 text-white border border-teal-600 hover:bg-teal-700 disabled:opacity-50"
                disabled={postRecordTemplateSelection.length === 0 || status === AppStatus.LOADING}
                onClick={() => {
                  if (postRecordTemplateSelection.length === 0) return;
                  const ids = [...postRecordTemplateSelection];
                  setSelectedTemplatesForGenerate(ids);
                  setPostRecordTemplateModalOpen(false);
                  void handleGenerateFromTemplates(ids);
                }}
              >
                Generate now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* EDIT PATIENT MODAL */}
      {editingPatient && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto sm:m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Edit Patient Details</h3>
              <button onClick={() => setEditingPatient(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Full Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Date of Birth</label>
                <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Sex</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button type="button" onClick={() => setEditSex('M')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editSex === 'M' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>M</button>
                  <button type="button" onClick={() => setEditSex('F')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editSex === 'F' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>F</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Folder / file number</label>
                <input type="text" value={editFolderNumber} onChange={e => setEditFolderNumber(e.target.value)} placeholder="e.g. MRN, ward file no." className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Contact number</label>
                <input type="tel" value={editContactNumber} onChange={e => setEditContactNumber(e.target.value)} placeholder="Phone or mobile" className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingPatient(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button type="button" onClick={() => void savePatientEdit()} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto sm:m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                Rename {isFolder(editingFile) ? 'Folder' : 'File'}
              </h3>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Name</label>
                <input type="text" value={editFileName} onChange={e => setEditFileName(e.target.value)} className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingFile(null)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button onClick={saveFileEdit} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE FILE CONFIRMATION MODAL */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[90dvh] overflow-y-auto p-6 sm:m-4 border-2 border-rose-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mb-3 text-rose-500">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {fileToDelete.mimeType === FOLDER_MIME_TYPE ? 'Delete folder?' : 'Delete file?'}
              </h3>
              <p className="text-slate-500 mt-2 text-sm px-4">
                Move <span className="font-bold text-slate-700">{fileToDelete.name}</span> to Google Drive trash?
                {fileToDelete.mimeType === FOLDER_MIME_TYPE && (
                  <span className="block mt-2 text-xs text-slate-400">Everything inside this folder will also be trashed.</span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFileToDelete(null)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button onClick={confirmDeleteFile} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {status === AppStatus.ANALYZING && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-teal-900 font-bold text-lg mt-6">HALO is analyzing...</p>
          <p className="text-slate-500 text-sm mt-1">Extracting clinical concepts &amp; tagging files</p>
        </div>
      )}

      {status === AppStatus.SAVING && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-teal-900 font-bold text-lg mt-6">Saving note as DOCX...</p>
          <p className="text-slate-500 text-sm mt-1">Uploading to Patient Notes folder</p>
        </div>
      )}

      {/* UPLOAD DESTINATION PICKER MODAL */}
      {showUploadPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto sm:m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Upload Destination</h3>
              <button onClick={() => setShowUploadPicker(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Uploading to:</label>
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 px-3 py-2 rounded-lg">
                <FolderOpen size={16} className="text-teal-600 shrink-0" />
                <span className="text-sm font-semibold text-teal-700 truncate">{uploadTargetLabel}</span>
              </div>
            </div>
            <div className="mb-4">
              {uploadPickerLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={20} className="text-teal-500 animate-spin" />
                </div>
              ) : uploadPickerFolders.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-100 rounded-lg p-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1">Or choose a subfolder:</p>
                  {uploadPickerFolders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => selectUploadFolder(folder)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700 transition-colors"
                    >
                      <FolderOpen size={15} className="text-teal-500 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                      <ChevronRight size={14} className="text-slate-300 ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">No subfolders available</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowUploadPicker(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button onClick={confirmUploadDestination} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition flex items-center justify-center gap-2">
                <Upload size={16} /> Choose File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILE VIEWER MODAL */}
      {viewingFile && (
        <FileViewer
          fileId={viewingFile.id}
          fileName={viewingFile.name}
          mimeType={viewingFile.mimeType}
          fileUrl={viewingFile.url}
          onClose={() => setViewingFile(null)}
        />
      )}

      {/* EMAIL WORKSPACE FILE (Active Workspace) */}
      {driveFileEmailTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto sm:m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Email document</h3>
              <button
                type="button"
                onClick={() => setDriveFileEmailTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Send <span className="font-semibold text-slate-800">{driveFileEmailTarget.name}</span> to{' '}
              <span className="font-semibold text-slate-800">{userEmail}</span>.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Sends this file as an attachment when possible; the message body stays short (link + filing details, not the full document text). Separate from <strong>Editor &amp; Scribe</strong> clinical note email.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDriveFileEmailTarget(null)}
                className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSendDriveFileEmail()}
                disabled={driveFileEmailSending || !userEmail?.trim()}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-slate-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {driveFileEmailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail size={16} />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL NOTE MODAL */}
      {showEmailNoteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto sm:m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {emailComposeMode === 'note'
                  ? 'Email note'
                  : emailComposeMode === 'transcript'
                    ? 'Email dictation'
                    : 'Email patient chart'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEmailNoteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {emailComposeMode === 'note' && (
                <>
                  Sends a Word (.docx) attachment when generation succeeds; the email body is only a short header (no duplicate of the full note text). Sent to{' '}
                  <span className="font-semibold text-slate-700">{userEmail}</span>.
                </>
              )}
              {emailComposeMode === 'transcript' && (
                <>
                  Sends a Word attachment when your template can build one; otherwise the full dictation (with patient identifiers) is in the message. Sent to{' '}
                  <span className="font-semibold text-slate-700">{userEmail}</span>.
                </>
              )}
              {emailComposeMode === 'chart_only' && (
                <>
                  Sends <span className="font-semibold text-slate-700">patient identifiers</span> from this chart (name, DOB, sex) to{' '}
                  <span className="font-semibold text-slate-700">{userEmail}</span>—useful when you have not dictated or written a note yet.
                </>
              )}{' '}
              Outgoing mail uses your configured SMTP (e.g. Outlook).
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEmailNoteModal(false)}
                className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSendNoteEmail()}
                disabled={emailNoteSending || !userEmail?.trim()}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-slate-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {emailNoteSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail size={16} />}
                Send to my email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE FOLDER MODAL */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 safe-pad-b">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto sm:m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">New Folder</h3>
              <button onClick={() => { setShowCreateFolderModal(false); setNewFolderName(""); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Creating folder in:</label>
                <p className="text-sm font-semibold text-teal-700 bg-teal-50 px-3 py-2 rounded-lg border border-teal-100">
                  {breadcrumbs.map(b => b.name).join(' / ')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
                  placeholder="e.g. Lab Results, Imaging..."
                  className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-base text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowCreateFolderModal(false); setNewFolderName(""); }} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <FolderPlus size={16} /> Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
