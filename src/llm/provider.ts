import { callClaudeAPI, probeApiKey as probeClaudeKey } from './client';
import { callGeminiAPI, probeGeminiKey, DEFAULT_GEMINI_MODEL } from './geminiClient';

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
  /** Hint that we expect JSON. Some providers can be told explicitly. */
  jsonMode?: boolean;
}

export interface LLMCallResult {
  text: string;
  provider: Provider;
  model: string;
  usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
}

/**
 * Single entry point used by ingest/query/merge. Picks the right HTTP client
 * for the configured provider and returns a normalised shape so callers don't
 * branch on provider.
 */
export async function callLLM(prompt: string, opts: LLMCallOptions): Promise<LLMCallResult> {
  const model = opts.model ?? defaultModelFor(opts.provider);
  if (opts.provider === 'gemini') {
    const { text, raw } = await callGeminiAPI(prompt, {
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
