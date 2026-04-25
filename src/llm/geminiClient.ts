import { assertOnline } from '../utils/network';

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

  const doFetch: typeof fetch = fetchImpl ?? (globalThis.fetch as typeof fetch);
  if (!doFetch) throw new Error('No fetch implementation available.');
  if (!skipConnectivityCheck && !fetchImpl) {
    await assertOnline();
  }

  const controller = new AbortController();
  const abortListener = () => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };
  signal?.addEventListener('abort', abortListener, { once: true });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';

  const fetchPromise = doFetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
    signal: controller.signal,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
      reject(new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  try {
    const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response;
    if (timer) clearTimeout(timer);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini API ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as GeminiResponse;
    if (data.error) {
      throw new Error(`Gemini API error ${data.error.status ?? data.error.code}: ${data.error.message}`);
    }
    const text = extractGeminiText(data);
    if (!text) throw new Error('Empty response from Gemini.');
    return { text, raw: data };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', abortListener);
  }
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
    const msg = e instanceof Error ? e.message : String(e);
    const m = msg.match(/API (\d+):/);
    return { ok: false, status: m ? Number(m[1]) : undefined, message: msg };
  }
}
