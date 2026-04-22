import { createMemDb } from '../helpers/memDb';
import { setDb, resetDbForTests, getDb } from '../../src/db/client';
import {
  upsertPage,
  getPage,
  listPages,
  searchPages,
  deletePage,
  countPages,
} from '../../src/db/repositories/pages';
import {
  insertLog,
  updateLog,
  listLog,
  getLog,
  deleteLog,
  deleteLogBySlug,
  resetOrphanedProcessing,
} from '../../src/db/repositories/sourceLog';
import { WikiPage, SourceLogEntry } from '../../src/domain/types';

const mkPage = (over: Partial<WikiPage> = {}): WikiPage => ({
  slug: 'alice',
  title: 'Alice',
  kind: 'entity',
  body: 'About [[Bob]].',
  facts: ['a'],
  links: ['Bob'],
  sources: [],
  userEdited: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

const mkLog = (over: Partial<SourceLogEntry> = {}): SourceLogEntry => ({
  id: 'src_1',
  slug: 'alice',
  kind: 'text',
  title: 'Alice',
  content: 'content',
  url: null,
  timestamp: new Date().toISOString(),
  processed: false,
  processing: false,
  error: null,
  ...over,
});

describe('pages repository', () => {
  beforeEach(() => {
    resetDbForTests();
    setDb(createMemDb());
  });

  it('upserts, reads, and lists pages', async () => {
    const db = getDb();
    await upsertPage(db, mkPage());
    await upsertPage(db, mkPage({ slug: 'bob', title: 'Bob' }));
    const all = await listPages(db);
    expect(all.map((p) => p.slug).sort()).toEqual(['alice', 'bob']);
    const one = await getPage(db, 'alice');
    expect(one?.title).toBe('Alice');
    expect(one?.facts).toEqual(['a']);
    expect(await countPages(db)).toBe(2);
  });

  it('searches by title, body, and facts (case-insensitive)', async () => {
    const db = getDb();
    await upsertPage(db, mkPage());
    await upsertPage(db, mkPage({ slug: 'bob', title: 'Bob', body: 'no match', facts: [] }));
    const r1 = await searchPages(db, 'ALICE');
    expect(r1.map((p) => p.slug)).toEqual(['alice']);
    const r2 = await searchPages(db, 'bob'); // in Alice's body wikilink
    expect(r2.map((p) => p.slug).sort()).toEqual(['alice', 'bob']);
  });

  it('deletes pages', async () => {
    const db = getDb();
    await upsertPage(db, mkPage());
    await deletePage(db, 'alice');
    expect(await getPage(db, 'alice')).toBeNull();
  });
});

describe('source log repository', () => {
  beforeEach(() => {
    resetDbForTests();
    setDb(createMemDb());
  });

  it('inserts, updates, lists, and deletes log entries', async () => {
    const db = getDb();
    await insertLog(db, mkLog());
    await updateLog(db, 'src_1', { processing: true });
    const entry = await getLog(db, 'src_1');
    expect(entry?.processing).toBe(true);
    expect((await listLog(db))[0].id).toBe('src_1');
    await deleteLog(db, 'src_1');
    expect(await getLog(db, 'src_1')).toBeNull();
  });

  it('deletes by slug', async () => {
    const db = getDb();
    await insertLog(db, mkLog());
    await deleteLogBySlug(db, 'alice');
    expect(await getLog(db, 'src_1')).toBeNull();
  });

  it('resets stuck processing rows with an informative error', async () => {
    const db = getDb();
    await insertLog(db, mkLog({ processing: true }));
    const changes = await resetOrphanedProcessing(db);
    expect(changes).toBe(1);
    const row = await getLog(db, 'src_1');
    expect(row?.processing).toBe(false);
    expect(row?.error).toMatch(/interrupted/);
  });
});
