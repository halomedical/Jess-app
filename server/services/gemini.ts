import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { getGeminiGuideForTemplate } from '../../shared/haloTemplates';
import { haloTemplateFallbackPrompt } from '../utils/prompts';
import { createHash } from 'crypto';

// Using gemini-flash-latest - this model has free tier access (15 RPM)
// Alternative: 'gemini-pro-latest' (also has free tier, but slower)
const TEXT_MODEL = 'gemini-flash-latest';
const VISION_MODEL = 'gemini-flash-latest';
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1200;
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

/**
 * Retry wrapper for Gemini API calls with exponential backoff.
 * Retries on 429 (rate limit) and 503 (service unavailable).
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES, delay = BASE_RETRY_DELAY_MS): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const isRetryable = err.message?.includes('429') || err.message?.includes('503');
      if (isRetryable && i < maxRetries) {
        await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
        continue;
      }
      break;
    }
  }
  throw lastError;
}

/**
 * Safely parse JSON from Gemini responses, stripping markdown code fences.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/** Request options for Gemini calls with extended timeout for slow responses */
const geminiRequestOptions = { timeout: GEMINI_TIMEOUT_MS };

/**
 * Generate text content using the Gemini text model.
 */
export async function generateText(prompt: string): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });
  const result = await withRetry(() =>
    model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 16384,
        },
      },
      geminiRequestOptions
    )
  );
  return result.response.text();
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
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });
  const result = await withRetry(() =>
    model.generateContentStream(prompt, geminiRequestOptions)
  );
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
  const model = genAI.getGenerativeModel({ model: VISION_MODEL });
  const result = await withRetry(() =>
    model.generateContent(
      [prompt, { inlineData: { data: base64Data, mimeType } }],
      geminiRequestOptions
    )
  );
  return result.response.text();
}

/**
 * Generate content from audio using the Gemini model.
 */
export async function transcribeAudio(prompt: string, base64Data: string, mimeType: string): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });
  const result = await withRetry(() =>
    model.generateContent(
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          // Dictation rarely needs huge completions; lower cap reduces time-to-first-token and total latency.
          maxOutputTokens: 8192,
        },
      },
      geminiRequestOptions
    )
  );
  return result.response.text();
}
