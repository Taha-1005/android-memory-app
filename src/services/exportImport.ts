import { ExportState } from '../domain/types';
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

export function parseImport(raw: string): ExportState {
  const parsed = JSON.parse(raw) as Partial<ExportState>;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.pages)) {
    throw new Error('Invalid export payload: missing version=1 or pages[].');
  }
  return {
    version: 1,
    exportedAt: parsed.exportedAt ?? nowIso(),
    pages: parsed.pages,
    log: Array.isArray(parsed.log) ? parsed.log : [],
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
