import { computeBacklinks } from '../../src/domain/backlinks';
import { WikiPage } from '../../src/domain/types';

const mk = (slug: string, title: string, body: string, links: string[] = []): WikiPage => ({
  slug,
  title,
  kind: 'concept',
  body,
  facts: [],
  links,
  sources: [],
  userEdited: false,
  createdAt: '',
  updatedAt: '',
});

describe('computeBacklinks', () => {
  it('finds links via explicit links array', () => {
    const target = mk('alice', 'Alice', '');
    const other = mk('bob', 'Bob', 'no mention', ['Alice']);
    expect(computeBacklinks(target, [target, other])).toEqual([other]);
  });

  it('finds links via [[Title]] markup in body (case-insensitive)', () => {
    const target = mk('alice', 'Alice', '');
    const other = mk('bob', 'Bob', 'Met [[alice]] last week.');
    expect(computeBacklinks(target, [target, other])).toEqual([other]);
  });

  it('never returns the target itself', () => {
    const target = mk('alice', 'Alice', '[[Alice]]', ['Alice']);
    expect(computeBacklinks(target, [target])).toEqual([]);
  });
});
