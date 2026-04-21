import { rankPagesForQuery } from '../../src/domain/rankPages';
import { WikiPage } from '../../src/domain/types';

const mk = (slug: string, title: string, body: string, facts: string[] = []): WikiPage => ({
  slug,
  title,
  kind: 'concept',
  body,
  facts,
  links: [],
  sources: [],
  userEdited: false,
  createdAt: '',
  updatedAt: '',
});

describe('rankPagesForQuery', () => {
  it('returns nothing when the query has no scorable terms', () => {
    expect(rankPagesForQuery('a b', [mk('x', 'X', 'content here')])).toEqual([]);
  });

  it('weights title matches higher than body matches', () => {
    const titleHit = mk('t', 'Octopus', 'unrelated text');
    const bodyHit = mk('b', 'Sea creatures', 'octopus are cool');
    const ranked = rankPagesForQuery('octopus', [bodyHit, titleHit]);
    expect(ranked[0].slug).toBe('t');
  });

  it('filters pages with zero matches', () => {
    const p1 = mk('p1', 'Alpha', 'beta gamma');
    const p2 = mk('p2', 'Delta', 'epsilon');
    const ranked = rankPagesForQuery('beta', [p1, p2]);
    expect(ranked.map((p) => p.slug)).toEqual(['p1']);
  });

  it('caps results at k', () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      mk(`p${i}`, `Title ${i}`, 'widget widget widget'),
    );
    const ranked = rankPagesForQuery('widget', pages, 5);
    expect(ranked.length).toBe(5);
  });
});
