import { SourceLogEntry, WikiPage, IncomingPage } from '../domain/types';
import { mergePage } from '../domain/mergePage';
import { slugify } from '../domain/slugify';
import { runIngest } from '../llm/ingest';
import { getDb } from '../db/client';
import { getApiKey, getModel, getProvider } from '../secure/apiKey';
import { getPage, upsertPage } from '../db/repositories/pages';
import { updateLog, insertLog } from '../db/repositories/sourceLog';
import { nowIso } from '../utils/time';

export function generateLogId(): string {
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSource(params: {
  title: string;
  kind: 'text' | 'url';
  content: string | null;
  url: string | null;
}): Promise<SourceLogEntry> {
  const db = getDb();
  const entry: SourceLogEntry = {
    id: generateLogId(),
    slug: slugify(params.title),
    kind: params.kind,
    title: params.title,
    content: params.content,
    url: params.url,
    timestamp: nowIso(),
    processed: false,
    processing: false,
    error: null,
  };
  await insertLog(db, entry);
  return entry;
}

export async function processSource(logId: string): Promise<number> {
  const db = getDb();
  const provider = await getProvider();
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured.');
  const model = await getModel();

  await updateLog(db, logId, { processing: true, error: null });

  try {
    const row = await db.getFirstAsync<{
      id: string;
      slug: string;
      kind: 'text' | 'url';
      title: string;
      content: string | null;
      url: string | null;
    }>(`SELECT id, slug, kind, title, content, url FROM source_log WHERE id = ?;`, [logId]);
    if (!row) throw new Error('Source log entry not found.');

    const incoming = await runIngest(
      {
        title: row.title,
        kind: row.kind,
        content: row.content,
        url: row.url,
      },
      { provider, apiKey, model },
    );

    const sourcePage = incoming.find((p) => p.kind === 'source');
    const sourceSlug = sourcePage ? slugify(sourcePage.title) : row.slug;

    for (const p of incoming) {
      const slug = slugify(p.title);
      const existing = await getPage(db, slug);
      const merged = mergePage(existing, p, sourceSlug);
      await upsertPage(db, merged);
    }

    await updateLog(db, logId, {
      processing: false,
      processed: true,
      processedAt: nowIso(),
      pagesCreated: incoming.length,
      error: null,
    });
    return incoming.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateLog(db, logId, {
      processing: false,
      processed: false,
      error: msg,
    });
    throw e;
  }
}

export async function fileAnswerAsPage(params: {
  title: string;
  kind: 'concept' | 'entity';
  body: string;
  cited: string[];
}): Promise<WikiPage> {
  const db = getDb();
  const slug = slugify(params.title);
  const existing = await getPage(db, slug);
  const incoming: IncomingPage = {
    title: params.title,
    kind: params.kind,
    body: params.body,
    facts: [],
    links: params.cited,
  };
  const merged = mergePage(existing, incoming, null);
  merged.filedFromQuery = true;
  await upsertPage(db, merged);
  return merged;
}
