/**
 * Pre-check for connectivity. Spec §11.5 asks us to short-circuit LLM calls
 * when the device is offline rather than letting the 45s timeout burn.
 *
 * We import `@react-native-community/netinfo` dynamically so this module
 * remains importable from pure-Node unit tests. If the module throws or
 * returns anything other than an explicit `isConnected === false`, we
 * treat the network as "probably up" and let the real request either
 * succeed or fail on its own — false negatives are worse than false
 * positives here.
 */
import { toErrorMessage } from './errors';

export async function assertOnline(): Promise<void> {
  try {
    const mod = await import('@react-native-community/netinfo');
    const fetchFn = (mod as unknown as {
      default?: { fetch: () => Promise<{ isConnected: boolean | null }> };
      fetch?: () => Promise<{ isConnected: boolean | null }>;
    });
    const netFetch = fetchFn.default?.fetch ?? fetchFn.fetch;
    if (!netFetch) return;
    const state = await netFetch();
    if (state.isConnected === false) {
      throw new Error('You appear to be offline. Check your connection and try again.');
    }
  } catch (e) {
    if (e instanceof Error && /offline/i.test(e.message)) throw e;
  }
}

export interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  skipConnectivityCheck?: boolean;
  /** Prefix used in transport errors, e.g. "API" or "Gemini API". */
  errorPrefix: string;
  /** Prefix used in timeout errors, e.g. "Request" or "Gemini request". */
  timeoutLabel: string;
}

/**
 * Run a fetch with hard timeout via `Promise.race`, an optional caller-supplied
 * AbortSignal, an offline pre-check, and uniform `${errorPrefix} NNN: <body>`
 * error formatting on non-2xx responses. Returns the parsed JSON body.
 *
 * Both LLM HTTP clients (Anthropic + Gemini) previously hand-rolled this
 * roughly 50 lines apiece. The status-code parser in `provider.ts`
 * (`statusFromError`) relies on the `${errorPrefix} NNN:` shape this helper
 * produces.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  opts: FetchJsonOptions,
): Promise<T> {
  const doFetch: typeof fetch = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  if (!doFetch) throw new Error('No fetch implementation available.');
  if (!opts.skipConnectivityCheck && !opts.fetchImpl) {
    await assertOnline();
  }

  const controller = new AbortController();
  const abort = () => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };
  opts.signal?.addEventListener('abort', abort, { once: true });

  const fetchPromise = doFetch(url, {
    method: opts.method ?? 'POST',
    headers: opts.headers,
    body: opts.body,
    signal: controller.signal,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort();
      reject(new Error(`${opts.timeoutLabel} timed out after ${Math.round(opts.timeoutMs / 1000)}s.`));
    }, opts.timeoutMs);
  });

  try {
    const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${opts.errorPrefix} ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abort);
  }
}

/**
 * Pull the HTTP status out of the `${prefix} NNN:` shape that
 * `fetchJsonWithTimeout` puts on transport errors. Returns null when the
 * message doesn't fit (timeout, JSON parse error, etc.).
 */
export function statusFromMessage(msg: string): number | null {
  const m = msg.match(/API (\d+):/);
  return m ? Number(m[1]) : null;
}

export type ProbeResult = { ok: true } | { ok: false; status?: number; message: string };

/**
 * Shared "is this API key usable?" check for both LLM providers. Fires a tiny
 * `Reply with exactly: OK` request through the provider's own client and maps
 * the outcome to a uniform ProbeResult.
 */
export async function probeKey(
  call: (
    prompt: string,
    opts: { apiKey: string; model: string; maxTokens: number; timeoutMs: number; fetchImpl?: typeof fetch },
  ) => Promise<{ text: string }>,
  args: { apiKey: string; model: string; fetchImpl?: typeof fetch },
): Promise<ProbeResult> {
  try {
    const { text } = await call('Reply with exactly: OK', {
      apiKey: args.apiKey,
      model: args.model,
      maxTokens: 10,
      timeoutMs: 15_000,
      fetchImpl: args.fetchImpl,
    });
    return text.trim().length > 0 ? { ok: true } : { ok: false, message: 'Empty response.' };
  } catch (e) {
    const msg = toErrorMessage(e);
    return { ok: false, status: statusFromMessage(msg) ?? undefined, message: msg };
  }
}
