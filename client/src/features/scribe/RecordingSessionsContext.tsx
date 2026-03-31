import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { transcribeAudio } from '../../services/api';

export type SessionPublicStatus = 'idle' | 'recording' | 'recording_paused' | 'paused' | 'processing';

export interface RecordingSessionMeta {
  patientId: string;
  patientName: string;
  status: SessionPublicStatus;
  segmentCount: number;
  updatedAt: number;
}

/** One contiguous capture (until park / switch patient / finish) */
interface AudioSegment {
  blob: Blob;
  mimeType: string;
}

interface RecordingSessionsValue {
  sessions: RecordingSessionMeta[];
  activeRecordingPatientId: string | null;
  openPanel: () => void;
  closePanel: () => void;
  panelOpen: boolean;
  startOrResume: (patientId: string, patientName: string) => Promise<void>;
  holdRecording: () => void;
  resumeHeldRecording: () => void;
  parkRecording: (patientId: string) => Promise<void>;
  finishAndTranscribe: (patientId: string) => Promise<void>;
  discardSession: (patientId: string) => Promise<void>;
  isLiveCapturing: boolean;
  isMicHeldPaused: boolean;
  processingPatientId: string | null;
  /** Increments when a new transcript is ready — use in useEffect deps */
  transcriptionNotify: number;
  /** Atomically take the transcript for this patient only (once). */
  consumeTranscriptionForPatient: (patientId: string) => string | null;
  /** Register to receive transcript as soon as it is ready (avoids lost updates vs effect timing). Returns unsubscribe. */
  subscribeTranscription: (patientId: string, listener: (text: string) => void) => () => void;
}

const RecordingSessionsContext = createContext<RecordingSessionsValue | null>(null);

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onloadend = () => {
      const r = reader.result as string;
      resolve(r.split(',')[1] || '');
    };
    reader.readAsDataURL(blob);
  });
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
  return 'audio/webm';
}

