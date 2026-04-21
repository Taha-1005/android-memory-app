/**
 * End-to-end pipeline test with a mocked fetch + in-memory DB +
 * injected secure store. Exercises save → process → page upsert →
 * log row marked processed.
 */
import { createMemDb } from '../helpers/memDb';
import { setDb, resetDbForTests, getDb } from '../../src/db/client';
import { setSecureStoreForTests } from '../../src/secure/apiKey';
import { saveSource, processSource } from '../../src/services/ingestPipeline';
import { listPages, getPage } from '../../src/db/repositories/pages';
import { listLog } from '../../src/db/repositories/sourceLog';

const fakePages = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        pages: [
          {
            title: 'Octopuses',
            kind: 'entity',
            body: 'Cephalopod. See [[Cephalopoda]].',
            facts: ['Three hearts'],
            links: ['Cephalopoda'],
          },
          {
            title: 'Article: Octopuses',
            kind: 'source',
            body: 'Captured from text.',
            facts: [],
            links: ['Octopuses'],
          },
        ],
      }),
    },
  ],
};

describe('ingest pipeline (mocked fetch)', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    resetDbForTests();
    setDb(createMemDb());
    const store = new Map<string, string>();
    setSecureStoreForTests({
      getItemAsync: async (k: string) => store.get(k) ?? null,
      setItemAsync: async (k: string, v: string) => void store.set(k, v),
      deleteItemAsync: async (k: string) => void store.delete(k),
    });
    store.set('anthropic_api_key', 'sk-test');
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fakePages,
      text: async () => JSON.stringify(fakePages),
    }));
  });

  afterEach(() => {
    (globalThis as any).fetch = origFetch;
    setSecureStoreForTests(null);
  });

  it('saves a source, processes it, and creates two pages + marks log processed', async () => {
    const entry = await saveSource({
      title: 'Octopuses',
      kind: 'text',
      content: 'Octopuses have three hearts and eight arms.',
      url: null,
    });
    const created = await processSource(entry.id);
    expect(created).toBe(2);

    const db = getDb();
    const pages = await listPages(db);
    const titles = pages.map((p) => p.title).sort();
    expect(titles).toEqual(['Article: Octopuses', 'Octopuses']);
    const oct = await getPage(db, 'octopuses');
    expect(oct?.kind).toBe('entity');
    expect(oct?.facts).toContain('Three hearts');

    const log = await listLog(db);
    expect(log[0].processed).toBe(true);
    expect(log[0].processing).toBe(false);
    expect(log[0].pagesCreated).toBe(2);
  });

  it('records an error on the log row when processing fails', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'invalid key',
    }));
    const entry = await saveSource({
      title: 'Bad',
      kind: 'text',
      content: 'x',
      url: null,
    });
    await expect(processSource(entry.id)).rejects.toThrow(/API 401/);
    const db = getDb();
    const log = await listLog(db);
    expect(log[0].error).toMatch(/401/);
    expect(log[0].processing).toBe(false);
    expect(log[0].processed).toBe(false);
  });
});
