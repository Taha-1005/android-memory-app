import { AnthropicToolDef, callClaudeAPI, probeApiKey as probeClaudeKey } from './client';
import { callGeminiAPI, probeGeminiKey, DEFAULT_GEMINI_MODEL } from './geminiClient';
import { statusFromMessage } from '../utils/network';

export type LLMToolDef = AnthropicToolDef;

export type Provider = 'anthropic' | 'gemini';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export function isProvider(value: string | null | undefined): value is Provider {
  return value === 'anthropic' || value === 'gemini';
}

export function defaultModelFor(provider: Provider): string {
  return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_ANTHROPIC_MODEL;
}

export interface LLMCallOptions {
  provider: Provider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  skipConnectivityCheck?: boolean;
  /** Hint that we expect JSON. Honoured by Gemini (responseMimeType). */
  jsonMode?: boolean;
  /**
   * Optional system instruction. Anthropic receives it via the dedicated
   * `system` field. Gemini receives it concatenated into the user prompt
   * (identical to the legacy "all-in-one" prompt path) so its behaviour is
   * unchanged.
   */
  system?: string;
  /**
   * When true and provider=anthropic, mark the system block as ephemeral so
   * subsequent calls with the same prefix can hit Anthropic's prompt cache.
   * Ignored for Gemini.
   */
  cacheSystem?: boolean;
  /**
   * Structured-output tool. When provided AND provider=anthropic, Claude is
   * forced to return tool_use whose input matches the schema. Ignored for
   * Gemini — Gemini callers should rely on jsonMode + extractJson as before.
   */
  tool?: LLMToolDef;
}

export interface LLMCallResult {
  text: string;
  provider: Provider;
  model: string;
  usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
}

function statusFromError(e: unknown): number | null {
  return e instanceof Error ? statusFromMessage(e.message) : null;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function friendlyRateLimitMessage(provider: Provider): string {
  if (provider === 'gemini') {
    return 'Gemini hit its free-tier rate limit. Wait a minute and try again, or switch to Anthropic in Settings.';
  }
  return 'Anthropic rate-limited this request. Wait a moment and try again.';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Single entry point used by ingest/query/merge. Picks the right HTTP client
 * for the configured provider and returns a normalised shape so callers don't
 * branch on provider. Retries once on transient HTTP failures (429/503/etc.)
 * with a short backoff before surfacing a friendlier rate-limit error.
 */
export async function callLLM(prompt: string, opts: LLMCallOptions): Promise<LLMCallResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callLLMOnce(prompt, opts);
    } catch (e) {
      const status = statusFromError(e);
      const retryable = status !== null && RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === 1) {
        if (status === 429) throw new Error(friendlyRateLimitMessage(opts.provider));
        throw e;
      }
      lastErr = e;
      // Brief backoff before the retry. Tests inject fetchImpl and skip the
      // real-time delay so the suite stays fast.
      if (!opts.fetchImpl) await sleep(1200);
    }
  }
  // Unreachable; the loop either returns or throws. Defensive only.
  throw lastErr instanceof Error ? lastErr : new Error('Unknown LLM error.');
}

async function callLLMOnce(prompt: string, opts: LLMCallOptions): Promise<LLMCallResult> {
  // Project-wide rule: every Claude call uses Sonnet 4.6, regardless of any
  // user-supplied model override. Gemini honours opts.model as before.
  const model =
    opts.provider === 'anthropic'
      ? DEFAULT_ANTHROPIC_MODEL
      : (opts.model ?? defaultModelFor(opts.provider));
  if (opts.provider === 'gemini') {
    // Gemini's behaviour must stay identical to the legacy path. If the
    // caller passed a system instruction, fold it into the user prompt
    // exactly the way the old all-in-one prompts did.
    const userPrompt = opts.system ? `${opts.system}\n\n${prompt}` : prompt;
    const { text, raw } = await callGeminiAPI(userPrompt, {
      apiKey: opts.apiKey,
      model,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
      fetchImpl: opts.fetchImpl,
      skipConnectivityCheck: opts.skipConnectivityCheck,
      jsonMode: opts.jsonMode,
    });
    return {
      text,
      provider: 'gemini',
      model,
      usage: {
        promptTokens: raw.usageMetadata?.promptTokenCount,
        outputTokens: raw.usageMetadata?.candidatesTokenCount,
        totalTokens: raw.usageMetadata?.totalTokenCount,
      },
    };
  }
  const { text, raw } = await callClaudeAPI(prompt, {
    apiKey: opts.apiKey,
    model,
    maxTokens: opts.maxTokens,
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
    skipConnectivityCheck: opts.skipConnectivityCheck,
    system: opts.system,
    cacheSystem: opts.cacheSystem,
    tool: opts.tool,
  });
  return {
    text,
    provider: 'anthropic',
    model,
    usage: {
      promptTokens: raw.usage?.input_tokens,
      outputTokens: raw.usage?.output_tokens,
      totalTokens:
        raw.usage && (raw.usage.input_tokens != null || raw.usage.output_tokens != null)
          ? (raw.usage.input_tokens ?? 0) + (raw.usage.output_tokens ?? 0)
          : undefined,
    },
  };
}

export async function probeProviderKey(
  provider: Provider,
  apiKey: string,
  opts: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true } | { ok: false; status?: number; message: string }> {
  if (provider === 'gemini') return probeGeminiKey(apiKey, opts);
  return probeClaudeKey(apiKey, opts);
}
