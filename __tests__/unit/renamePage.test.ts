import { planRename, rewriteBodyWikilinks } from '../../src/domain/renamePage';
import { WikiPage } from '../../src/domain/types';

const mk = (over: Partial<WikiPage> = {}): WikiPage => ({
  slug: 'apple',
  title: 'Apple',
  kind: 'entity',
  body: '',
  facts: [],
  links: [],
  sources: [],
  userEdited: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...over,
});

describe('rewriteBodyWikilinks', () => {
  it('rewrites a plain occurrence', () => {
    expect(rewriteBodyWikilinks('See [[Apple]] for more.', 'Apple', 'Apple Inc.')).toBe(
      'See [[Apple Inc.]] for more.',
    );
  });

  it('is case-insensitive', () => {
    expect(rewriteBodyWikilinks('See [[apple]] / [[APPLE]].', 'Apple', 'Apple Inc.')).toBe(
      'See [[Apple Inc.]] / [[Apple Inc.]].',
    );
  });

  it('handles regex metacharacters in the old title', () => {
    expect(
      rewriteBodyWikilinks('cite [[C++ (language)]] here', 'C++ (language)', 'Cpp'),
    ).toBe('cite [[Cpp]] here');
  });

  it('returns input unchanged when nothing matches', () => {
    expect(rewriteBodyWikilinks('no link', 'Apple', 'Apple Inc.')).toBe('no link');
  });

  it('returns input when old equals new', () => {
    expect(rewriteBodyWikilinks('[[Apple]]', 'Apple', 'Apple')).toBe('[[Apple]]');
  });
});

describe('planRename', () => {
  it('updates title/body/facts in place when the slug does not change', () => {
    const existing = mk({ title: 'Apple', body: 'orig', facts: ['x'] });
    const r = planRename(
      existing,
      { newTitle: 'Apple!', newBody: 'updated', newFacts: ['x', 'y'] },
      [],
      null,
    );
    expect(r.slugChanged).toBe(false);
    expect(r.renamed.slug).toBe('apple');
    expect(r.renamed.title).toBe('Apple!');
    expect(r.renamed.body).toBe('updated');
    expect(r.renamed.facts).toEqual(['x', 'y']);
    expect(r.renamed.userEdited).toBe(true);
    expect(r.rewrittenReferers).toEqual([]);
  });

  it('changes the slug when the title produces a different slug', () => {
    const existing = mk({ slug: 'apple', title: 'Apple' });
    const r = planRename(existing, { newTitle: 'Apple Inc' }, [], null);
    expect(r.slugChanged).toBe(true);
    expect(r.renamed.slug).toBe('apple-inc');
    expect(r.renamed.title).toBe('Apple Inc');
  });

  it('rewrites referring pages when the slug changes', () => {
    const existing = mk({ slug: 'apple', title: 'Apple' });
    const refByLink = mk({
      slug: 'mac',
      title: 'Mac',
      links: ['Apple', 'Other'],
      body: 'Built by Apple.',
    });
    const refByBody = mk({
      slug: 'iphone',
      title: 'iPhone',
      links: [],
      body: 'Cousin of [[Apple]] products.',
    });
    const unrelated = mk({ slug: 'banana', title: 'Banana', body: 'no link', links: ['Other'] });
    const r = planRename(
      existing,
      { newTitle: 'Apple Inc' },
      [refByLink, refByBody, unrelated],
      null,
    );
    expect(r.slugChanged).toBe(true);
    expect(r.rewrittenReferers).toHaveLength(2);
    const macUpd = r.rewrittenReferers.find((p) => p.slug === 'mac')!;
    expect(macUpd.links).toEqual(['Apple Inc', 'Other']);
    const iphoneUpd = r.rewrittenReferers.find((p) => p.slug === 'iphone')!;
    expect(iphoneUpd.body).toBe('Cousin of [[Apple Inc]] products.');
  });

  it('throws on slug collision', () => {
    const existing = mk({ slug: 'apple', title: 'Apple' });
    const collider = mk({ slug: 'apple-inc', title: 'Apple Inc' });
    expect(() =>
      planRename(existing, { newTitle: 'Apple Inc' }, [collider], collider),
    ).toThrow(/already exists/);
  });

  it('throws on empty title', () => {
    expect(() => planRename(mk(), { newTitle: '   ' }, [], null)).toThrow(/non-empty/);
  });

  it('does not rewrite referers when only body/facts change', () => {
    const existing = mk({ slug: 'apple', title: 'Apple' });
    const ref = mk({ slug: 'mac', body: '[[Apple]]', links: ['Apple'] });
    const r = planRename(existing, { newTitle: 'Apple', newBody: 'new' }, [ref], null);
    expect(r.slugChanged).toBe(false);
    expect(r.rewrittenReferers).toEqual([]);
  });
});
