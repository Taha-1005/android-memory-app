import { ExportState, PageKind, SourceLogEntry, WikiPage } from '../domain/types';
import { mergeStates } from '../domain/mergeStates';
import { getDb } from '../db/client';
import { listPages, upsertPage } from '../db/repositories/pages';
import { insertLog, listLog } from '../db/repositories/sourceLog';
import { nowIso } from '../utils/time';

export async function buildExport(): Promise<ExportState> {
  const db = getDb();
  const [pages, log] = await Promise.all([listPages(db), listLog(db)]);
  return { version: 1, exportedAt: nowIso(), pages, log };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const ALLOWED_KINDS: PageKind[] = ['entity', 'concept', 'source'];
const ALLOWED_LOG_KINDS: SourceLogEntry['kind'][] = ['text', 'url'];

function isIsoString(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function validatePage(raw: unknown, index: number): WikiPage {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`pages[${index}] is not an object.`);
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.slug !== 'string' || !SLUG_RE.test(p.slug)) {
    throw new Error(`pages[${index}].slug is missing or not a clean slug.`);
  }
  if (typeof p.title !== 'string' || !p.title.trim()) {
    throw new Error(`pages[${index}].title must be a non-empty string.`);
  }
  if (!ALLOWED_KINDS.includes(p.kind as PageKind)) {
    throw new Error(`pages[${index}].kind must be one of ${ALLOWED_KINDS.join('|')}.`);
  }
  if (!isIsoString(p.createdAt) || !isIsoString(p.updatedAt)) {
    throw new Error(`pages[${index}] timestamps must be ISO strings.`);
  }
  return {
    slug: p.slug,
    title: p.title,
    kind: p.kind as PageKind,
    body: typeof p.body === 'string' ? p.body : '',
    facts: asStringArray(p.facts),
    links: asStringArray(p.links),
    sources: asStringArray(p.sources),
    userEdited: !!p.userEdited,
    filedFromQuery: !!p.filedFromQuery,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function validateLog(raw: unknown, index: number): SourceLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) return null;
  if (typeof e.slug !== 'string' || !SLUG_RE.test(e.slug)) return null;
  if (!ALLOWED_LOG_KINDS.includes(e.kind as SourceLogEntry['kind'])) return null;
  if (typeof e.title !== 'string') return null;
  if (!isIsoString(e.timestamp)) return null;
  return {
    id: e.id,
    slug: e.slug,
    kind: e.kind as SourceLogEntry['kind'],
    title: e.title,
    content: typeof e.content === 'string' ? e.content : null,
    url: typeof e.url === 'string' ? e.url : null,
    timestamp: e.timestamp,
    processed: !!e.processed,
    processing: false, // Never carry the in-flight flag across import.
    processedAt: typeof e.processedAt === 'string' ? e.processedAt : undefined,
    pagesCreated: typeof e.pagesCreated === 'number' ? e.pagesCreated : undefined,
    error: typeof e.error === 'string' ? e.error : null,
  };
  void index;
}

export function parseImport(raw: string): ExportState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Import is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Import payload must be an object.');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error('Import payload must have version=1.');
  }
  if (!Array.isArray(obj.pages)) {
    throw new Error('Import payload must include a pages[] array.');
  }
  const pages = obj.pages.map((p, i) => validatePage(p, i));
  const log: SourceLogEntry[] = Array.isArray(obj.log)
    ? obj.log.map((e, i) => validateLog(e, i)).filter((x): x is SourceLogEntry => x !== null)
    : [];
  return {
    version: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : nowIso(),
    pages,
    log,
  };
}

export async function applyImport(remote: ExportState): Promise<{
  pages: number;
  log: number;
}> {
  const db = getDb();
  const local = await buildExport();
  const merged = mergeStates(local, remote);
  for (const p of merged.pages) await upsertPage(db, p);
  for (const e of merged.log) {
    try {
      await insertLog(db, e);
    } catch {
      // Entry already exists (PK conflict); mergeStates already picked newest,
      // and we don't need to overwrite log rows — pages are the source of truth.
    }
  }
  return { pages: merged.pages.length, log: merged.log.length };
}
