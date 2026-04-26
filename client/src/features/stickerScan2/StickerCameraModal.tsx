import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

export const StickerCameraModal: React.FC<Props> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Camera unavailable');
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, stopStream]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `sticker_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream();
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.92
    );
  };

  if (!isOpen) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-[#6B7280]">Capture patient sticker</p>
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="text-[#9CA3AF] hover:text-[#1F2937] p-1 rounded-full hover:bg-[#F1F5F9] transition"
          aria-label="Close camera"
        >
          <X size={16} />
        </button>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-black">
        <video ref={videoRef} className="h-48 w-full object-cover" playsInline muted />
      </div>

      <button
        type="button"
        disabled={!ready || !!error}
        onClick={snap}
        className="mt-2 w-full min-h-[44px] rounded-[10px] bg-[#4FB6B2] hover:bg-[#3FA6A2] disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2"
      >
        <Camera size={16} />
        Capture sticker
      </button>

      {error ? (
        <p className="mt-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-[#9CA3AF]">Fill the frame with the sticker and tap Capture.</p>
      )}
    </div>
  );
};

