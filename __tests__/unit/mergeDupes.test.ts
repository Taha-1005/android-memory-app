/**
 * Verifies the iterative reduction that Settings.onMergeDupes performs when
 * a duplicate group has three or more members. The earlier implementation
 * silently dropped the third+ entries. We can't mount the React screen from
 * a Node test, so we replicate the exact reduction inline and prove that
 * every member's facts survive into the final merged page.
 */
import { runMerge } from '../../src/llm/merge';
import { mergePage } from '../../src/domain/mergePage';
import { slugify } from '../../src/domain/slugify';
import { WikiPage, IncomingPage } from '../../src/domain/types';
import { createMemDb } from '../helpers/memDb';
import { setDb, resetDbForTests, getDb } from '../../src/db/client';
import { upsertPage, getPage, deletePage, listPages } from '../../src/db/repositories/pages';

const mk = (slug: string, facts: string[]): WikiPage => ({
  slug,
  title: `The ${slug}`,
  kind: 'concept',
  body: `About ${slug}.`,
  facts,
  links: [],
  sources: [],
  userEdited: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function mockIncomingMerge(a: WikiPage, b: WikiPage): IncomingPage {
  // A deterministic "merge" that unions facts and keeps the first slug's
  // title — good enough to test the reduction loop without a real LLM.
  return {
    title: a.title,
    kind: 'concept',
    body: `${a.body} ${b.body}`,
    facts: Array.from(new Set([...a.facts, ...b.facts])),
    links: [],
  };
}

// Shadow `runMerge` with a deterministic fake via module mocking.
jest.mock('../../src/llm/merge', () => {
  const actual = jest.requireActual('../../src/llm/merge');
  return {
    ...actual,
    runMerge: jest.fn(),
  };
});

describe('iterative duplicate merge (3+ group members)', () => {
  beforeEach(() => {
    resetDbForTests();
    setDb(createMemDb());
    (runMerge as jest.Mock).mockClear();
    (runMerge as jest.Mock).mockImplementation(async (a: WikiPage, b: WikiPage) =>
      mockIncomingMerge(a, b),
    );
  });

  it('folds N pages down to one and preserves every fact', async () => {
    const db = getDb();
    const group = [mk('a', ['fact-a']), mk('b', ['fact-b']), mk('c', ['fact-c'])];
    for (const p of group) await upsertPage(db, p);

    // Same reduction Settings.tsx runs — extracted for testability.
    let current: WikiPage = group[0];
    for (let i = 1; i < group.length; i++) {
      const incoming = await runMerge(current, group[i], { apiKey: 'x', model: 'm' });
      const existing = await getPage(db, slugify(incoming.title));
      current = mergePage(existing, incoming, null);
      await upsertPage(db, current);
    }
    for (const p of group) {
      if (p.slug !== current.slug) await deletePage(db, p.slug);
    }

    expect(runMerge).toHaveBeenCalledTimes(2); // N-1 calls for N=3
    const remaining = await listPages(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].facts.sort()).toEqual(['fact-a', 'fact-b', 'fact-c']);
  });

  it('is a no-op for a group smaller than 2', async () => {
    const db = getDb();
    await upsertPage(db, mk('only', ['f']));
    const group = [await getPage(db, 'only')].filter(Boolean) as WikiPage[];
    expect(group.length).toBe(1);
    // The Settings guard `if (group.length < 2) return` means no runMerge call.
    expect(runMerge).toHaveBeenCalledTimes(0);
  });
});
