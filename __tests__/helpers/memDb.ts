/**
 * Tiny in-memory SQL shim that implements just enough of the SqlDb surface
 * our repositories use — INSERT / UPDATE / DELETE / SELECT with WHERE,
 * ORDER BY, and basic LIKE / LOWER() predicates. Good enough for repo tests.
 *
 * It relies on `better-sqlite3`-style escaping behaviour? No — we only need
 * to cover the queries our repositories actually emit, so we hand-parse a
 * small subset. Any query we don't recognise throws.
 */
import { SqlDb } from '../../src/db/client';

interface Row {
  [k: string]: unknown;
}

export function createMemDb(): SqlDb {
  const tables: Record<string, Row[]> = {
    pages: [],
    source_log: [],
    meta: [],
  };

  function runAsync(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const s = sql.trim();

    if (/^INSERT INTO pages/i.test(s)) {
      const [slug, title, kind, body, facts_json, links_json, sources_json,
        user_edited, filed_from_query, created_at, updated_at] = params as any[];
      const idx = tables.pages.findIndex((r) => r.slug === slug);
      const row = {
        slug, title, kind, body, facts_json, links_json, sources_json,
        user_edited, filed_from_query, created_at, updated_at,
      };
      if (idx >= 0) tables.pages[idx] = { ...tables.pages[idx], ...row };
      else tables.pages.push(row);
      return Promise.resolve({ changes: 1 });
    }

    if (/^DELETE FROM pages WHERE slug = \?/i.test(s)) {
      const slug = params[0];
      const before = tables.pages.length;
      tables.pages = tables.pages.filter((r) => r.slug !== slug);
      return Promise.resolve({ changes: before - tables.pages.length });
    }

    if (/^INSERT INTO source_log/i.test(s)) {
      const [id, slug, kind, title, content, url, timestamp,
        processed, processing, processed_at, pages_created, error] = params as any[];
      if (tables.source_log.some((r) => r.id === id)) {
        throw new Error(`UNIQUE constraint failed: source_log.id=${id}`);
      }
      tables.source_log.push({
        id, slug, kind, title, content, url, timestamp,
        processed, processing, processed_at, pages_created, error,
      });
      return Promise.resolve({ changes: 1 });
    }

    const updLog = s.match(/^UPDATE source_log SET (.+) WHERE id = \?/i);
    if (updLog) {
      const assignments = updLog[1].split(',').map((x) => x.trim().split(' = ')[0]);
      const values = params.slice(0, -1);
      const id = params[params.length - 1];
      const row = tables.source_log.find((r) => r.id === id);
      if (!row) return Promise.resolve({ changes: 0 });
      assignments.forEach((col, i) => {
        row[col] = values[i];
      });
      return Promise.resolve({ changes: 1 });
    }

    if (/^UPDATE source_log\s+SET processing = 0/i.test(s)) {
      let changes = 0;
      for (const r of tables.source_log) {
        if (r.processing === 1) {
          r.processing = 0;
          r.error = r.error ?? 'Process was interrupted';
          changes++;
        }
      }
      return Promise.resolve({ changes });
    }

    if (/^DELETE FROM source_log WHERE id = \?/i.test(s)) {
      const before = tables.source_log.length;
      tables.source_log = tables.source_log.filter((r) => r.id !== params[0]);
      return Promise.resolve({ changes: before - tables.source_log.length });
    }
    if (/^DELETE FROM source_log WHERE slug = \?/i.test(s)) {
      const before = tables.source_log.length;
      tables.source_log = tables.source_log.filter((r) => r.slug !== params[0]);
      return Promise.resolve({ changes: before - tables.source_log.length });
    }

    if (/^INSERT OR IGNORE INTO meta/i.test(s)) {
      const [key, value] = params as [string, string];
      if (!tables.meta.some((r) => r.key === key)) {
        tables.meta.push({ key, value });
      }
      return Promise.resolve({ changes: 1 });
    }

    throw new Error(`memDb: unsupported runAsync query: ${s}`);
  }

  function getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const s = sql.trim();

    if (/^SELECT \* FROM pages ORDER BY updated_at DESC/i.test(s)) {
      return Promise.resolve(
        [...tables.pages]
          .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))) as T[],
      );
    }

    if (/^SELECT \* FROM pages\s+WHERE LOWER\(title\) LIKE \? OR LOWER\(body\) LIKE \? OR LOWER\(facts_json\) LIKE \?/i.test(s)) {
      const pat = String(params[0]).replace(/%/g, '').toLowerCase();
      return Promise.resolve(
        tables.pages
          .filter((r) =>
            String(r.title).toLowerCase().includes(pat) ||
            String(r.body).toLowerCase().includes(pat) ||
            String(r.facts_json).toLowerCase().includes(pat),
          )
          .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))) as T[],
      );
    }

    if (/^SELECT \* FROM source_log ORDER BY timestamp DESC/i.test(s)) {
      return Promise.resolve(
        [...tables.source_log].sort((a, b) =>
          String(b.timestamp).localeCompare(String(a.timestamp)),
        ) as T[],
      );
    }

    throw new Error(`memDb: unsupported getAllAsync query: ${s}`);
  }

  async function getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const s = sql.trim();
    if (/^SELECT \* FROM pages WHERE slug = \?/i.test(s)) {
      return (tables.pages.find((r) => r.slug === params[0]) as T) ?? null;
    }
    if (/^SELECT id, slug, kind, title, content, url FROM source_log WHERE id = \?/i.test(s)) {
      const row = tables.source_log.find((r) => r.id === params[0]);
      if (!row) return null;
      const { id, slug, kind, title, content, url } = row as any;
      return ({ id, slug, kind, title, content, url } as unknown) as T;
    }
    if (/^SELECT \* FROM source_log WHERE id = \?/i.test(s)) {
      return (tables.source_log.find((r) => r.id === params[0]) as T) ?? null;
    }
    if (/^SELECT COUNT\(\*\) AS c FROM pages/i.test(s)) {
      return ({ c: tables.pages.length } as unknown) as T;
    }
    if (/^SELECT value FROM meta WHERE key = \?/i.test(s)) {
      const row = tables.meta.find((r) => r.key === params[0]);
      return row ? ({ value: row.value } as unknown as T) : null;
    }
    throw new Error(`memDb: unsupported getFirstAsync query: ${s}`);
  }

  async function execAsync(): Promise<void> {
    // Schema DDL — no-op for the in-memory store.
  }

  return { execAsync, runAsync, getAllAsync, getFirstAsync };
}
