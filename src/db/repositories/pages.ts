import { WikiPage } from '../../domain/types';
import { SqlDb, SqlRow } from '../client';

interface PageRow extends SqlRow {
  slug: string;
  title: string;
  kind: 'entity' | 'concept' | 'source';
  body: string;
  facts_json: string;
  links_json: string;
  sources_json: string;
  user_edited: number;
  filed_from_query: number;
  created_at: string;
  updated_at: string;
}

function rowToPage(row: PageRow): WikiPage {
  const safeParse = (s: string, fallback: unknown[] = []): string[] => {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map(String) : (fallback as string[]);
    } catch {
      return fallback as string[];
    }
  };
  return {
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    body: row.body,
    facts: safeParse(row.facts_json),
    links: safeParse(row.links_json),
    sources: safeParse(row.sources_json),
    userEdited: !!row.user_edited,
    filedFromQuery: !!row.filed_from_query,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertPage(db: SqlDb, page: WikiPage): Promise<void> {
  await db.runAsync(
    `INSERT INTO pages
       (slug, title, kind, body, facts_json, links_json, sources_json,
        user_edited, filed_from_query, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       kind = excluded.kind,
       body = excluded.body,
       facts_json = excluded.facts_json,
       links_json = excluded.links_json,
       sources_json = excluded.sources_json,
       user_edited = excluded.user_edited,
       filed_from_query = excluded.filed_from_query,
       updated_at = excluded.updated_at;`,
    [
      page.slug,
      page.title,
      page.kind,
      page.body,
      JSON.stringify(page.facts),
      JSON.stringify(page.links),
      JSON.stringify(page.sources),
      page.userEdited ? 1 : 0,
      page.filedFromQuery ? 1 : 0,
      page.createdAt,
      page.updatedAt,
    ],
  );
}

export async function getPage(db: SqlDb, slug: string): Promise<WikiPage | null> {
  const row = await db.getFirstAsync<PageRow>(
    `SELECT * FROM pages WHERE slug = ?;`,
    [slug],
  );
  return row ? rowToPage(row) : null;
}

export async function listPages(db: SqlDb): Promise<WikiPage[]> {
  const rows = await db.getAllAsync<PageRow>(
    `SELECT * FROM pages ORDER BY updated_at DESC;`,
  );
  return rows.map(rowToPage);
}

export async function searchPages(db: SqlDb, q: string): Promise<WikiPage[]> {
  const like = `%${q.toLowerCase()}%`;
  const rows = await db.getAllAsync<PageRow>(
    `SELECT * FROM pages
     WHERE LOWER(title) LIKE ? OR LOWER(body) LIKE ? OR LOWER(facts_json) LIKE ?
     ORDER BY updated_at DESC;`,
    [like, like, like],
  );
  return rows.map(rowToPage);
}

export async function deletePage(db: SqlDb, slug: string): Promise<void> {
  await db.runAsync(`DELETE FROM pages WHERE slug = ?;`, [slug]);
}

export async function countPages(db: SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM pages;`,
  );
  return row?.c ?? 0;
}
