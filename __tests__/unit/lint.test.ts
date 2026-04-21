import { computeLint, normalizeTitle } from '../../src/domain/lint';
import { WikiPage } from '../../src/domain/types';

const mk = (over: Partial<WikiPage>): WikiPage => ({
  slug: 'x',
  title: 'X',
  kind: 'concept',
  body: '',
  facts: [],
  links: [],
  sources: [],
  userEdited: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...over,
});

describe('normalizeTitle', () => {
  it('strips the documented stopwords (the/a/an), punctuation, and orders tokens', () => {
    expect(normalizeTitle('The Alice Book')).toBe(normalizeTitle('A Book Alice'));
  });

  it('does NOT strip words outside the stopword list', () => {
    // "of" is intentionally kept per the spec — verify it shows up.
    expect(normalizeTitle('Book of Alice').split(' ')).toContain('of');
  });
});

describe('computeLint', () => {
  it('flags orphans, thin, stale, and duplicate groups correctly', () => {
    const stale = new Date(Date.now() - 90 * 86400_000).toISOString();
    const recent = new Date().toISOString();
    const pages: WikiPage[] = [
      // Alice has no inbound links → orphan.
      mk({ slug: 'alice', title: 'Alice', body: 'About [[Bob]]', links: ['Bob'], updatedAt: recent, facts: ['f'] }),
      // Bob has empty body + 0 facts → thin. Alice links to Bob so Bob has a backlink.
      mk({ slug: 'bob', title: 'Bob', body: '', updatedAt: recent }),
      // Old page is stale (>60 days) but not orphan (linked from Bob below).
      mk({ slug: 'old', title: 'Old Thing', body: 'x'.repeat(200), facts: ['f'], updatedAt: stale }),
      // Reference the old page so it isn't an orphan.
      mk({ slug: 'refs-old', title: 'Refs Old', body: 'See [[Old Thing]]', links: ['Old Thing'], facts: ['f'], updatedAt: recent }),
      // Duplicate pair — same normalized title ("thing").
      mk({ slug: 'dup-a', title: 'The Thing', body: 'ok'.repeat(50), links: ['A'], facts: ['f'], updatedAt: recent }),
      mk({ slug: 'dup-b', title: 'A Thing', body: 'ok'.repeat(50), links: ['A'], facts: ['f'], updatedAt: recent }),
    ];
    const r = computeLint(pages);
    expect(r.orphans.some((p) => p.slug === 'alice')).toBe(true);
    expect(r.orphans.some((p) => p.slug === 'bob')).toBe(false);
    expect(r.thin.some((p) => p.slug === 'bob')).toBe(true);
    expect(r.stale.some((p) => p.slug === 'old')).toBe(true);
    const dupSlugs = r.duplicateGroups.flat().map((p) => p.slug).sort();
    expect(dupSlugs).toEqual(['dup-a', 'dup-b']);
  });

  it('ignores source-kind pages for lint checks', () => {
    const pages: WikiPage[] = [
      mk({ slug: 's', kind: 'source', title: 'Src', body: 'short' }),
    ];
    const r = computeLint(pages);
    expect(r.orphans).toEqual([]);
    expect(r.thin).toEqual([]);
  });
});
