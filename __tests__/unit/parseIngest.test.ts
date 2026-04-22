import { parseIngestResponse } from '../../src/llm/ingest';
import { parseQueryResponse } from '../../src/llm/query';
import { parseMergeResponse } from '../../src/llm/merge';

describe('parseIngestResponse', () => {
  it('parses a clean JSON payload and normalises fields', () => {
    const raw = JSON.stringify({
      pages: [
        {
          title: 'Alice',
          kind: 'entity',
          body: 'About [[Bob]]',
          facts: ['f1'],
          links: ['Bob'],
        },
      ],
    });
    const pages = parseIngestResponse(raw);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('Alice');
    expect(pages[0].facts).toEqual(['f1']);
  });

  it('tolerates fenced JSON and preamble', () => {
    const raw = 'Sure!\n```json\n{"pages":[{"title":"X","kind":"concept","body":"b","facts":[],"links":[]}]}\n```';
    const pages = parseIngestResponse(raw);
    expect(pages[0].title).toBe('X');
  });

  it('throws on zero pages', () => {
    expect(() => parseIngestResponse('{"pages":[]}')).toThrow(/zero pages/);
  });

  it('coerces invalid kinds to "concept"', () => {
    const raw = '{"pages":[{"title":"Y","kind":"bogus","body":"b","facts":[],"links":[]}]}';
    const pages = parseIngestResponse(raw);
    expect(pages[0].kind).toBe('concept');
  });
});

describe('parseQueryResponse', () => {
  it('normalises confidence and arrays', () => {
    const res = parseQueryResponse('{"answer":"Hi","cited":["A"],"confidence":"medium"}');
    expect(res.confidence).toBe('medium');
    expect(res.cited).toEqual(['A']);
  });

  it('defaults confidence to "low" on unknown values', () => {
    const res = parseQueryResponse('{"answer":"Hi","cited":[],"confidence":"???"}');
    expect(res.confidence).toBe('low');
  });
});

describe('parseMergeResponse', () => {
  it('returns a clean IncomingPage', () => {
    const raw = '{"title":"Merged","kind":"entity","body":"b","facts":["f"],"links":["L"]}';
    const p = parseMergeResponse(raw);
    expect(p.title).toBe('Merged');
    expect(p.kind).toBe('entity');
  });
});
