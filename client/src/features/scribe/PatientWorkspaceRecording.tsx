import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Pause,
  ListMusic,
  Upload,
  X,
  Check,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useRecordingSessions } from './RecordingSessionsContext';

interface Props {
  patientId: string;
  patientName: string;
  onError: (message: string) => void;
  onTranscriptionQueued: () => void;
  onUploadClick?: () => void;
  uploadDisabled?: boolean;
  /** Desktop header slot: toolbar + caller adds Upload next to it */
  children: (toolbar: React.ReactNode) => React.ReactNode;
}

/**
 * Recording UI for patient chart: on md+ toolbar via children; on mobile a fixed bottom bar
 * (Upload + record + sessions) so the primary actions are thumb-reachable.
 */
export const PatientWorkspaceRecording: React.FC<Props> = ({
  patientId,
  patientName,
  onError,
  onTranscriptionQueued,
  onUploadClick,
  uploadDisabled = false,
  children,
}) => {
  const {
    sessions,
    activeRecordingPatientId,
    panelOpen,
    openPanel,
    closePanel,
    startOrResume,
    parkRecording,
    finishAndTranscribe,
    discardSession,
    isLiveCapturing,
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

  const handlePause = async () => {
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

  const transcribingBanner =
    anyTranscribing ? (
      <div className="flex w-full items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-[#E6F4F3] px-2.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <Wand2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#4FB6B2]" />
        <span className="text-[11px] font-bold text-[#1F2937]">
          Transcribing{processingPatientIds.size > 1 ? ` (${processingPatientIds.size})` : ''}…
        </span>
        {longWait && <span className="text-[10px] text-[#6B7280]">15–60s</span>}
      </div>
    ) : null;

  const statusChip =
    isThisPatientRecording && isLiveCapturing ? (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        Live
      </span>
    ) : null;

  const pauseFinish = (
    <>
      {isThisPatientRecording && isLiveCapturing && (
        <>
          <button
            type="button"
            onClick={handlePause}
            className="touch-manipulation inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-[10px] border border-[#E5E7EB] bg-white px-2 text-[11px] font-bold uppercase tracking-wide text-[#1F2937] shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:bg-[#F1F5F9]"
            title="Pause dictation (keeps it with this patient)"
          >
            <Pause className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Pause</span>
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
              className="touch-manipulation inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-[10px] border border-[#E5E7EB] bg-[#E6F4F3] px-2 text-[11px] font-bold text-[#1F2937]"
            >
              <Mic className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Resume</span>
            </button>
            <button
              type="button"
              onClick={handleFinishCurrent}
              disabled={currentPatientProcessing}
              className="touch-manipulation inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-[10px] bg-[#4FB6B2] px-2 text-[11px] font-bold text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50 active:bg-[#3FA6A2]"
            >
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Finish</span>
            </button>
          </>
        )}
    </>
  );

  const mainMicButton = (
    <button
      type="button"
      onClick={
        isThisPatientRecording && isLiveCapturing ? handleFinishCurrent : handleMainFab
      }
      disabled={fabDisabled}
      title={
        isThisPatientRecording && isLiveCapturing
          ? 'Finish and transcribe'
          : 'Start dictation'
      }
      className={`touch-manipulation flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform active:scale-95 md:h-10 md:w-10 ${
        isThisPatientRecording && isLiveCapturing
          ? 'bg-[#3FA6A2] text-white active:bg-[#4FB6B2]'
            : fabDisabled
            ? 'cursor-not-allowed bg-[#F1F5F9] text-[#9CA3AF]'
            : 'bg-[#4FB6B2] text-white active:bg-[#3FA6A2]'
      }`}
    >
      {currentPatientProcessing ? (
        <Wand2 className="h-5 w-5 animate-spin" />
      ) : isThisPatientRecording && isLiveCapturing ? (
        <Check className="h-5 w-5" />
      ) : (
        <Mic className="h-5 w-5" />
      )}
    </button>
  );

  const sessionsButton = (
    <button
      type="button"
      onClick={() => (panelOpen ? closePanel() : openPanel())}
      className="relative touch-manipulation inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] border border-[#E5E7EB] bg-white text-[#1F2937] shadow-[0_1px_2px_rgba(15,23,42,0.04)] active:bg-[#F1F5F9]"
      title="Recording sessions"
      aria-label="Recording sessions"
    >
      <ListMusic className="h-5 w-5 shrink-0 text-[#4FB6B2]" />
      {activeCount > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-[#4FB6B2] px-1 text-center text-[9px] font-bold text-white">
          {activeCount}
        </span>
      ) : null}
    </button>
  );

  const desktopToolbar = (
    <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
      {transcribingBanner}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {statusChip}
        {pauseFinish}
        {sessionsButton}
        {mainMicButton}
      </div>
    </div>
  );

  return (
    <>
      {children(desktopToolbar)}

      {/* Mobile primary dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div className="pointer-events-auto border-t border-[#E5E7EB] bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
          {transcribingBanner ? <div className="mb-2">{transcribingBanner}</div> : null}
          <div className="flex items-center gap-2">
            {onUploadClick ? (
              <button
                type="button"
                onClick={onUploadClick}
                disabled={uploadDisabled}
                className="touch-manipulation flex min-h-[48px] min-w-[48px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] bg-[#4FB6B2] text-[10px] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] active:bg-[#3FA6A2] disabled:opacity-45"
                title="Upload file"
              >
                <Upload className="h-5 w-5" strokeWidth={2.25} />
                <span className="leading-none">Upload</span>
              </button>
            ) : null}
            <div className="flex min-h-[52px] min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] px-1">
              {statusChip}
              {pauseFinish}
              {mainMicButton}
            </div>
            <div className="relative shrink-0">{sessionsButton}</div>
          </div>
        </div>
      </div>

      {panelOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-[#1F2937]/25" aria-hidden onClick={closePanel} />
          <div className="fixed bottom-[max(6rem,env(safe-area-inset-bottom)+5rem)] left-2 right-2 z-[70] flex max-h-[min(65dvh,calc(100dvh-10rem))] flex-col overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:left-auto sm:right-4 sm:w-96 md:bottom-auto md:top-1/2 md:h-auto md:max-h-[min(70dvh,32rem)] md:-translate-y-1/2">
            <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-[#F7F9FB] px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-[#1F2937]">Sessions</h3>
                <p className="mt-0.5 text-[10px] text-[#6B7280]">Pause to switch patient; Finish merges clips to transcribe.</p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] p-2 text-[#9CA3AF] hover:bg-[#F1F5F9] hover:text-[#1F2937]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 [-webkit-overflow-scrolling:touch]">
              {sessions.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[#6B7280]">No other sessions.</p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.patientId}
                    className={`rounded-[10px] border p-3 ${
                      s.patientId === patientId ? 'border-[#4FB6B2]/40 bg-[#E6F4F3]/60' : 'border-[#E5E7EB] bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-[#1F2937]">{s.patientName}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#6B7280]">
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
                            className="min-h-[40px] rounded-[10px] bg-[#4FB6B2] px-2 py-2 text-[10px] font-bold uppercase text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
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
                            className="min-h-[40px] rounded-[10px] bg-[#3FA6A2] px-2 py-2 text-[10px] font-bold uppercase text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50"
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
                    {activeRecordingPatientId === s.patientId && isLiveCapturing && (
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-[#E5E7EB] pt-2">
                        <button
                          type="button"
                          onClick={() => parkRecording(s.patientId)}
                          className="min-h-[40px] rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[10px] font-bold text-[#1F2937] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                        >
                          Pause
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
