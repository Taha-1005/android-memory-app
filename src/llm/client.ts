export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface AnthropicResponseBlock {
  type: string;
  text?: string;
}

export interface AnthropicResponse {
  content?: AnthropicResponseBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

export function extractResponseText(data: AnthropicResponse): string {
  const blocks = data.content || [];
  return blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
}

export async function callClaudeAPI(
  prompt: string,
  opts: AnthropicClientOptions,
): Promise<{ text: string; raw: AnthropicResponse }> {
  const {
    apiKey,
    model = 'claude-sonnet-4-20250514',
    maxTokens = 1000,
    timeoutMs = 45000,
    signal,
    fetchImpl,
  } = opts;
  if (!apiKey) throw new Error('No API key configured.');

  const doFetch: typeof fetch = fetchImpl ?? (globalThis.fetch as typeof fetch);
  if (!doFetch) throw new Error('No fetch implementation available.');

  const controller = new AbortController();
  const abortListener = () => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };
  signal?.addEventListener('abort', abortListener, { once: true });

  const fetchPromise = doFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
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
      reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  try {
    const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response;
    if (timer) clearTimeout(timer);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as AnthropicResponse;
    if (data.error) {
      throw new Error(`API error ${data.error.type}: ${data.error.message}`);
    }
    const text = extractResponseText(data);
    if (!text) throw new Error('Empty response from Claude.');
    return { text, raw: data };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', abortListener);
  }
}

export async function probeApiKey(
  apiKey: string,
  fetchImpl?: typeof fetch,
): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
  try {
    const { text } = await callClaudeAPI('Reply with exactly: OK', {
      apiKey,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 5,
      timeoutMs: 15_000,
      fetchImpl,
    });
    return text.trim().length > 0 ? { ok: true } : { ok: false, message: 'Empty response.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = msg.match(/API (\d+):/);
    return { ok: false, status: m ? Number(m[1]) : undefined, message: msg };
  }
}