export function RecordingSessionsProvider({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [sessionTick, setSessionTick] = useState(0);
  const [liveTick, setLiveTick] = useState(0);
  const [processingPatientId, setProcessingPatientId] = useState<string | null>(null);
  const [transcriptionNotify, setTranscriptionNotify] = useState(0);
  /** Synchronous store when no active listener (e.g. chart not open yet). */
  const pendingTranscriptsRef = useRef<Map<string, string>>(new Map());
  const transcriptionListenersRef = useRef<Map<string, Set<(text: string) => void>>>(new Map());

  const segmentsRef = useRef<Record<string, AudioSegment[]>>({});
  const recordingPatientIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmentChunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const patientNamesRef = useRef<Record<string, string>>({});

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const bump = useCallback(() => {
    setSessionTick((v) => v + 1);
    setLiveTick((v) => v + 1);
  }, []);

  const ensureName = (id: string, name: string) => {
    patientNamesRef.current[id] = name;
  };

  const flushActiveMediaRecorder = useCallback(async (): Promise<void> => {
    const mr = mediaRecorderRef.current;
    const pid = recordingPatientIdRef.current;
    if (!mr || mr.state === 'inactive' || !pid) {
      mediaRecorderRef.current = null;
      recordingPatientIdRef.current = null;
      stopTracks();
      return;
    }

    await new Promise<void>((resolve) => {
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) segmentChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        if (segmentChunksRef.current.length > 0) {
          const blob = new Blob(segmentChunksRef.current, { type: mimeRef.current });
          if (!segmentsRef.current[pid]) segmentsRef.current[pid] = [];
          segmentsRef.current[pid].push({ blob, mimeType: mimeRef.current });
          segmentChunksRef.current = [];
        }
        resolve();
      };
      try {
        mr.requestData?.();
      } catch {
        /* ignore */
      }
      mr.stop();
    });

    mediaRecorderRef.current = null;
    recordingPatientIdRef.current = null;
    stopTracks();
  }, []);

  const attachRecorder = useCallback(async (patientId: string, patientName: string) => {
    ensureName(patientId, patientName);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mimeType = pickMimeType();
    mimeRef.current = mimeType;
    segmentChunksRef.current = [];

    const mr = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mr;
    recordingPatientIdRef.current = patientId;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) segmentChunksRef.current.push(e.data);
    };

    mr.start(250);
  }, []);

  const startOrResume = useCallback(
    async (patientId: string, patientName: string) => {
      ensureName(patientId, patientName);
      const currentPid = recordingPatientIdRef.current;
      const mr = mediaRecorderRef.current;

      if (currentPid === patientId && mr) {
        if (mr.state === 'paused') {
          mr.resume();
          bump();
          return;
        }
        if (mr.state === 'recording') {
          return;
        }
      }

      if (currentPid && currentPid !== patientId) {
        await flushActiveMediaRecorder();
      }

      try {
        await attachRecorder(patientId, patientName);
        bump();
      } catch {
        throw new Error('Microphone access denied or unavailable.');
      }
    },
    [attachRecorder, bump, flushActiveMediaRecorder]
  );

  const holdRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') {
      mr.pause();
      bump();
    }
  }, [bump]);

  const resumeHeldRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'paused') {
      mr.resume();
      bump();
    }
  }, [bump]);

  const parkRecording = useCallback(
    async (patientId: string) => {
      if (recordingPatientIdRef.current === patientId) {
        await flushActiveMediaRecorder();
        bump();
      }
    },
    [bump, flushActiveMediaRecorder]
  );

  const discardSession = useCallback(
    async (patientId: string) => {
      if (recordingPatientIdRef.current === patientId) {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state !== 'inactive') {
          await new Promise<void>((resolve) => {
            mr.onstop = () => resolve();
            segmentChunksRef.current = [];
            try {
              mr.stop();
            } catch {
              resolve();
            }
          });
        }
        mediaRecorderRef.current = null;
        recordingPatientIdRef.current = null;
        stopTracks();
      }
      delete segmentsRef.current[patientId];
      delete patientNamesRef.current[patientId];
      bump();
    },
    [bump]
  );

  const finishAndTranscribe = useCallback(
    async (patientId: string) => {
      ensureName(patientId, patientNamesRef.current[patientId] || 'Patient');
      if (recordingPatientIdRef.current === patientId) {
        await flushActiveMediaRecorder();
      }

      const segs = segmentsRef.current[patientId];
      if (!segs?.length) {
        bump();
        return;
      }

      setProcessingPatientId(patientId);
      try {
        /** Transcribe each park/session chunk separately — merged WebM blobs often decode as one repeated clip. */
        const parts: string[] = [];
        for (const seg of segs) {
          if (!seg.blob?.size) continue;
          const base64 = await blobToBase64(seg.blob);
          if (!base64) continue;
          const t = (await transcribeAudio(base64, seg.mimeType || 'audio/webm')).trim();
          if (t) parts.push(t);
        }

        delete segmentsRef.current[patientId];

        const transcript = parts.join('\n\n');
        if (!transcript) {
          throw new Error('No speech detected in recordings.');
        }

        const listeners = transcriptionListenersRef.current.get(patientId);
        if (listeners && listeners.size > 0) {
          listeners.forEach((fn) => {
            try {
              fn(transcript);
            } catch {
              /* listener error — still offer pending fallback */
              pendingTranscriptsRef.current.set(patientId, transcript);
            }
          });
        } else {
          pendingTranscriptsRef.current.set(patientId, transcript);
        }
        setTranscriptionNotify((n) => n + 1);
      } catch (e) {
        throw e;
      } finally {
        setProcessingPatientId(null);
        bump();
      }
    },
    [bump, flushActiveMediaRecorder]
  );

  const consumeTranscriptionForPatient = useCallback((patientId: string): string | null => {
    const m = pendingTranscriptsRef.current;
    const text = m.get(patientId);
    if (text === undefined) return null;
    m.delete(patientId);
    return text;
  }, []);

  const subscribeTranscription = useCallback((patientId: string, listener: (text: string) => void) => {
    let set = transcriptionListenersRef.current.get(patientId);
    if (!set) {
      set = new Set();
      transcriptionListenersRef.current.set(patientId, set);
    }
    set.add(listener);
    return () => {
      const s = transcriptionListenersRef.current.get(patientId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) transcriptionListenersRef.current.delete(patientId);
    };
  }, []);

  const sessions: RecordingSessionMeta[] = useMemo(() => {
    void sessionTick;
    void liveTick;
    const out: RecordingSessionMeta[] = [];
    const activeId = recordingPatientIdRef.current;
    const mr = mediaRecorderRef.current;
    const ids = new Set([
      ...Object.keys(segmentsRef.current),
      ...(activeId ? [activeId] : []),
    ]);

    for (const patientId of ids) {
      const segs = segmentsRef.current[patientId] || [];
      const hasAudio = segs.length > 0;
      let status: SessionPublicStatus = 'idle';
      if (processingPatientId === patientId) {
        status = 'processing';
      } else if (activeId === patientId && mr && mr.state !== 'inactive') {
        if (mr.state === 'recording') status = 'recording';
        else if (mr.state === 'paused') status = 'recording_paused';
        else status = hasAudio ? 'paused' : 'idle';
      } else if (hasAudio) {
        status = 'paused';
      } else {
        status = 'idle';
      }

      if (status === 'idle' && !hasAudio && activeId !== patientId) {
        continue;
      }

      out.push({
        patientId,
        patientName: patientNamesRef.current[patientId] || 'Patient',
        status,
        segmentCount: segs.length,
        updatedAt: Date.now(),
      });
    }

    return out.sort((a, b) => a.patientName.localeCompare(b.patientName));
  }, [sessionTick, liveTick, processingPatientId]);

  const mrNow = mediaRecorderRef.current;
  const activeRecordingPatientId = recordingPatientIdRef.current;
  const isLiveCapturing = !!(mrNow && mrNow.state === 'recording');
  const isMicHeldPaused = !!(mrNow && mrNow.state === 'paused');

  const value = useMemo(
    (): RecordingSessionsValue => ({
      sessions,
      activeRecordingPatientId,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      panelOpen,
      startOrResume,
      holdRecording,
      resumeHeldRecording,
      parkRecording,
      finishAndTranscribe,
      discardSession,
      isLiveCapturing,
      isMicHeldPaused,
      processingPatientId,
      transcriptionNotify,
      consumeTranscriptionForPatient,
      subscribeTranscription,
    }),
    [
      sessions,
      activeRecordingPatientId,
      panelOpen,
      startOrResume,
      holdRecording,
      resumeHeldRecording,
      parkRecording,
      finishAndTranscribe,
      discardSession,
      isLiveCapturing,
      isMicHeldPaused,
      processingPatientId,
      transcriptionNotify,
      consumeTranscriptionForPatient,
      subscribeTranscription,
    ]
  );

  React.useEffect(() => {
    return () => {
      flushActiveMediaRecorder().catch(() => {});
    };
  }, [flushActiveMediaRecorder]);

  return <RecordingSessionsContext.Provider value={value}>{children}</RecordingSessionsContext.Provider>;
}

export function useRecordingSessions(): RecordingSessionsValue {
  const ctx = useContext(RecordingSessionsContext);
  if (!ctx) {
    throw new Error('useRecordingSessions must be used within RecordingSessionsProvider');
  }
  return ctx;
}

export function useRecordingSessionsOptional(): RecordingSessionsValue | null {
  return useContext(RecordingSessionsContext);
}
