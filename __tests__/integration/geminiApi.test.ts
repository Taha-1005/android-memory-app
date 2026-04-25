/**
 * Cost-free live Gemini API test (free tier).
 *
 * Mirrors the Anthropic suite: same three calls, same shape of inputs,
 * gated behind INTEGRATION=1. Bring your own GEMINI_API_KEY.
 *
 *   1. Key probe (Flash-Lite, max_tokens=10)
 *   2. One ingest (Flash-Lite, max_tokens=800, ~40 words of input)
 *   3. One query   (Flash-Lite, max_tokens=200, single tiny page in context)
 *
 * We default to gemini-2.5-flash-lite — the most generous free-tier model
 * (15 RPM, 1000 RPD). Override with GEMINI_MODEL if you want to test
 * gemini-2.5-flash instead.
 *
 * Run with:
 *   GEMINI_API_KEY=AIza... INTEGRATION=1 npm run test:integration
 *
 * Without GEMINI_API_KEY the live tests auto-skip; only the negative-path
 * sanity checks run.
 */
import { callGeminiAPI, probeGeminiKey } from '../../src/llm/geminiClient';
import { runIngest } from '../../src/llm/ingest';
import { runQuery } from '../../src/llm/query';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite';
const apiKey = process.env.GEMINI_API_KEY;

const describeIfKey = apiKey ? describe : describe.skip;

describeIfKey('Gemini API live smoke test (free tier)', () => {
  jest.setTimeout(45_000);

  it('probes the API key successfully', async () => {
    const r = await probeGeminiKey(apiKey!, { model: MODEL });
    expect(r.ok).toBe(true);
  });

  it('ingests a tiny source into at least one page', async () => {
    const pages = await runIngest(
      {
        title: 'Octopuses (tiny fact)',
        kind: 'text',
        content: 'Octopuses are cephalopods with three hearts.',
        url: null,
      },
      { provider: 'gemini', apiKey: apiKey!, model: MODEL, maxTokens: 800, timeoutMs: 30_000 },
    );
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThan(7);
    for (const p of pages) {
      expect(typeof p.title).toBe('string');
      expect(['entity', 'concept', 'source']).toContain(p.kind);
    }
  });

  it('answers a query grounded in a single in-memory page', async () => {
    const res = await runQuery(
      'How many hearts does an octopus have?',
      [
        {
          slug: 'octopuses',
          title: 'Octopuses',
          kind: 'entity',
          body: 'Octopuses are cephalopods with three hearts.',
          facts: ['Three hearts'],
          links: [],
          sources: [],
          userEdited: false,
          createdAt: '',
          updatedAt: '',
        },
      ],
      { provider: 'gemini', apiKey: apiKey!, model: MODEL, maxTokens: 200, timeoutMs: 30_000 },
    );
    expect(res.answer).toMatch(/three|3/i);
    expect(['high', 'medium', 'low']).toContain(res.confidence);
  });
});

describe('sanity when no Gemini key is set', () => {
  it('probeGeminiKey returns ok:false on an obviously bad key', async () => {
    if (apiKey) return; // skip in the real-key run
    const r = await probeGeminiKey('AIzaObviouslyInvalid', { model: MODEL });
    expect(r.ok).toBe(false);
  });

  it('callGeminiAPI refuses to run without a key', async () => {
    await expect(callGeminiAPI('hi', { apiKey: '' })).rejects.toThrow(/No Gemini API key/);
  });
});
