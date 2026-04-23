/**
 * Cost-minimal live Anthropic API test.
 *
 * Only runs when INTEGRATION=1 is set (see jest.config.js).
 * It's bounded to THREE calls total across the full app surface:
 *   1. Key probe (Haiku, max_tokens=5)
 *   2. One ingest (Haiku, max_tokens=800, ~40 words of input)
 *   3. One query   (Haiku, max_tokens=200, single tiny page in context)
 *
 * We use the cheapest Claude model (haiku-4-5) and keep both input and
 * output tokens tiny to stay under ~$0.001 per full run.
 *
 * Run with:
 *   ANTHROPIC_API_KEY=sk-ant-... INTEGRATION=1 npm run test:integration
 */
import { callClaudeAPI, probeApiKey } from '../../src/llm/client';
import { runIngest } from '../../src/llm/ingest';
import { runQuery } from '../../src/llm/query';

const MODEL = 'claude-haiku-4-5-20251001';
const apiKey = process.env.ANTHROPIC_API_KEY;

const describeIfKey = apiKey ? describe : describe.skip;

describeIfKey('Anthropic API live smoke test (minimal cost)', () => {
  jest.setTimeout(30_000);

  it('probes the API key successfully', async () => {
    const r = await probeApiKey(apiKey!, { model: MODEL });
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
      { apiKey: apiKey!, model: MODEL, maxTokens: 800, timeoutMs: 25_000 },
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
      { apiKey: apiKey!, model: MODEL, maxTokens: 200, timeoutMs: 25_000 },
    );
    expect(res.answer).toMatch(/three|3/i);
    expect(['high', 'medium', 'low']).toContain(res.confidence);
  });
});

describe('sanity when no key is set', () => {
  it('probeApiKey returns ok:false and surfaces the failure', async () => {
    if (apiKey) return; // skip in the real-key run
    const r = await probeApiKey('sk-ant-obviously-invalid');
    expect(r.ok).toBe(false);
  });

  it('callClaudeAPI refuses to run without a key', async () => {
    await expect(callClaudeAPI('hi', { apiKey: '' })).rejects.toThrow(/No API key/);
  });
});
