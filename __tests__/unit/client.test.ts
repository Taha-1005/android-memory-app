import { callClaudeAPI, extractResponseText } from '../../src/llm/client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('extractResponseText', () => {
  it('concatenates text blocks and ignores others', () => {
    const text = extractResponseText({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use' },
        { type: 'text', text: 'world' },
      ],
    });
    expect(text).toBe('hello\nworld');
  });
});

describe('callClaudeAPI', () => {
  it('returns the concatenated text on 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: 'OK' }] }),
    );
    const { text } = await callClaudeAPI('hi', {
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 5000,
    });
    expect(text).toBe('OK');
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(call[1].headers['x-api-key']).toBe('k');
    expect(call[1].headers['anthropic-version']).toBe('2023-06-01');
  });

  it('throws with status + body on non-2xx', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 401));
    await expect(
      callClaudeAPI('hi', { apiKey: 'bad', fetchImpl, timeoutMs: 5000 }),
    ).rejects.toThrow(/API 401/);
  });

  it('sends the configured model and max_tokens in the request body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: 'ok' }] }),
    );
    await callClaudeAPI('hi', {
      apiKey: 'k',
      model: 'custom-model',
      maxTokens: 42,
      fetchImpl,
      timeoutMs: 5000,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('custom-model');
    expect(body.max_tokens).toBe(42);
  });

  it('times out when fetch never resolves (even if abort is ignored)', async () => {
    // This mirrors the real-world bug the spec calls out: some RN network
    // layers silently drop AbortController.abort(). The Promise.race timeout
    // must still reject the call.
    const fetchImpl = jest.fn(
      () => new Promise<Response>(() => {/* never resolves, never rejects */}),
    ) as unknown as typeof fetch;
    await expect(
      callClaudeAPI('hi', { apiKey: 'k', fetchImpl, timeoutMs: 50 }),
    ).rejects.toThrow(/timed out/);
  });

  it('throws when the API key is missing', async () => {
    await expect(callClaudeAPI('hi', { apiKey: '' })).rejects.toThrow(/No API key/);
  });

  it('throws when the response has no text blocks', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ content: [] }));
    await expect(
      callClaudeAPI('hi', { apiKey: 'k', fetchImpl, timeoutMs: 5000 }),
    ).rejects.toThrow(/Empty response/);
  });
});
