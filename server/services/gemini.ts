import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { getGeminiGuideForTemplate } from '../../shared/haloTemplates';
import { haloTemplateFallbackPrompt } from '../utils/prompts';
import { createHash } from 'crypto';

const RETRY_DELAYS_MS = [0, 1000, 2000, 4000] as const;
/** Timeout for Gemini API calls (tuned to fail a bit sooner when the API is stuck) */
export const GEMINI_TIMEOUT_MS = 75_000;

/**
 * Cache Gemini clinical note fallback per transcript to reduce latency when:
 * - Halo generate_note is down (triggering Gemini fallback)
 * - the UI requests multiple templates in parallel
 */
const clinicalNoteFallbackCache = new Map<
  string,
  { createdAt: number; expiresAt: number; promise: Promise<string> }
>();
const CLINICAL_NOTE_FALLBACK_TTL_MS = 5 * 60 * 1000; // 5 minutes

function fallbackCacheKey(transcript: string, templateId: string): string {
  return createHash('sha256').update(`${transcript}\0${templateId}`).digest('hex');
}

function getGenAI(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(config.geminiApiKey);
}

function getModelChain(): { model: string; fallbackModel?: string } {
  const model = (config.geminiModel || '').trim();
  const fallbackModel = (config.geminiFallbackModel || '').trim();
  if (!model) {
    // Backward compatible default if env missing.
    return { model: 'gemini-2.5-flash', fallbackModel: fallbackModel || undefined };
  }
  return { model, fallbackModel: fallbackModel || undefined };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyRetryableGeminiError(err: unknown): { retryable: boolean; reason: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const low = (msg || '').toLowerCase();
  // Required retry signals
  const keywordHit =
    low.includes('overloaded') ||
    low.includes('high demand') ||
    low.includes('unavailable') ||
    low.includes('unavailable:') ||
    low.includes('unavailable.');
  const statusHit = /\b503\b/.test(low) || low.includes('[503') || low.includes('service unavailable');
  // Common transient/network signals (keep conservative)
  const transientHit =
    low.includes('econnreset') ||
    low.includes('fetch failed') ||
    low.includes('socket hang up') ||
    low.includes('timed out') ||
    low.includes('timeout') ||
    low.includes('429') ||
    low.includes('too many requests') ||
    low.includes('resource exhausted');
  const retryable = keywordHit || statusHit || transientHit || low.includes('unavailable');
  const reason = keywordHit
    ? 'keyword'
    : statusHit
      ? 'status'
      : transientHit
        ? 'transient'
        : 'unknown';
  return { retryable, reason };
}

function extractUsageMetadata(result: any): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined {
  const usage = result?.response?.usageMetadata ?? result?.usageMetadata;
  if (!usage || typeof usage !== 'object') return undefined;
  const inputTokens =
    typeof usage.promptTokenCount === 'number'
      ? usage.promptTokenCount
      : typeof usage.inputTokenCount === 'number'
        ? usage.inputTokenCount
        : undefined;
  const outputTokens =
    typeof usage.candidatesTokenCount === 'number'
      ? usage.candidatesTokenCount
      : typeof usage.outputTokenCount === 'number'
        ? usage.outputTokenCount
        : undefined;
  const totalTokens =
    typeof usage.totalTokenCount === 'number'
      ? usage.totalTokenCount
      : inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : undefined;
  if (inputTokens == null && outputTokens == null && totalTokens == null) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

type GeminiLogEvent = {
  event: string;
  kind: string;
  model: string;
  fallbackModel?: string;
  fallbackUsed: boolean;
  retries: number;
  durationMs: number;
  status: 'success' | 'failure';
  retryReason?: string;
  error?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

function logGeminiEvent(e: GeminiLogEvent): void {
  // Heroku-friendly: single-line JSON
  const line = JSON.stringify(e);
  if (e.status === 'success') console.log(line);
  else console.error(line);
}

async function generateWithRetryAndFallback<T>(params: {
  kind: string;
  run: (modelName: string) => Promise<{ value: T; usage?: any }>;
}): Promise<T> {
  const started = Date.now();
  const { model, fallbackModel } = getModelChain();
  const models = [model, ...(fallbackModel ? [fallbackModel] : [])];

  let lastErr: unknown = null;
  let retryReason: string | undefined;
  let totalRetries = 0;
  let fallbackUsed = false;

  for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
    const modelName = models[modelIdx]!;
    fallbackUsed = modelIdx > 0;
    retryReason = undefined;
    for (let attemptIdx = 0; attemptIdx < RETRY_DELAYS_MS.length; attemptIdx++) {
      if (attemptIdx > 0) {
        totalRetries += 1;
        await delay(RETRY_DELAYS_MS[attemptIdx]);
      }
      try {
        const out = await params.run(modelName);
        const durationMs = Date.now() - started;
        logGeminiEvent({
          event: 'gemini_request',
          kind: params.kind,
          model,
          fallbackModel: fallbackModel || undefined,
          fallbackUsed,
          retries: totalRetries,
          durationMs,
          status: 'success',
          retryReason,
          usage: extractUsageMetadata(out.usage),
        });
        return out.value;
      } catch (err) {
        lastErr = err;
        const { retryable, reason } = classifyRetryableGeminiError(err);
        retryReason = reason;
        // Retry only within the current model; after final attempt, fall through to next model.
        if (!retryable || attemptIdx === RETRY_DELAYS_MS.length - 1) break;
      }
    }
  }

  const durationMs = Date.now() - started;
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  logGeminiEvent({
    event: 'gemini_request',
    kind: params.kind,
    model,
    fallbackModel: fallbackModel || undefined,
    fallbackUsed,
    retries: totalRetries,
    durationMs,
    status: 'failure',
    retryReason,
    error: message?.slice(0, 1500),
  });
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Retry wrapper kept for backward compatibility.
 * Prefer the centralized retry/fallback in `generateWithRetryAndFallback`.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return generateWithRetryAndFallback({
    kind: 'legacy_withRetry',
    run: async (_modelName) => ({ value: await fn() }),
  });
}

/**
 * Safely parse JSON from Gemini responses; recover `{...}` when the model adds prose around it.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      }
    } catch {
      /* use fallback */
    }
    return fallback;
  }
}

