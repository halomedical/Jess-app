import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { recognizeStickerText } from '../stickerScan/ocr';

export type ParsedStickerFields = {
  firstName: string | null;
  lastName: string | null;
  dob: string | null; // YYYY-MM-DD
  cellphoneNumber: string | null;
  hospitalFolderNumber: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (fields: ParsedStickerFields, rawOcrText: string) => void;
  parseEndpointPath?: string; // default: /api/ai/parse-patient-sticker
};

function friendlyCameraError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
  if (name === 'NotAllowedError' || /permission/i.test(raw)) {
    return 'Camera permission denied. Please allow camera access in Safari settings and try again.';
  }
  if (/insecure|https/i.test(raw)) {
    return 'Camera requires HTTPS. Open this app over HTTPS (or localhost) and try again.';
  }
  return raw || 'Failed to start camera.';
}

async function parseWithGemini(rawText: string, path: string): Promise<ParsedStickerFields> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Parse failed (${res.status})`);
  }
  return (await res.json()) as ParsedStickerFields;
}

export const PatientStickerCapture: React.FC<Props> = ({
  isOpen,
  onClose,
  onParsed,
  parseEndpointPath = '/api/ai/parse-patient-sticker',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'reading' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setMessage(null);
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        setMessage(null);
        setStatus('starting');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error('Camera not ready. Please try again.');
        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          if (video.readyState >= 1) resolve();
          else video.addEventListener('loadedmetadata', done, { once: true });
        });
        await video.play().catch(() => {});
        if (cancelled) return;
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(friendlyCameraError(e));
        stopCamera();
      }
    };

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const captureAndRead = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) {
      setMessage('Camera not ready yet—try again in a second.');
      return;
    }

    setStatus('reading');
    setMessage('Reading sticker text… hold still.');

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = vw;
      canvas.height = vh;
      ctx.drawImage(video, 0, 0, vw, vh);

      const { text } = await recognizeStickerText(canvas);
      const rawOcrText = (text || '').trim();
      if (!rawOcrText) throw new Error('Could not read sticker text. Try better lighting and retake.');

      const fields = await parseWithGemini(rawOcrText, parseEndpointPath);
      onParsed(fields, rawOcrText);
      stopCamera();
      onClose();
    } catch (e) {
      setStatus('ready');
      setMessage(e instanceof Error ? e.message : 'Could not read sticker. Please retake.');
    }
  }, [onClose, onParsed, parseEndpointPath, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {status === 'reading' || status === 'starting' ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#4FB6B2]" aria-hidden />
          ) : null}
          <p className="text-xs font-semibold text-[#6B7280]">
            {status === 'reading'
              ? 'Reading sticker text…'
              : status === 'starting'
                ? 'Starting camera…'
                : 'Capture patient sticker'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="text-[#9CA3AF] hover:text-[#1F2937] p-1 rounded-full hover:bg-[#F1F5F9] transition"
          aria-label="Close camera"
        >
          <X size={16} />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-black">
        <video ref={videoRef} className="h-48 w-full object-cover" playsInline muted />
      </div>

      <button
        type="button"
        disabled={status !== 'ready'}
        onClick={() => void captureAndRead()}
        className="mt-2 w-full min-h-[44px] rounded-[10px] bg-[#4FB6B2] hover:bg-[#3FA6A2] disabled:opacity-50 text-white font-bold"
      >
        Capture sticker
      </button>

      {message ? (
        <p className="mt-2 rounded-[10px] border border-[#E5E7EB] bg-[#F7F9FB] px-3 py-2 text-[11px] text-[#1F2937]">
          {message}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-[#9CA3AF]">Fill the box with the sticker and tap Capture.</p>
      )}
    </div>
  );
};

