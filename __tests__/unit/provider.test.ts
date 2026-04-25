import { callLLM, defaultModelFor, isProvider } from '../../src/llm/provider';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('isProvider', () => {
  it('accepts the two supported providers', () => {
    expect(isProvider('anthropic')).toBe(true);
    expect(isProvider('gemini')).toBe(true);
  });
  it('rejects unknown values', () => {
    expect(isProvider('openai')).toBe(false);
    expect(isProvider('')).toBe(false);
    expect(isProvider(null)).toBe(false);
    expect(isProvider(undefined)).toBe(false);
  });
});

describe('defaultModelFor', () => {
  it('returns Gemini Flash for gemini and Sonnet for anthropic', () => {
    expect(defaultModelFor('gemini')).toMatch(/gemini-/);
    expect(defaultModelFor('anthropic')).toMatch(/claude-/);
  });
});

describe('callLLM dispatch', () => {
  it('routes anthropic to api.anthropic.com and normalises usage', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: 'text', text: 'A' }],
        usage: { input_tokens: 11, output_tokens: 22 },
      }),
    );
    const res = await callLLM('hi', {
      provider: 'anthropic',
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 1000,
    });
    expect(fetchImpl.mock.calls[0][0]).toContain('api.anthropic.com');
    expect(res.text).toBe('A');
    expect(res.provider).toBe('anthropic');
    expect(res.usage).toEqual({ promptTokens: 11, outputTokens: 22, totalTokens: 33 });
  });

  it('routes gemini to generativelanguage.googleapis.com and normalises usage', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'G' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7, totalTokenCount: 12 },
      }),
    );
    const res = await callLLM('hi', {
      provider: 'gemini',
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 1000,
    });
    expect(fetchImpl.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    expect(res.text).toBe('G');
    expect(res.provider).toBe('gemini');
    expect(res.usage).toEqual({ promptTokens: 5, outputTokens: 7, totalTokens: 12 });
  });
});