/**
 * `response.text()` often throws when candidates only have separate parts (SDK quirk).
 */
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

/** Request options for Gemini calls with extended timeout for slow responses */
const geminiRequestOptions = { timeout: GEMINI_TIMEOUT_MS };

/**
 * Generate text content using the Gemini text model.
 */
export async function generateText(prompt: string): Promise<string> {
  const genAI = getGenAI();
  return generateWithRetryAndFallback({
    kind: 'generate_text',
    run: async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 16384,
          },
        },
        geminiRequestOptions
      );
      return { value: extractTextFromGenerateContentResult(result), usage: result };
    },
  });
}

/**
 * Fallback when Halo/Python generate_note is unavailable or returns an error.
 * Uses per-template_id structure when known; otherwise a generic clinical section layout.
 */
export async function generateClinicalNoteFromTranscript(
  transcript: string,
  templateId: string = 'default'
): Promise<string> {
  const normalized = (transcript ?? '').trim();
  const guide = getGeminiGuideForTemplate(templateId);
  const prompt = haloTemplateFallbackPrompt(normalized, templateId, guide);
  const key = fallbackCacheKey(normalized, templateId);
  const now = Date.now();

  const cached = clinicalNoteFallbackCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = generateText(prompt).catch((err) => {
    clinicalNoteFallbackCache.delete(key);
    throw err;
  });

  clinicalNoteFallbackCache.set(key, {
    createdAt: now,
    expiresAt: now + CLINICAL_NOTE_FALLBACK_TTL_MS,
    promise,
  });

  return promise;
}

/**
 * Stream text content using the Gemini text model.
 * Yields text chunks as they arrive for lower perceived latency.
 */
export async function* generateTextStream(prompt: string): AsyncGenerator<string> {
  const genAI = getGenAI();
  const { model } = getModelChain();
  // Streaming: we retry per the same schedule but do NOT attempt fallback mid-stream.
  const chosenModel = model;
  let result: any;
  let lastErr: unknown = null;
  for (let attemptIdx = 0; attemptIdx < RETRY_DELAYS_MS.length; attemptIdx++) {
    if (attemptIdx > 0) await delay(RETRY_DELAYS_MS[attemptIdx]);
    try {
      const m = genAI.getGenerativeModel({ model: chosenModel });
      result = await m.generateContentStream(prompt, geminiRequestOptions);
      break;
    } catch (e) {
      lastErr = e;
      const { retryable } = classifyRetryableGeminiError(e);
      if (!retryable || attemptIdx === RETRY_DELAYS_MS.length - 1) throw e;
    }
  }
  if (!result && lastErr) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  for await (const chunk of result.stream) {
    const text = chunk.text?.();
    if (text) yield text;
  }
}

/**
 * Generate content from an image using the Gemini vision model.
 */
export async function analyzeImage(prompt: string, base64Data: string, mimeType: string): Promise<string> {
  const genAI = getGenAI();
  const data = base64Data.replace(/\s/g, '');
  return generateWithRetryAndFallback({
    kind: 'analyze_image',
    run: async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }, { inlineData: { mimeType, data } }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        },
        geminiRequestOptions
      );
      return { value: extractTextFromGenerateContentResult(result), usage: result };
    },
  });
}

/**
 * Generate content from audio using the Gemini model.
 */
export async function transcribeAudio(prompt: string, base64Data: string, mimeType: string): Promise<string> {
  const genAI = getGenAI();
  const data = base64Data.replace(/\s/g, '');
  return generateWithRetryAndFallback({
    kind: 'transcribe_audio',
    run: async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }, { inlineData: { mimeType, data } }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            // Dictation rarely needs huge completions; lower cap reduces time-to-first-token and total latency.
            maxOutputTokens: 8192,
          },
        },
        geminiRequestOptions
      );
      return { value: extractTextFromGenerateContentResult(result), usage: result };
    },
  });
}
