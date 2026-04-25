import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader, X } from 'lucide-react';
import { startStickerScanner, type StickerScannerStartResult } from './scanner';

type StickerScannerStatus =
  | 'idle'
  | 'requesting_permission'
  | 'starting_camera'
  | 'scanning'
  | 'error';

export type StickerScannerProps = {
  isOpen: boolean;
  onClose: () => void;
  onScan: (rawText: string) => void;
  onError?: (message: string) => void;
  className?: string;
};

function logDebug(stage: string, data?: Record<string, unknown>) {
  // Keep logs concise but high-signal for debugging field reports.
  // eslint-disable-next-line no-console
  console.log('[StickerScan]', stage, data ?? {});
}

function friendlyCameraError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';

  // Browser/OS common cases:
  if (name === 'NotAllowedError' || /permission/i.test(raw)) {
    return 'Camera permission denied. Please allow camera access in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || /no camera/i.test(raw)) {
    return 'No camera found on this device.';
  }
  if (name === 'NotReadableError' || /in use/i.test(raw)) {
    return 'Camera is already in use by another app. Close other apps using the camera and try again.';
  }
  if (name === 'OverconstrainedError') {
    return 'This device camera does not support the requested mode. Try again.';
  }
  if (/insecure|https/i.test(raw)) {
    return 'Camera requires HTTPS. Open this app over HTTPS (or localhost) and try again.';
  }
  return raw || 'Failed to start camera.';
}

/**
 * StickerScanner ensures the <video> element is mounted before starting the camera/scanner.
 * This prevents a common mobile/iOS race where refs are null on the click tick.
 */
export const StickerScanner: React.FC<StickerScannerProps> = ({
  isOpen,
  onClose,
  onScan,
  onError,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const [status, setStatus] = useState<StickerScannerStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const title = useMemo(() => {
    if (status === 'requesting_permission') return 'Requesting camera permission…';
    if (status === 'starting_camera') return 'Starting camera…';
    if (status === 'scanning') return 'Scanning…';
    if (status === 'error') return 'Camera error';
    return 'Scan patient sticker';
  }, [status]);

  const stop = () => {
    if (stopRef.current) {
      try {
        stopRef.current();
      } catch {
        // ignore
      }
      stopRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stop();
      setStatus('idle');
      setMessage(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const videoEl = videoRef.current;
      if (!videoEl) {
        setStatus('error');
        setMessage('Camera not ready. Please try again.');
        return;
      }

      try {
        setMessage(null);
        setStatus('requesting_permission');
        logDebug('permission_request');

        // Preflight permission request (must be triggered from user gesture; opening scanner is the gesture).
        // This improves UX on iOS by prompting before we show a black preview.
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((s) => {
          s.getTracks().forEach((t) => t.stop());
        });

        if (cancelled) return;
        setStatus('starting_camera');
        logDebug('starting_camera');

        const res: StickerScannerStartResult = await startStickerScanner(videoEl, {
          onResult: (raw) => {
            if (cancelled) return;
            logDebug('result', { len: raw.length, sample: raw.slice(0, 120) });
            onScan(raw);
          },
          onStateChange: (next) => {
            if (cancelled) return;
            if (next === 'scanning') setStatus('scanning');
          },
          onDebug: (evt) => {
            if (cancelled) return;
            logDebug(evt.stage, evt.data);
          },
        });

        if (cancelled) {
          res.stop();
          return;
        }
        stopRef.current = res.stop;
        setStatus('scanning');
        logDebug('scanning');
      } catch (e) {
        if (cancelled) return;
        const msg = friendlyCameraError(e);
        setStatus('error');
        setMessage(msg);
        onError?.(msg);
        logDebug('error', { message: msg });
        stop();
      }
    };

    void run();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {(status === 'requesting_permission' || status === 'starting_camera') && (
            <Loader className="animate-spin text-[#4FB6B2]" size={16} />
          )}
          <p className="text-xs font-semibold text-[#6B7280]">{title}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          className="text-[#9CA3AF] hover:text-[#1F2937] p-1 rounded-full hover:bg-[#F1F5F9] transition"
          aria-label="Close camera"
        >
          <X size={16} />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-black">
        <video
          ref={videoRef}
          className="h-48 w-full object-cover"
          playsInline
          muted
          // Avoid autoPlay; some mobile browsers require play() after srcObject is set.
        />

        {/* Scanning overlay + ROI hint */}
        {status !== 'error' ? (
          <>
            <div className="absolute inset-x-0 top-0 flex items-center justify-center">
              <div className="mt-2 rounded-full bg-black/50 px-3 py-1 text-[11px] font-semibold text-white">
                Scanning patient sticker…
              </div>
            </div>
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-[42%] w-[75%] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-white/40 bg-white/0"
            />
          </>
        ) : null}
      </div>

      {message ? (
        <p className="mt-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          {message}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-[#9CA3AF]">
          Hold the sticker steady. If scanning fails, you can paste/enter details manually.
        </p>
      )}
    </div>
  );
};

