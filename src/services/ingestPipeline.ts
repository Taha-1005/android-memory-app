import { SourceLogEntry, WikiPage, IncomingPage } from '../domain/types';
import { mergePage } from '../domain/mergePage';
import { slugify } from '../domain/slugify';
import { runIngest } from '../llm/ingest';
import { getDb } from '../db/client';
import { getApiKey, getModel, getProvider } from '../secure/apiKey';
import { getPage, upsertPage } from '../db/repositories/pages';
import { getLog, updateLog, insertLog } from '../db/repositories/sourceLog';
import { nowIso } from '../utils/time';
import { toErrorMessage } from '../utils/errors';

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

export interface IngestPrep {
  incoming: IncomingPage[];
  sourceSlug: string;
}

export interface IngestDecision {
  page: IncomingPage;
  skip: boolean;
}

/**
 * Phase 1 of ingestion: run the LLM and return candidate pages without
 * upserting. The caller is responsible for invoking applyIngestResults
 * (or markIngestFailed on error) so the source_log row reaches a
 * terminal state. Splitting the pipeline lets callers insert a duplicate
 * cross-check between the LLM call and the upsert loop.
 */
export async function runIngestForLog(logId: string): Promise<IngestPrep> {
  const db = getDb();
  const provider = await getProvider();
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured.');
  const model = await getModel();

  await updateLog(db, logId, { processing: true, error: null });

  try {
    const entry = await getLog(db, logId);
    if (!entry) throw new Error('Source log entry not found.');

    const incoming = await runIngest(
      {
        title: entry.title,
        kind: entry.kind,
        content: entry.content,
        url: entry.url,
      },
      { provider, apiKey, model },
    );

    const sourcePage = incoming.find((p) => p.kind === 'source');
    const sourceSlug = sourcePage ? slugify(sourcePage.title) : entry.slug;
    return { incoming, sourceSlug };
  } catch (e) {
    await updateLog(db, logId, { processing: false, processed: false, error: toErrorMessage(e) });
    throw e;
  }
}

export async function applyIngestResults(
  logId: string,
  prep: IngestPrep,
  decisions: IngestDecision[],
): Promise<number> {
  const db = getDb();
  let written = 0;
  try {
    for (const { page, skip } of decisions) {
      if (skip) continue;
      const slug = slugify(page.title);
      const existing = await getPage(db, slug);
      const merged = mergePage(existing, page, prep.sourceSlug);
      await upsertPage(db, merged);
      written++;
    }
    await updateLog(db, logId, {
      processing: false,
      processed: true,
      processedAt: nowIso(),
      pagesCreated: written,
      error: null,
    });
    return written;
  } catch (e) {
    await updateLog(db, logId, { processing: false, processed: false, error: toErrorMessage(e) });
    throw e;
  }
}

export async function processSource(logId: string): Promise<number> {
  const prep = await runIngestForLog(logId);
  return applyIngestResults(
    logId,
    prep,
    prep.incoming.map((page) => ({ page, skip: false })),
  );
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
