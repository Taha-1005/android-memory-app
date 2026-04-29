import { WikiPage } from './types';
import { slugify } from './slugify';
import { nowIso } from '../utils/time';

export interface RenameDelta {
  /** New display title. The slug is derived from this. */
  newTitle: string;
  /** Optional new body. If omitted, body is left unchanged. */
  newBody?: string;
  /** Optional new facts list. If omitted, facts are left unchanged. */
  newFacts?: string[];
}

export interface RenameResult {
  renamed: WikiPage;
  /** Other pages whose links/body now reference the new title. Empty if no
   *  cross-page rewrites were needed. */
  rewrittenReferers: WikiPage[];
  /** True when the slug changed (so the caller knows to delete the old row). */
  slugChanged: boolean;
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

/**
 * Rewrite every `[[Old Title]]` occurrence (case-insensitive) inside `body`
 * to `[[newTitle]]`. Returns the unchanged body if no occurrence is found.
 */
export function rewriteBodyWikilinks(body: string, oldTitle: string, newTitle: string): string {
  if (!oldTitle || oldTitle === newTitle) return body;
  const re = new RegExp(`\\[\\[${escapeRegex(oldTitle)}\\]\\]`, 'gi');
  return body.replace(re, `[[${newTitle}]]`);
}

/**
 * Pure rename: given an existing page, the desired changes, and the rest of
 * the wiki, produce the renamed page plus any other pages whose links/body
 * need to change. Does NOT touch the database — callers are responsible for
 * applying the result via upsert + (if slugChanged) delete.
 */
export function planRename(
  existing: WikiPage,
  delta: RenameDelta,
  others: WikiPage[],
  collidingNewSlug: WikiPage | null,
): RenameResult {
  const newTitle = delta.newTitle.trim();
  if (!newTitle) throw new Error('Rename requires a non-empty title.');
  const newSlug = slugify(newTitle);
  const slugChanged = newSlug !== existing.slug;
  if (slugChanged && collidingNewSlug) {
    throw new Error(
      `Cannot rename "${existing.title}" to "${newTitle}": slug ${newSlug} already exists.`,
    );
  }
  const now = nowIso();
  const renamed: WikiPage = {
    ...existing,
    slug: newSlug,
    title: newTitle,
    body: delta.newBody ?? existing.body,
    facts: delta.newFacts ?? existing.facts,
    userEdited: true,
    updatedAt: now,
  };

  const rewrittenReferers: WikiPage[] = [];
  if (slugChanged) {
    for (const other of others) {
      if (other.slug === existing.slug) continue;
      const linksTouched = other.links.some((l) => slugify(l) === existing.slug);
      const bodyTouched = new RegExp(
        `\\[\\[${escapeRegex(existing.title)}\\]\\]`,
        'i',
      ).test(other.body);
      if (!linksTouched && !bodyTouched) continue;
      const newLinks = other.links.map((l) =>
        slugify(l) === existing.slug ? newTitle : l,
      );
      const newBody = bodyTouched
        ? rewriteBodyWikilinks(other.body, existing.title, newTitle)
        : other.body;
      rewrittenReferers.push({
        ...other,
        links: newLinks,
        body: newBody,
        updatedAt: now,
      });
    }
  }
  return { renamed, rewrittenReferers, slugChanged };
}
