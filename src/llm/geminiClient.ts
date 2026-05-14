import { fetchJsonWithTimeout } from '../utils/network';
import { toErrorMessage } from '../utils/errors';

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Skip the offline pre-check — tests with a mocked fetch pass this. */
  skipConnectivityCheck?: boolean;
  /** Hint to Gemini that we want JSON back. Default false. */
  jsonMode?: boolean;
}

export interface GeminiResponsePart {
  text?: string;
}

export interface GeminiResponseCandidate {
  content?: { parts?: GeminiResponsePart[]; role?: string };
  finishReason?: string;
}

export interface GeminiResponse {
  candidates?: GeminiResponseCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; status?: string; message: string };
}

export const FREE_GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
] as const;

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function extractGeminiText(data: GeminiResponse): string {
  const cands = data.candidates ?? [];
  const parts = cands[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
}

export async function callGeminiAPI(
  prompt: string,
  opts: GeminiClientOptions,
): Promise<{ text: string; raw: GeminiResponse }> {
  const {
    apiKey,
    model = DEFAULT_GEMINI_MODEL,
    maxTokens = 1000,
    timeoutMs = 45000,
    signal,
    fetchImpl,
    skipConnectivityCheck,
    jsonMode,
  } = opts;
  if (!apiKey) throw new Error('No Gemini API key configured.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';

  const data = await fetchJsonWithTimeout<GeminiResponse>(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
    timeoutMs,
    signal,
    fetchImpl,
    skipConnectivityCheck,
    errorPrefix: 'Gemini API',
    timeoutLabel: 'Gemini request',
  });
  if (data.error) {
    throw new Error(`Gemini API error ${data.error.status ?? data.error.code}: ${data.error.message}`);
  }
  const text = extractGeminiText(data);
  if (!text) throw new Error('Empty response from Gemini.');
  return { text, raw: data };
}

export async function probeGeminiKey(
  apiKey: string,
  opts: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
  try {
    const { text } = await callGeminiAPI('Reply with exactly: OK', {
      apiKey,
      model: opts.model ?? DEFAULT_GEMINI_MODEL,
      maxTokens: 10,
      timeoutMs: 15_000,
      fetchImpl: opts.fetchImpl,
    });
    return text.trim().length > 0 ? { ok: true } : { ok: false, message: 'Empty response.' };
  } catch (e) {
    const msg = toErrorMessage(e);
    const m = msg.match(/API (\d+):/);
    return { ok: false, status: m ? Number(m[1]) : undefined, message: msg };
  }
}
