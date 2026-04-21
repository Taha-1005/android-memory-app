import { LintResults, WikiPage } from './types';
import { computeBacklinks } from './backlinks';
import { daysSince } from '../utils/time';

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'a', 'an'].includes(w))
    .sort()
    .join(' ');
}

export function computeLint(pages: WikiPage[], staleDays = 60): LintResults {
  const orphans: WikiPage[] = [];
  const thin: WikiPage[] = [];
  const stale: WikiPage[] = [];
  for (const p of pages) {
    if (p.kind === 'source') continue;
    const back = computeBacklinks(p, pages);
    if (back.length === 0) orphans.push(p);
    if (p.body.trim().length < 80 && p.facts.length === 0) thin.push(p);
    if (daysSince(p.updatedAt) > staleDays) stale.push(p);
  }
  const groups = new Map<string, WikiPage[]>();
  for (const p of pages) {
    const key = normalizeTitle(p.title);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  const duplicateGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  return { orphans, thin, stale, duplicateGroups };
}
