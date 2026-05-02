import { parseImport } from '../../src/services/exportImport';

const makePage = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  slug: 'apple',
  title: 'Apple',
  kind: 'entity',
  body: 'b',
  facts: ['x'],
  links: [],
  sources: [],
  userEdited: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  ...over,
});

const wrap = (pages: unknown[], log: unknown[] = []): string =>
  JSON.stringify({ version: 1, exportedAt: '2024-01-01T00:00:00.000Z', pages, log });

describe('parseImport', () => {
  it('accepts a clean payload', () => {
    const out = parseImport(wrap([makePage()]));
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].slug).toBe('apple');
  });

  it('rejects non-JSON', () => {
    expect(() => parseImport('not json')).toThrow(/valid JSON/);
  });

  it('rejects wrong version', () => {
    expect(() => parseImport(JSON.stringify({ version: 2, pages: [] }))).toThrow(/version=1/);
  });

  it('rejects missing pages array', () => {
    expect(() => parseImport(JSON.stringify({ version: 1 }))).toThrow(/pages\[\]/);
  });

  it('rejects a slug with path traversal characters', () => {
    expect(() => parseImport(wrap([makePage({ slug: '../etc' })]))).toThrow(/slug/);
  });

  it('rejects an unknown kind', () => {
    expect(() => parseImport(wrap([makePage({ kind: 'evil' })]))).toThrow(/kind/);
  });

  it('rejects an empty title', () => {
    expect(() => parseImport(wrap([makePage({ title: '   ' })]))).toThrow(/title/);
  });

  it('rejects bad timestamps', () => {
    expect(() => parseImport(wrap([makePage({ updatedAt: 'yesterday' })]))).toThrow(/ISO/);
  });

  it('drops malformed log entries silently rather than failing the import', () => {
    const out = parseImport(
      wrap(
        [makePage()],
        [
          { id: '', slug: 'x', kind: 'text', title: 't', timestamp: '2024-01-01T00:00:00.000Z' },
          { id: 'good', slug: 'apple', kind: 'text', title: 't', timestamp: '2024-01-01T00:00:00.000Z' },
        ],
      ),
    );
    expect(out.log).toHaveLength(1);
    expect(out.log[0].id).toBe('good');
  });

  it('does not preserve processing=true through import', () => {
    const out = parseImport(
      wrap(
        [makePage()],
        [
          {
            id: 'good',
            slug: 'apple',
            kind: 'text',
            title: 't',
            timestamp: '2024-01-01T00:00:00.000Z',
            processing: true,
          },
        ],
      ),
    );
    expect(out.log[0].processing).toBe(false);
  });
});
