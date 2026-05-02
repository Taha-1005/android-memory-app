import {
  INGEST_TOOL,
  QUERY_TOOL,
  MERGE_TOOL,
  buildIngestPrompt,
  buildQueryPrompt,
  buildMergePrompt,
} from '../../src/llm/prompts';

describe('buildIngestPrompt', () => {
  it('puts the persona/schema in system and the content in user', () => {
    const p = buildIngestPrompt({
      title: 'Octopuses',
      kind: 'text',
      content: 'They have three hearts.',
      url: null,
    });
    expect(p.system).toContain('ingest engine for a personal wiki');
    expect(p.user).toContain('SOURCE TITLE: Octopuses');
    expect(p.user).toContain('They have three hearts.');
    expect(p.tool).toBe(INGEST_TOOL);
  });

  it('switches to the "cannot fetch" note for URL sources', () => {
    const p = buildIngestPrompt({
      title: 'Article',
      kind: 'url',
      content: null,
      url: 'https://example.com/a',
    });
    expect(p.user).toContain('https://example.com/a');
    expect(p.user).toContain('You cannot fetch this URL');
  });
});

describe('buildQueryPrompt', () => {
  it('renders pages as ### blocks with facts and emits a query tool', () => {
    const p = buildQueryPrompt({
      query: 'Who is Alice?',
      pages: [{ title: 'Alice', kind: 'entity', body: 'An engineer.', facts: ['likes jazz'] }],
    });
    expect(p.user).toContain('### Alice (entity)');
    expect(p.user).toContain('- likes jazz');
    expect(p.user).toContain('QUESTION: Who is Alice?');
    expect(p.tool).toBe(QUERY_TOOL);
  });
});

describe('buildMergePrompt', () => {
  it('includes both pages and emits a merge tool', () => {
    const p = buildMergePrompt({
      a: { title: 'A', kind: 'entity', body: 'a', facts: [], links: [] },
      b: { title: 'B', kind: 'entity', body: 'b', facts: [], links: [] },
    });
    expect(p.user).toContain('PAGE A:');
    expect(p.user).toContain('PAGE B:');
    expect(p.tool).toBe(MERGE_TOOL);
  });
});
