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
  currentPatientId: string | null;
  currentPatientName: string | null;
  onError: (message: string) => void;
  onTranscriptionQueued: () => void;
}

export const MultiSessionScribe: React.FC<Props> = ({
  currentPatientId,
  currentPatientName,
  onError,
  onTranscriptionQueued,
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
    processingPatientId,
  } = useRecordingSessions();

  const [longWait, setLongWait] = useState(false);
  const longWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPatientRef = useRef<string | null>(null);

  useEffect(() => {
    if (processingPatientId) {
      longWaitRef.current = setTimeout(() => setLongWait(true), 10_000);
    } else {
      setLongWait(false);
      if (longWaitRef.current) clearTimeout(longWaitRef.current);
    }
    return () => {
      if (longWaitRef.current) clearTimeout(longWaitRef.current);
    };
  }, [processingPatientId]);

  /** Switching patients: park live capture so mic can be used on the next chart */
  useEffect(() => {
    const prev = prevPatientRef.current;
    prevPatientRef.current = currentPatientId;
    if (
      prev &&
      prev !== currentPatientId &&
      activeRecordingPatientId === prev &&
      (isLiveCapturing || isMicHeldPaused)
    ) {
      parkRecording(prev).catch(() => {});
    }
  }, [currentPatientId, activeRecordingPatientId, isLiveCapturing, isMicHeldPaused, parkRecording]);

  const activeCount = sessions.filter(
    (s) => s.status === 'paused' || s.status === 'recording' || s.status === 'recording_paused' || s.status === 'processing'
  ).length;

  const forCurrentPatient = currentPatientId
    ? sessions.find((s) => s.patientId === currentPatientId)
    : null;

  const isThisPatientRecording =
    !!currentPatientId && activeRecordingPatientId === currentPatientId;

  const handleMainFab = async () => {
    if (!currentPatientId || !currentPatientName) {
      onError('Select a patient to record.');
      return;
    }
    try {
      await startOrResume(currentPatientId, currentPatientName);
    } catch {
      onError('Could not start recording. Check microphone permission.');
    }
  };

  const handlePark = async () => {
    if (!currentPatientId) return;
    try {
      await parkRecording(currentPatientId);
    } catch {
      onError('Could not pause recording.');
    }
  };

  const handleFinishCurrent = async () => {
      if (!currentPatientId) return;
      try {
        await finishAndTranscribe(currentPatientId);
        onTranscriptionQueued();
      } catch {
        onError('Transcription failed. Try again or check your API keys.');
      }
  };

  const fabDisabled = !!processingPatientId;

  return (
    <>
      {/* Compact indicators above FAB */}
      <div className="fixed z-50 flex flex-col items-end gap-2 bottom-[max(5.5rem,calc(1.5rem+env(safe-area-inset-bottom)))] right-[max(1rem,env(safe-area-inset-right))] sm:bottom-[5.25rem] sm:right-6 max-w-[min(100vw-1rem,18rem)]">
        {processingPatientId && (
          <div className="bg-white border border-sky-200 shadow-lg rounded-2xl px-3 py-2 text-right">
            <div className="flex items-center gap-2 justify-end">
              <Wand2 className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
              <span className="text-[11px] font-bold text-sky-800">Transcribing…</span>
            </div>
            {longWait && (
              <p className="text-[9px] text-slate-500 mt-1">May take 15–60 s.</p>
            )}
          </div>
        )}

        {isThisPatientRecording && (isLiveCapturing || isMicHeldPaused) && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {isLiveCapturing && (
              <button
                type="button"
                onClick={holdRecording}
                className="touch-manipulation bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl shadow-md flex items-center gap-1"
              >
                <Pause className="w-3.5 h-3.5" /> Hold
              </button>
            )}
            {isMicHeldPaused && (
              <button
                type="button"
                onClick={resumeHeldRecording}
                className="touch-manipulation bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl shadow-md flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5" /> Mic on
              </button>
            )}
            <button
              type="button"
              onClick={handlePark}
              className="touch-manipulation bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wide px-3 py-2 rounded-xl shadow-md flex items-center gap-1"
              title="Save this segment and free the mic for another patient"
            >
              <ParkingSquare className="w-3.5 h-3.5" /> Park
            </button>
          </div>
        )}

        {forCurrentPatient &&
          forCurrentPatient.segmentCount > 0 &&
          !isThisPatientRecording &&
          forCurrentPatient.status !== 'processing' && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                onClick={handleMainFab}
                className="touch-manipulation bg-sky-100 border border-sky-200 text-sky-900 text-[11px] font-bold px-3 py-2 rounded-xl shadow-sm flex items-center gap-1"
              >
                <Mic className="w-3.5 h-3.5" /> Resume dictation
              </button>
              <button
                type="button"
                onClick={handleFinishCurrent}
                disabled={!!processingPatientId}
                className="touch-manipulation bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-2 rounded-xl shadow-md flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Finish &amp; transcribe
              </button>
            </div>
          )}

        <button
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          className="touch-manipulation bg-white border border-slate-200 text-slate-700 text-[11px] font-bold px-3 py-2 rounded-xl shadow-md flex items-center gap-1.5"
        >
          <ListMusic className="w-4 h-4 text-sky-600" />
          Sessions
          {activeCount > 0 && (
            <span className="bg-sky-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Main FAB */}
      <div className="fixed z-50 flex flex-col items-end gap-2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] sm:bottom-6 sm:right-6">
        {isThisPatientRecording && isLiveCapturing && (
          <div className="bg-white border border-red-200 shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2 animate-in fade-in">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Live</span>
          </div>
        )}
        {isThisPatientRecording && isMicHeldPaused && (
          <div className="bg-white border border-amber-200 shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2">
            <Pause className="w-3 h-3 text-amber-600" />
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Held</span>
          </div>
        )}

        <button
          type="button"
          onClick={
            isThisPatientRecording && (isLiveCapturing || isMicHeldPaused)
              ? handleFinishCurrent
              : handleMainFab
          }
          disabled={fabDisabled || (!currentPatientId && !isThisPatientRecording)}
          title={
            isThisPatientRecording && (isLiveCapturing || isMicHeldPaused)
              ? 'Finish & send all segments to transcribe'
              : 'Start or resume dictation for this patient'
          }
          className={`flex items-center justify-center rounded-full shadow-lg transition-all duration-200 touch-manipulation min-w-[48px] min-h-[48px] w-14 h-14 sm:w-12 sm:h-12 ${
            isThisPatientRecording && (isLiveCapturing || isMicHeldPaused)
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : fabDisabled
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-700 text-white hover:scale-105 active:scale-95'
          }`}
        >
          {fabDisabled ? (
            <Wand2 className="w-5 h-5 animate-spin" />
          ) : isThisPatientRecording && (isLiveCapturing || isMicHeldPaused) ? (
            <Check className="w-6 h-6" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Sessions drawer */}
      {panelOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-slate-900/40"
            aria-hidden
            onClick={closePanel}
          />
          <div className="fixed z-[56] left-2 right-2 sm:left-auto sm:right-4 sm:w-96 max-h-[min(70dvh,32rem)] bottom-[max(5.5rem,env(safe-area-inset-bottom))] sm:bottom-[5.5rem] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden safe-pad-b animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Recording sessions</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Park frees the mic for another patient. Finish merges all segments.
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2 min-h-0">
              {sessions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 px-4">
                  No active recordings. Open a patient and tap the mic.
                </p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.patientId}
                    className={`rounded-xl border p-3 ${
                      s.patientId === currentPatientId ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{s.patientName}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">
                          {s.status.replace('_', ' ')} · {s.segmentCount} segment{s.segmentCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end shrink-0">
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
                            className="text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg bg-sky-600 text-white"
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
                            disabled={!!processingPatientId}
                            className="text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                          >
                            Transcribe
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => discardSession(s.patientId)}
                          className="text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center gap-0.5"
                        >
                          <Trash2 className="w-3 h-3" /> Discard
                        </button>
                      </div>
                    </div>
                    {activeRecordingPatientId === s.patientId && (isLiveCapturing || isMicHeldPaused) && (
                      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
                        {isLiveCapturing && (
                          <button
                            type="button"
                            onClick={holdRecording}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500 text-white"
                          >
                            Hold
                          </button>
                        )}
                        {isMicHeldPaused && (
                          <button
                            type="button"
                            onClick={resumeHeldRecording}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-600 text-white"
                          >
                            Mic on
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => parkRecording(s.patientId)}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-700 text-white"
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
