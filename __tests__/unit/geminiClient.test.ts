import {
  callGeminiAPI,
  extractGeminiText,
  DEFAULT_GEMINI_MODEL,
} from '../../src/llm/geminiClient';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('extractGeminiText', () => {
  it('joins all parts of the first candidate', () => {
    const text = extractGeminiText({
      candidates: [
        {
          content: {
            parts: [{ text: 'hello' }, { text: 'world' }],
            role: 'model',
          },
        },
      ],
    });
    expect(text).toBe('hello\nworld');
  });

  it('returns empty string when no candidates', () => {
    expect(extractGeminiText({})).toBe('');
  });
});

describe('callGeminiAPI', () => {
  it('hits the v1beta generateContent endpoint and returns text on 200', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'OK' }], role: 'model' } }],
      }),
    );
    const { text } = await callGeminiAPI('hi', {
      apiKey: 'AIzaTEST',
      fetchImpl,
      timeoutMs: 5000,
    });
    expect(text).toBe('OK');
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toContain('generativelanguage.googleapis.com');
    expect(call[0]).toContain(`models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(call[1].headers['x-goog-api-key']).toBe('AIzaTEST');
  });

  it('passes maxOutputTokens and responseMimeType in generationConfig', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
      }),
    );
    await callGeminiAPI('hi', {
      apiKey: 'k',
      model: 'gemini-2.5-flash-lite',
      maxTokens: 256,
      jsonMode: true,
      fetchImpl,
      timeoutMs: 5000,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe('hi');
    expect(body.generationConfig.maxOutputTokens).toBe(256);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(fetchImpl.mock.calls[0][0]).toContain('models/gemini-2.5-flash-lite:');
  });

  it('throws with status + body on non-2xx', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ error: { code: 401, message: 'bad key' } }, 401),
    );
    await expect(
      callGeminiAPI('hi', { apiKey: 'bad', fetchImpl, timeoutMs: 5000 }),
    ).rejects.toThrow(/Gemini API 401/);
  });

  it('times out when fetch never resolves', async () => {
    const fetchImpl = jest.fn(
      () => new Promise<Response>(() => {/* never resolves */}),
    ) as unknown as typeof fetch;
    await expect(
      callGeminiAPI('hi', { apiKey: 'k', fetchImpl, timeoutMs: 50 }),
    ).rejects.toThrow(/timed out/);
  });

  it('throws when the API key is missing', async () => {
    await expect(callGeminiAPI('hi', { apiKey: '' })).rejects.toThrow(/No Gemini API key/);
  });

  it('throws when no candidates have text', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ candidates: [] }));
    await expect(
      callGeminiAPI('hi', { apiKey: 'k', fetchImpl, timeoutMs: 5000 }),
    ).rejects.toThrow(/Empty response/);
  });
});
