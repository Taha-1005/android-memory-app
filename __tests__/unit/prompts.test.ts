import { buildIngestPrompt, buildQueryPrompt, buildMergePrompt } from '../../src/llm/prompts';

describe('buildIngestPrompt', () => {
  it('includes the system header and the content block for text sources', () => {
    const p = buildIngestPrompt({
      title: 'Octopuses',
      kind: 'text',
      content: 'They have three hearts.',
      url: null,
    });
    expect(p).toContain('ingest engine for a personal wiki');
    expect(p).toContain('SOURCE TITLE: Octopuses');
    expect(p).toContain('They have three hearts.');
  });

  it('switches to the "cannot fetch" note for URL sources', () => {
    const p = buildIngestPrompt({
      title: 'Article',
      kind: 'url',
      content: null,
      url: 'https://example.com/a',
    });
    expect(p).toContain('https://example.com/a');
    expect(p).toContain('You cannot fetch this URL');
  });
});

describe('buildQueryPrompt', () => {
  it('renders pages as ### blocks with facts', () => {
    const p = buildQueryPrompt({
      query: 'Who is Alice?',
      pages: [{ title: 'Alice', kind: 'entity', body: 'An engineer.', facts: ['likes jazz'] }],
    });
    expect(p).toContain('### Alice (entity)');
    expect(p).toContain('- likes jazz');
    expect(p).toContain('QUESTION: Who is Alice?');
  });
});

describe('buildMergePrompt', () => {
  it('includes both pages', () => {
    const p = buildMergePrompt({
      a: { title: 'A', kind: 'entity', body: 'a', facts: [], links: [] },
      b: { title: 'B', kind: 'entity', body: 'b', facts: [], links: [] },
    });
    expect(p).toContain('PAGE A:');
    expect(p).toContain('PAGE B:');
  });
});
