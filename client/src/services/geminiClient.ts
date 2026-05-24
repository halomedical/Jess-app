import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildClientClinicalNotePrompt } from '../../../shared/buildClientClinicalNotePrompt';

/** Match server `gemini-flash-latest` for comparable quality and quotas. */
const TEXT_MODEL = 'gemini-flash-latest';
const CLIENT_GENERATE_TIMEOUT_MS = 120_000;

function getGeminiApiKey(): string {
  const k = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!k?.trim()) {
    throw new Error(
      'Add VITE_GEMINI_API_KEY to your .env file for in-browser note generation. Use a browser-restricted key in Google Cloud Console.'
    );
  }
  return k.trim();
}

function extractTextFromGenerateContentResult(result: {
  response: {
    text: () => string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
}): string {
  try {
    const t = result.response.text();
    if (typeof t === 'string' && t.trim()) return t.trim();
  } catch {
    /* fall through */
  }
  const parts = result.response.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const joined = parts
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
    if (joined) return joined;
  }
  const fr = result.response.candidates?.[0]?.finishReason ?? 'unknown';
  throw new Error(`Gemini returned no text (finishReason=${fr})`);
}

function friendlyGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (err instanceof Error && err.name === 'AbortError') {
    return 'Note generation timed out. Tap Generate note to retry.';
  }
  if (low.includes('resource exhausted') || low.includes('429') || low.includes('quota')) {
    return 'Gemini API quota exceeded. Wait a minute and try again.';
  }
  if (low.includes('api key') || low.includes('403') || low.includes('permission')) {
    return 'Gemini API key rejected. Check VITE_GEMINI_API_KEY and key restrictions in Google Cloud.';
  }
  if (low.includes('fetch failed') || low.includes('network')) {
    return 'Network error while calling Gemini. Check your connection and try again.';
  }
  return msg.length > 280 ? `${msg.slice(0, 280)}…` : msg;
}

function combineAbortSignals(outer: AbortSignal, inner: AbortSignal): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') {
    return anyFn([outer, inner]);
  }
  const combined = new AbortController();
  const onAbort = () => combined.abort();
  if (outer.aborted || inner.aborted) {
    combined.abort();
    return combined.signal;
  }
  outer.addEventListener('abort', onAbort);
  inner.addEventListener('abort', onAbort);
  return combined.signal;
}

/**
 * Generate clinical note text in the browser via Gemini (no Heroku /api/halo/generate-note).
 * Prompt is built locally from template field instructions + dictation.
 */
export async function generateClinicalNoteWithGemini(params: {
  /** Doctor's dictated transcript — must be passed explicitly for field extraction. */
  transcriptionText: string;
  templateId: string;
  /** Optional chart identifier block (name, DOB, folder #, etc.). */
  chartReference?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const prompt = buildClientClinicalNotePrompt(
    params.transcriptionText,
    params.templateId,
    params.chartReference
  );
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });

  const deadline = new AbortController();
  const tid = window.setTimeout(() => deadline.abort(), CLIENT_GENERATE_TIMEOUT_MS);
  const signal =
    params.signal != null
      ? combineAbortSignals(params.signal, deadline.signal)
      : deadline.signal;

  try {
    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 16384,
        },
      },
      { signal }
    );
    return extractTextFromGenerateContentResult(result);
  } catch (err) {
    throw new Error(friendlyGeminiError(err));
  } finally {
    window.clearTimeout(tid);
  }
}
