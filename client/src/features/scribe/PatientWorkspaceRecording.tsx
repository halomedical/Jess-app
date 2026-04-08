import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Pause,
  Play,
  ParkingSquare,
  ListMusic,
  X,
  Check,
  Trash2,
  Wand2,
  ChevronDown,
} from 'lucide-react';
import { useRecordingSessions } from './RecordingSessionsContext';

interface Props {
  patientId: string;
  patientName: string;
  onError: (message: string) => void;
  onTranscriptionQueued: () => void;
  /** Placed next to Upload in the patient header */
  children: (toolbar: React.ReactNode) => React.ReactNode;
}

/**
 * Recording UI scoped to an open patient chart: compact header toolbar + sessions drawer.
 * No floating FAB or mobile bottom dock — avoids overlap with tabs and extra scrolling.
 */
export const PatientWorkspaceRecording: React.FC<Props> = ({
  patientId,
  patientName,
  onError,
  onTranscriptionQueued,
  children,
}) => {
  const {
    sessions,
    activeRecordingPatientId,
    panelOpen,
    openPanel,
    closePanel,
    startOrResume,
    holdRecording,
    resumeHeldRecording,
    parkRecording,
    finishAndTranscribe,
    discardSession,
    isLiveCapturing,
    isMicHeldPaused,
    processingPatientIds,
  } = useRecordingSessions();

  const [longWait, setLongWait] = useState(false);
  const longWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyTranscribing = processingPatientIds.size > 0;

  useEffect(() => {
    if (anyTranscribing) {
      longWaitRef.current = setTimeout(() => setLongWait(true), 10_000);
    } else {
      setLongWait(false);
      if (longWaitRef.current) clearTimeout(longWaitRef.current);
    }
    return () => {
      if (longWaitRef.current) clearTimeout(longWaitRef.current);
    };
  }, [anyTranscribing]);

  const activeCount = sessions.filter(
    (s) =>
      s.status === 'paused' ||
      s.status === 'recording' ||
      s.status === 'recording_paused' ||
      s.status === 'processing'
  ).length;

  const forCurrentPatient = sessions.find((s) => s.patientId === patientId) ?? null;

  const isThisPatientRecording = activeRecordingPatientId === patientId;

  const handleMainFab = async () => {
    try {
      await startOrResume(patientId, patientName);
    } catch {
      onError('Could not start recording. Check microphone permission.');
    }
  };

  const handlePark = async () => {
    try {
      await parkRecording(patientId);
    } catch {
      onError('Could not pause recording.');
    }
  };

  const handleFinishCurrent = async () => {
    try {
      await finishAndTranscribe(patientId);
      onTranscriptionQueued();
    } catch {
      onError('Transcription failed. Try again or check your API keys.');
    }
  };

  const currentPatientProcessing = processingPatientIds.has(patientId);
  const fabDisabled = currentPatientProcessing;

  const statusChip =
    isThisPatientRecording && isLiveCapturing ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        Live
      </span>
    ) : isThisPatientRecording && isMicHeldPaused ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
        <Pause className="h-3 w-3" />
        Held
      </span>
    ) : null;

  const toolbar = (
    <div className="flex w-full md:w-auto flex-col gap-2 md:items-end">
      {anyTranscribing && (
        <div className="flex w-full items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/95 px-2.5 py-1.5 md:max-w-md md:justify-end">
          <Wand2 className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-600" />
          <span className="text-[11px] font-bold text-teal-900">
            Transcribing{processingPatientIds.size > 1 ? ` (${processingPatientIds.size})` : ''}…
          </span>
          {longWait && <span className="text-[10px] text-slate-600">15–60s</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {statusChip}

        {isThisPatientRecording && (isLiveCapturing || isMicHeldPaused) && (
          <>
            {isLiveCapturing && (
              <button
                type="button"
                onClick={holdRecording}
                className="touch-manipulation inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg bg-amber-500 px-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:bg-amber-600"
                title="Pause microphone"
              >
                <Pause className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden min-[380px]:inline">Hold</span>
              </button>
            )}
            {isMicHeldPaused && (
              <button
                type="button"
                onClick={resumeHeldRecording}
                className="touch-manipulation inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:bg-emerald-700"
                title="Resume microphone"
              >
                <Play className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden min-[380px]:inline">Mic</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePark}
              className="touch-manipulation inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg bg-slate-800 px-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm active:bg-slate-900"
              title="Park clip and switch patient"
            >
              <ParkingSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Park</span>
            </button>
          </>
        )}

        {forCurrentPatient &&
          forCurrentPatient.segmentCount > 0 &&
          !isThisPatientRecording &&
          forCurrentPatient.status !== 'processing' && (
            <>
              <button
                type="button"
                onClick={handleMainFab}
                className="touch-manipulation inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-2.5 text-[11px] font-bold text-teal-900"
              >
                <Mic className="h-3.5 w-3.5 shrink-0" />
                Resume
              </button>
              <button
                type="button"
                onClick={handleFinishCurrent}
                disabled={currentPatientProcessing}
                className="touch-manipulation inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg bg-teal-600 px-2.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                Finish
              </button>
            </>
          )}

        <button
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          className="touch-manipulation inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-800 shadow-sm active:bg-slate-50"
          title="All recording sessions"
        >
          <ListMusic className="h-4 w-4 shrink-0 text-teal-600" />
          {activeCount > 0 && (
            <span className="min-w-[1.25rem] rounded-full bg-teal-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
        </button>

        <button
          type="button"
          onClick={
            isThisPatientRecording && (isLiveCapturing || isMicHeldPaused) ? handleFinishCurrent : handleMainFab
          }
          disabled={fabDisabled}
          title={
            isThisPatientRecording && (isLiveCapturing || isMicHeldPaused)
              ? 'Finish and transcribe'
              : 'Start dictation for this patient'
          }
          className={`touch-manipulation flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-md transition-transform active:scale-95 sm:h-10 sm:w-10 ${
            isThisPatientRecording && (isLiveCapturing || isMicHeldPaused)
              ? 'bg-emerald-600 text-white active:bg-emerald-700'
              : fabDisabled
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-teal-600 text-white active:bg-teal-700'
          }`}
        >
          {currentPatientProcessing ? (
            <Wand2 className="h-5 w-5 animate-spin" />
          ) : isThisPatientRecording && (isLiveCapturing || isMicHeldPaused) ? (
            <Check className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {children(toolbar)}

      {panelOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-slate-900/40" aria-hidden onClick={closePanel} />
          <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-2 right-2 z-[70] flex max-h-[min(72dvh,calc(100dvh-8rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-4 sm:w-96 md:bottom-auto md:top-1/2 md:h-auto md:max-h-[min(70dvh,32rem)] md:-translate-y-1/2">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Recording sessions</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Park saves the clip so you can open another patient. Finish merges segments to transcribe.
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 [-webkit-overflow-scrolling:touch]">
              {sessions.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No active recordings. Use the microphone beside Upload for this patient.
                </p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.patientId}
                    className={`rounded-xl border p-3 ${
                      s.patientId === patientId ? 'border-teal-300 bg-teal-50/50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-slate-800">{s.patientName}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                          {s.status.replace('_', ' ')} · {s.segmentCount} segment{s.segmentCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex max-w-[45%] shrink-0 flex-wrap justify-end gap-1 sm:max-w-none">
                        {s.status === 'paused' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await startOrResume(s.patientId, s.patientName);
                              } catch {
                                onError('Could not resume.');
                              }
                            }}
                            className="min-h-[40px] rounded-lg bg-teal-600 px-2 py-2 text-[10px] font-bold uppercase text-white"
                          >
                            Resume
                          </button>
                        )}
                        {s.segmentCount > 0 && s.status !== 'processing' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await finishAndTranscribe(s.patientId);
                                onTranscriptionQueued();
                                closePanel();
                              } catch {
                                onError('Transcription failed.');
                              }
                            }}
                            disabled={processingPatientIds.has(s.patientId)}
                            className="min-h-[40px] rounded-lg bg-emerald-600 px-2 py-2 text-[10px] font-bold uppercase text-white disabled:opacity-50"
                          >
                            Transcribe
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => discardSession(s.patientId)}
                          className="flex min-h-[40px] items-center gap-0.5 rounded-lg border border-rose-200 px-2 py-2 text-[10px] font-bold uppercase text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3 w-3" /> Discard
                        </button>
                      </div>
                    </div>
                    {activeRecordingPatientId === s.patientId && (isLiveCapturing || isMicHeldPaused) && (
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                        {isLiveCapturing && (
                          <button
                            type="button"
                            onClick={holdRecording}
                            className="min-h-[40px] rounded-lg bg-amber-500 px-3 py-2 text-[10px] font-bold text-white"
                          >
                            Hold
                          </button>
                        )}
                        {isMicHeldPaused && (
                          <button
                            type="button"
                            onClick={resumeHeldRecording}
                            className="min-h-[40px] rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white"
                          >
                            Mic on
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => parkRecording(s.patientId)}
                          className="min-h-[40px] rounded-lg bg-slate-700 px-3 py-2 text-[10px] font-bold text-white"
                        >
                          Park
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
