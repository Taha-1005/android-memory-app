import { IncomingPage, WikiPage } from './types';
import { slugify } from './slugify';
import { nowIso } from '../utils/time';

export function mergePage(
  existing: WikiPage | null,
  incoming: IncomingPage,
  sourceSlug: string | null,
): WikiPage {
  const now = nowIso();
  if (!existing) {
    return {
      slug: slugify(incoming.title),
      title: incoming.title,
      kind: incoming.kind,
      body: incoming.body,
      facts: [...incoming.facts],
      links: [...incoming.links],
      sources: sourceSlug ? [sourceSlug] : [],
      userEdited: false,
      createdAt: now,
      updatedAt: now,
    };
  }
  return {
    ...existing,
    kind: existing.kind === 'source' ? 'source' : incoming.kind,
    body: existing.userEdited ? existing.body : incoming.body || existing.body,
    facts: Array.from(new Set([...existing.facts, ...incoming.facts])),
    links: Array.from(new Set([...existing.links, ...incoming.links])),
    sources: Array.from(
      new Set([...existing.sources, sourceSlug].filter(Boolean) as string[]),
    ),
    updatedAt: now,
  };
}
