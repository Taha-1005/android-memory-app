/**
 * Unified live-API integration suite for every supported provider.
 *
 * Gate: INTEGRATION=1. That env var is the single switch — it does NOT
 * also check whether a key is present. Flipping the flag on without
 * configuring keys is a configuration error and the suite will fail
 * loudly, which is the intended contract:
 *
 *     npm run test:integration               # nothing without flag
 *     INTEGRATION=1 jest __tests__/integration   # runs both providers
 *
 * Project rule: every Claude call routed through callLLM uses Sonnet 4.6.
 * The ANTHROPIC_MODEL override is therefore informational only — callLLM
 * pins the model regardless. Direct callClaudeAPI guardrail tests still
 * honour the passed model.
 *
 * Required env (when INTEGRATION=1):
 *   ANTHROPIC_API_KEY   for the anthropic row
 *   GEMINI_API_KEY      for the gemini row
 *
 * Optional env:
 *   GEMINI_MODEL        defaults to gemini-2.5-flash-lite
 *
 * Adding a third provider in future is a one-row change to PROVIDERS.
 */
import { runIngest } from '../../src/llm/ingest';
import { runQuery } from '../../src/llm/query';
import { runDuplicateCheck, runDuplicateScan } from '../../src/llm/duplicates';
import { callClaudeAPI } from '../../src/llm/client';
import { callGeminiAPI } from '../../src/llm/geminiClient';
import { Provider, probeProviderKey } from '../../src/llm/provider';
import { WikiPage } from '../../src/domain/types';

interface ProviderRow {
  label: string;
  provider: Provider;
  envKey: string;
  defaultModel: string;
  envModelOverride: string;
}

const PROVIDERS: ProviderRow[] = [
  {
    label: 'anthropic',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    // callLLM pins Anthropic to Sonnet 4.6 regardless; this is informational.
    defaultModel: 'claude-sonnet-4-6',
    envModelOverride: 'ANTHROPIC_MODEL',
  },
  {
    label: 'gemini',
    provider: 'gemini',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash-lite',
    envModelOverride: 'GEMINI_MODEL',
  },
];

describe.each(PROVIDERS)('$label live smoke test', (row) => {
  jest.setTimeout(45_000);

  const apiKey = process.env[row.envKey] ?? '';
  const model = process.env[row.envModelOverride] ?? row.defaultModel;

  it(`requires ${row.envKey} to be set when INTEGRATION=1`, () => {
    expect(apiKey).not.toBe('');
  });

  it('probes the API key successfully', async () => {
    const r = await probeProviderKey(row.provider, apiKey, { model });
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
      {
        provider: row.provider,
        apiKey,
        model,
        maxTokens: 800,
        timeoutMs: 30_000,
      },
    );
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThan(7);
    for (const p of pages) {
      expect(typeof p.title).toBe('string');
      expect(['entity', 'concept', 'source']).toContain(p.kind);
    }
  });

  it('duplicate scan flags two pages about the same entity', async () => {
    const corpus: WikiPage[] = [
      {
        slug: 'apple-inc',
        title: 'Apple Inc',
        kind: 'entity',
        body: 'Apple Inc. is a technology company headquartered in Cupertino.',
        facts: ['Founded 1976', 'HQ Cupertino'],
        links: [],
        sources: [],
        userEdited: false,
        createdAt: '',
        updatedAt: '',
      },
      {
        slug: 'apple-company',
        title: 'Apple (company)',
        kind: 'entity',
        body: 'Apple is the consumer-electronics company behind the iPhone and Mac.',
        facts: ['Makes iPhone', 'Founded by Steve Jobs'],
        links: [],
        sources: [],
        userEdited: false,
        createdAt: '',
        updatedAt: '',
      },
      {
        slug: 'apple-fruit',
        title: 'Apple (fruit)',
        kind: 'concept',
        body: 'A pomaceous fruit produced by Malus domestica.',
        facts: ['Grows on trees'],
        links: [],
        sources: [],
        userEdited: false,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const report = await runDuplicateScan(corpus, {
      provider: row.provider,
      apiKey,
      model,
      maxTokens: 1500,
      timeoutMs: 30_000,
    });
    expect(report.groups.length).toBeGreaterThanOrEqual(1);
    const dupeGroup = report.groups.find(
      (g) => g.slugs.includes('apple-inc') && g.slugs.includes('apple-company'),
    );
    expect(dupeGroup).toBeDefined();
    expect(dupeGroup!.slugs).not.toContain('apple-fruit');
  });

  it('duplicate check spots an obvious overlap with an existing page', async () => {
    const existing: WikiPage[] = [
      {
        slug: 'octopuses',
        title: 'Octopuses',
        kind: 'entity',
        body: 'Octopuses are cephalopods with three hearts.',
        facts: ['Three hearts', 'Cephalopod'],
        links: [],
        sources: [],
        userEdited: false,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const result = await runDuplicateCheck(
      {
        title: 'Octopus',
        kind: 'entity',
        body: 'The octopus is a cephalopod with three hearts and blue blood.',
        facts: ['Three hearts', 'Blue blood'],
        links: [],
      },
      existing,
      { provider: row.provider, apiKey, model, maxTokens: 800, timeoutMs: 30_000 },
    );
    expect(result.status).toBe('duplicate');
    expect(result.existingSlug).toBe('octopuses');
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
      {
        provider: row.provider,
        apiKey,
        model,
        maxTokens: 200,
        timeoutMs: 30_000,
      },
    );
    expect(res.answer).toMatch(/three|3/i);
    expect(['high', 'medium', 'low']).toContain(res.confidence);
  });
});

describe('client-level guardrails (offline)', () => {
  it('callClaudeAPI rejects when given an empty key', async () => {
    await expect(callClaudeAPI('hi', { apiKey: '' })).rejects.toThrow(/No API key/);
  });

  it('callGeminiAPI rejects when given an empty key', async () => {
    await expect(callGeminiAPI('hi', { apiKey: '' })).rejects.toThrow(/No Gemini API key/);
  });
});
