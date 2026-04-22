import { SourceLogEntry } from '../../domain/types';
import { SqlDb, SqlRow } from '../client';

interface LogRow extends SqlRow {
  id: string;
  slug: string;
  kind: 'text' | 'url';
  title: string;
  content: string | null;
  url: string | null;
  timestamp: string;
  processed: number;
  processing: number;
  processed_at: string | null;
  pages_created: number | null;
  error: string | null;
}

function rowToEntry(row: LogRow): SourceLogEntry {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    content: row.content,
    url: row.url,
    timestamp: row.timestamp,
    processed: !!row.processed,
    processing: !!row.processing,
    processedAt: row.processed_at ?? undefined,
    pagesCreated: row.pages_created ?? undefined,
    error: row.error,
  };
}

export async function insertLog(db: SqlDb, e: SourceLogEntry): Promise<void> {
  await db.runAsync(
    `INSERT INTO source_log
       (id, slug, kind, title, content, url, timestamp,
        processed, processing, processed_at, pages_created, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      e.id,
      e.slug,
      e.kind,
      e.title,
      e.content,
      e.url,
      e.timestamp,
      e.processed ? 1 : 0,
      e.processing ? 1 : 0,
      e.processedAt ?? null,
      e.pagesCreated ?? null,
      e.error ?? null,
    ],
  );
}

export async function updateLog(
  db: SqlDb,
  id: string,
  patch: Partial<SourceLogEntry>,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    fields.push(`${col} = ?`);
    values.push(val);
  };
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.content !== undefined) push('content', patch.content);
  if (patch.url !== undefined) push('url', patch.url);
  if (patch.processed !== undefined) push('processed', patch.processed ? 1 : 0);
  if (patch.processing !== undefined) push('processing', patch.processing ? 1 : 0);
  if (patch.processedAt !== undefined) push('processed_at', patch.processedAt);
  if (patch.pagesCreated !== undefined) push('pages_created', patch.pagesCreated);
  if (patch.error !== undefined) push('error', patch.error);
  if (fields.length === 0) return;
  values.push(id);
  await db.runAsync(
    `UPDATE source_log SET ${fields.join(', ')} WHERE id = ?;`,
    values,
  );
}

export async function listLog(db: SqlDb): Promise<SourceLogEntry[]> {
  const rows = await db.getAllAsync<LogRow>(
    `SELECT * FROM source_log ORDER BY timestamp DESC;`,
  );
  return rows.map(rowToEntry);
}

export async function getLog(db: SqlDb, id: string): Promise<SourceLogEntry | null> {
  const row = await db.getFirstAsync<LogRow>(
    `SELECT * FROM source_log WHERE id = ?;`,
    [id],
  );
  return row ? rowToEntry(row) : null;
}

export async function deleteLog(db: SqlDb, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM source_log WHERE id = ?;`, [id]);
}

export async function deleteLogBySlug(db: SqlDb, slug: string): Promise<void> {
  await db.runAsync(`DELETE FROM source_log WHERE slug = ?;`, [slug]);
}

export async function resetOrphanedProcessing(db: SqlDb): Promise<number> {
  const res = await db.runAsync(
    `UPDATE source_log
        SET processing = 0,
            error = COALESCE(error, 'Process was interrupted')
      WHERE processing = 1;`,
  );
  return res.changes;
}
