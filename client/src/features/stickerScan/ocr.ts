import { createWorker, PSM, type Worker } from 'tesseract.js';

export type OcrRecognizeResult = {
  text: string;
  confidence?: number;
};

let workerPromise: Promise<Worker> | null = null;

function assetUrl(path: string): string {
  return new URL(path, import.meta.url).toString();
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng', 1, {
        logger: () => {
          // Caller controls logging; keep OCR worker quiet by default.
        },
        workerPath: assetUrl('../../../../node_modules/tesseract.js/dist/worker.min.js'),
        corePath: assetUrl('../../../../node_modules/tesseract.js-core/tesseract-core.wasm.js'),
        langPath: assetUrl('../../../../node_modules/tesseract.js-core/lang-data'),
      });

      // Light tuning for printed medical stickers (mostly uppercase + numbers + punctuation).
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // Assume a uniform block of text.
        preserve_interword_spaces: '1',
      });

      return worker;
    })();
  }
  return workerPromise;
}

export async function recognizeStickerText(canvas: HTMLCanvasElement): Promise<OcrRecognizeResult> {
  const worker = await getWorker();
  const res = await worker.recognize(canvas);
  const text = (res.data.text ?? '').trim();
  return { text, confidence: res.data.confidence };
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } finally {
    workerPromise = null;
  }
}

