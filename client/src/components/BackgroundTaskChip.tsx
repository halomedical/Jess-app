import React, { useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, X } from 'lucide-react';

export type BackgroundTaskPhase = 'idle' | 'running' | 'success' | 'error';

interface Props {
  phase: BackgroundTaskPhase;
  message?: string;
  onDismiss?: () => void;
  /** Auto-clear success state after ms */
  successDismissMs?: number;
}

/**
 * Small fixed corner indicator for background work (e.g. DOCX upload) — non-blocking.
 */
export const BackgroundTaskChip: React.FC<Props> = ({
  phase,
  message,
  onDismiss,
  successDismissMs = 3200,
}) => {
  useEffect(() => {
    if (phase !== 'success' || !onDismiss || successDismissMs <= 0) return;
    const t = window.setTimeout(() => onDismiss(), successDismissMs);
    return () => clearTimeout(t);
  }, [phase, onDismiss, successDismissMs]);

  if (phase === 'idle') return null;

  return (
    <div
      className="pointer-events-auto fixed bottom-[max(5.5rem,env(safe-area-inset-bottom)+4.5rem)] right-3 z-[80] flex max-w-[min(18rem,calc(100vw-1.5rem))] items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm md:bottom-6 md:right-6"
      role="status"
    >
      {phase === 'running' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" aria-hidden />}
      {phase === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
      {phase === 'error' && <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />}
      <span className="min-w-0 flex-1 font-medium text-slate-700">{message || 'Working…'}</span>
      {(phase === 'success' || phase === 'error') && onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
};
