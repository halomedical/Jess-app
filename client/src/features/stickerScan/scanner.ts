export type ScannerState = 'starting' | 'scanning';

export type StickerScannerStartResult = {
  stop: () => void;
};

type StartStickerScannerOpts = {
  onResult: (rawText: string) => void;
  onStateChange?: (state: ScannerState) => void;
  onDebug?: (evt: { stage: string; data?: Record<string, unknown> }) => void;
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
  const { onResult, onStateChange, onDebug } = opts;

  let stopped = false;
  let intervalId: number | null = null;
  let zxingStop: null | (() => void) = null;
  let stream: MediaStream | null = null;
  let ocrIntervalId: number | null = null;
  let ocrInFlight = false;
  let lastOcrText = '';
  let lastEmitAt = 0;

  const emitOnce = (rawText: string, source: 'barcode' | 'ocr') => {
    const t = rawText.trim();
    if (!t) return;
    const now = Date.now();
    // Guard against duplicate emissions across engines.
    if (now - lastEmitAt < 1500) return;
    lastEmitAt = now;
    onDebug?.({ stage: 'detected', data: { source, len: t.length, sample: t.slice(0, 80) } });
    onResult(t);
    stop();
  };

  const shouldAcceptOcr = async (text: string): Promise<boolean> => {
    const t = text.trim();
    if (t.length < 18) {
      onDebug?.({ stage: 'ocr_reject', data: { reason: 'too_short', len: t.length } });
      return false;
    }
    const { interpretStickerText } = await import('./interpreter');
    const { debug } = interpretStickerText(t);
    onDebug?.({
      stage: 'interpret',
      data: {
        firstName: debug.detected.firstName,
        surname: debug.detected.surname,
        dob: debug.detected.dob,
        folderNumber: debug.detected.folderNumber,
        sex: debug.detected.sex,
        contactNumber: debug.detected.contactNumber,
        decision: debug.decision,
      },
    });
    if (!debug.decision.accepted) {
      onDebug?.({ stage: 'ocr_reject', data: { reason: debug.decision.reason } });
      return false;
    }
    onDebug?.({ stage: 'ocr_accept', data: { reason: debug.decision.reason } });
    return true;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (ocrIntervalId) {
      window.clearInterval(ocrIntervalId);
      ocrIntervalId = null;
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
  onDebug?.({ stage: 'start', data: {} });

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
    onDebug?.({ stage: 'barcode_engine', data: { engine: 'BarcodeDetector' } });

    intervalId = window.setInterval(async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(videoEl);
        const v = codes?.[0]?.rawValue?.trim();
        if (v) emitOnce(v, 'barcode');
      } catch {
        // ignore scan errors; keep polling
      }
    }, 350);

    // Start OCR in parallel for text-only stickers.
    const { recognizeStickerText } = await import('./ocr');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ocrIntervalId = window.setInterval(async () => {
        if (stopped || ocrInFlight) return;
        const vw = videoEl.videoWidth || 0;
        const vh = videoEl.videoHeight || 0;
        if (!vw || !vh) return;
        ocrInFlight = true;
        try {
          // Central ROI (tuned for stickers held in the middle)
          const roiW = Math.floor(vw * 0.75);
          const roiH = Math.floor(vh * 0.42);
          const sx = Math.floor((vw - roiW) / 2);
          const sy = Math.floor((vh - roiH) / 2);

          canvas.width = roiW;
          canvas.height = roiH;
          ctx.drawImage(videoEl, sx, sy, roiW, roiH, 0, 0, roiW, roiH);

          const { text, confidence } = await recognizeStickerText(canvas);
          const cleaned = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          if (cleaned && cleaned !== lastOcrText) {
            lastOcrText = cleaned;
            onDebug?.({ stage: 'ocr_text', data: { confidence, len: cleaned.length, sample: cleaned.slice(0, 80) } });
            if (await shouldAcceptOcr(cleaned)) emitOnce(cleaned, 'ocr');
          }
        } catch (e) {
          onDebug?.({ stage: 'ocr_error', data: { message: e instanceof Error ? e.message : String(e) } });
        } finally {
          ocrInFlight = false;
        }
      }, 650);
    }

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
      emitOnce(v, 'barcode');
    }
  );

  onStateChange?.('scanning');
  onDebug?.({ stage: 'barcode_engine', data: { engine: 'ZXing' } });

  zxingStop = () => {
    try {
      controls?.stop?.();
    } finally {
      // controls.stop() is sufficient cleanup
    }
  };

  // OCR in parallel with ZXing.
  const { recognizeStickerText } = await import('./ocr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ocrIntervalId = window.setInterval(async () => {
      if (stopped || ocrInFlight) return;
      const vw = videoEl.videoWidth || 0;
      const vh = videoEl.videoHeight || 0;
      if (!vw || !vh) return;
      ocrInFlight = true;
      try {
        const roiW = Math.floor(vw * 0.75);
        const roiH = Math.floor(vh * 0.42);
        const sx = Math.floor((vw - roiW) / 2);
        const sy = Math.floor((vh - roiH) / 2);
        canvas.width = roiW;
        canvas.height = roiH;
        ctx.drawImage(videoEl, sx, sy, roiW, roiH, 0, 0, roiW, roiH);
        const { text, confidence } = await recognizeStickerText(canvas);
        const cleaned = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (cleaned && cleaned !== lastOcrText) {
          lastOcrText = cleaned;
          onDebug?.({ stage: 'ocr_text', data: { confidence, len: cleaned.length, sample: cleaned.slice(0, 80) } });
          if (await shouldAcceptOcr(cleaned)) emitOnce(cleaned, 'ocr');
        }
      } catch (e) {
        onDebug?.({ stage: 'ocr_error', data: { message: e instanceof Error ? e.message : String(e) } });
      } finally {
        ocrInFlight = false;
      }
    }, 650);
  }

  return { stop };
}

