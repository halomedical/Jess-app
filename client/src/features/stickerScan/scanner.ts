export type ScannerState = 'starting' | 'scanning';

export type StickerScannerStartResult = {
  stop: () => void;
};

type StartStickerScannerOpts = {
  onResult: (rawText: string) => void;
  onStateChange?: (state: ScannerState) => void;
};

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
  detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

function getNativeBarcodeDetector(): BarcodeDetectorCtor | null {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return Detector ?? null;
}

export async function startStickerScanner(
  videoEl: HTMLVideoElement,
  opts: StartStickerScannerOpts
): Promise<StickerScannerStartResult> {
  const { onResult, onStateChange } = opts;

  let stopped = false;
  let intervalId: number | null = null;
  let zxingStop: null | (() => void) = null;
  let stream: MediaStream | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (zxingStop) {
      try {
        zxingStop();
      } catch {
        // ignore
      }
      zxingStop = null;
    }
    try {
      if (videoEl) videoEl.srcObject = null;
    } catch {
      // ignore
    }
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    stream = null;
  };

  onStateChange?.('starting');

  const Detector = getNativeBarcodeDetector();
  if (Detector) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });

    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});

    const detector = new Detector({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'pdf417', 'datamatrix'],
    });

    onStateChange?.('scanning');

    intervalId = window.setInterval(async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(videoEl);
        const v = codes?.[0]?.rawValue?.trim();
        if (v) onResult(v);
      } catch {
        // ignore scan errors; keep polling
      }
    }, 350);

    return { stop };
  }

  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();

  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: 'environment' }, audio: false },
    videoEl,
    (result) => {
      if (stopped) return;
      const v = result?.getText?.()?.trim?.() ?? '';
      if (!v) return;
      onResult(v);
    }
  );

  onStateChange?.('scanning');

  zxingStop = () => {
    try {
      controls?.stop?.();
    } finally {
      // controls.stop() is sufficient cleanup
    }
  };

  return { stop };
}

