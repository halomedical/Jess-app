import { getClientApiBase } from '../utils/apiBase';

const API_BASE = getClientApiBase();
const CLIENT_GENERATE_TIMEOUT_MS = 120_000;

function friendlyGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (err instanceof Error && err.name === 'AbortError') {
    return 'Note generation timed out. Tap Generate note to retry.';
  }
  if (
    low.includes('503') ||
    low.includes('overloaded') ||
    low.includes('high demand') ||
    low.includes('unavailable') ||
    low.includes('service unavailable')
  ) {
    return 'The AI service is temporarily busy. Your transcript has been saved successfully. Please try generating the note again in a few minutes.';
  }
  if (low.includes('resource exhausted') || low.includes('429') || low.includes('quota')) {
    return 'Gemini API quota exceeded. Wait a minute and try again.';
  }
  if (low.includes('api key') || low.includes('403') || low.includes('permission')) {
    return 'Gemini API key rejected. Check GEMINI_API_KEY on the server and Google Cloud API access.';
  }
  if (low.includes('fetch failed') || low.includes('network') || low.includes('request failed')) {
    return 'Network error while generating the note. Check your connection and try again.';
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
 * Generate clinical note text via the backend Gemini route.
 */
export async function generateClinicalNoteWithGemini(params: {
  /** Doctor's dictated transcript — must be passed explicitly for field extraction. */
  transcriptionText: string;
  templateId: string;
  /** Optional chart identifier block (name, DOB, folder #, etc.). */
  chartReference?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const deadline = new AbortController();
  const tid = window.setTimeout(() => deadline.abort(), CLIENT_GENERATE_TIMEOUT_MS);
  const signal =
    params.signal != null
      ? combineAbortSignals(params.signal, deadline.signal)
      : deadline.signal;
  try {
    const res = await fetch(`${API_BASE}/api/ai/generate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        transcriptionText: params.transcriptionText,
        templateId: params.templateId,
        chartReference: params.chartReference,
      }),
    });

    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('Not authenticated');
    }

    const data = (await res.json().catch(() => ({}))) as { note?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    if (typeof data.note !== 'string' || !data.note.trim()) {
      throw new Error('Gemini returned an empty note.');
    }

    return data.note;
  } catch (err) {
    throw new Error(friendlyGeminiError(err));
  } finally {
    window.clearTimeout(tid);
  }
}
