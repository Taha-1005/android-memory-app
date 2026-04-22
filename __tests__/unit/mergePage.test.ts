import { mergePage } from '../../src/domain/mergePage';
import { WikiPage, IncomingPage } from '../../src/domain/types';

function basePage(over: Partial<WikiPage> = {}): WikiPage {
  return {
    slug: 'alice',
    title: 'Alice',
    kind: 'entity',
    body: 'Existing body about [[Bob]].',
    facts: ['a fact'],
    links: ['Bob'],
    sources: ['src1'],
    userEdited: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...over,
  };
}

function incoming(over: Partial<IncomingPage> = {}): IncomingPage {
  return {
    title: 'Alice',
    kind: 'entity',
    body: 'New body.',
    facts: ['new fact'],
    links: ['Carol'],
    ...over,
  };
}

describe('mergePage', () => {
  it('creates a fresh page when there is no existing page', () => {
    const m = mergePage(null, incoming(), 'src-new');
    expect(m.slug).toBe('alice');
    expect(m.body).toBe('New body.');
    expect(m.sources).toEqual(['src-new']);
    expect(m.userEdited).toBe(false);
  });

  it('protects user-edited bodies from LLM overwrite', () => {
    const m = mergePage(basePage({ userEdited: true, body: 'MINE' }), incoming(), 'src2');
    expect(m.body).toBe('MINE');
  });

  it('overwrites body when not user-edited', () => {
    const m = mergePage(basePage(), incoming({ body: 'fresh' }), 'src2');
    expect(m.body).toBe('fresh');
  });

  it('keeps kind="source" sticky even if incoming says otherwise', () => {
    const m = mergePage(basePage({ kind: 'source' }), incoming({ kind: 'entity' }), null);
    expect(m.kind).toBe('source');
  });

  it('unions facts, links, sources without duplicates', () => {
    const m = mergePage(basePage(), incoming({ facts: ['a fact', 'extra'] }), 'src1');
    expect(m.facts.sort()).toEqual(['a fact', 'extra']);
    expect(m.links.sort()).toEqual(['Bob', 'Carol']);
    expect(m.sources).toEqual(['src1']);
  });
});
