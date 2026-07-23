import { fetchJsonWithTimeout, probeKey, ProbeResult } from '../utils/network';

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Skip the offline pre-check — tests with a mocked fetch pass this. */
  skipConnectivityCheck?: boolean;
  /**
   * Anthropic system prompt. When provided, sent in the API's dedicated
   * `system` field rather than concatenated into the user turn.
   */
  system?: string;
  /**
   * When true, mark the system block with `cache_control: ephemeral` so
   * subsequent calls with the same system prefix can hit Anthropic's
   * prompt cache. Caller should ensure `system` is large enough to be
   * worth caching (Sonnet 4.6 caches blocks ≥ 1024 tokens).
   */
  cacheSystem?: boolean;
  /**
   * Force a structured response via tool_use. When set, Anthropic must
   * return a single tool_use block whose input matches the schema.
   * extractResponseText returns the JSON.stringify of that input so
   * downstream JSON parsers stay unchanged.
   */
  tool?: AnthropicToolDef;
}

export interface AnthropicResponseBlock {
  type: string;
  text?: string;
  /** Present on tool_use blocks. */
  name?: string;
  input?: unknown;
}

export interface AnthropicResponse {
  content?: AnthropicResponseBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

export function extractResponseText(data: AnthropicResponse): string {
  const blocks = data.content || [];
  // Prefer tool_use output when present — that's the structured-output path.
  const toolBlock = blocks.find((b) => b?.type === 'tool_use' && b.input !== undefined);
  if (toolBlock) return JSON.stringify(toolBlock.input);
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
    model = 'claude-sonnet-4-6',
    maxTokens = 1000,
    timeoutMs = 45000,
    signal,
    fetchImpl,
    skipConnectivityCheck,
    system,
    cacheSystem,
    tool,
  } = opts;
  if (!apiKey) throw new Error('No API key configured.');

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) {
    requestBody.system = cacheSystem
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
  }
  if (tool) {
    requestBody.tools = [tool];
    requestBody.tool_choice = { type: 'tool', name: tool.name };
  }

  const data = await fetchJsonWithTimeout<AnthropicResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeoutMs,
      signal,
      fetchImpl,
      skipConnectivityCheck,
      errorPrefix: 'API',
      timeoutLabel: 'Request',
    },
  );
  if (data.error) {
    throw new Error(`API error ${data.error.type}: ${data.error.message}`);
  }
  const text = extractResponseText(data);
  if (!text) throw new Error('Empty response from Claude.');
  return { text, raw: data };
}

export async function probeApiKey(
  apiKey: string,
  opts: { model?: string; fetchImpl?: typeof fetch } = {},
): Promise<ProbeResult> {
  // Use the default Sonnet model rather than Haiku — every paid Anthropic key
  // has Sonnet access, while some plans don't enable Haiku. Probing with a
  // model the user can't call produces a confusing 404 and blocks onboarding
  // even though the key itself is fine.
  return probeKey(callClaudeAPI, {
    apiKey,
    model: opts.model ?? 'claude-sonnet-4-6',
    fetchImpl: opts.fetchImpl,
  });
}
