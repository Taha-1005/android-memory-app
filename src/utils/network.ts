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
  const abortListener = () => {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  };
  opts.signal?.addEventListener('abort', abortListener, { once: true });

  const fetchPromise = doFetch(url, {
    method: opts.method ?? 'POST',
    headers: opts.headers,
    body: opts.body,
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
      reject(new Error(`${opts.timeoutLabel} timed out after ${Math.round(opts.timeoutMs / 1000)}s.`));
    }, opts.timeoutMs);
  });

  try {
    const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response;
    if (timer) clearTimeout(timer);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${opts.errorPrefix} ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abortListener);
  }
}
