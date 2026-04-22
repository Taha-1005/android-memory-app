import { WikiPage } from './types';
import { slugify } from './slugify';

export function computeBacklinks(
  target: WikiPage,
  allPages: WikiPage[],
): WikiPage[] {
  const targetSlug = target.slug;
  const targetTitleLower = target.title.toLowerCase();
  return allPages.filter((other) => {
    if (other.slug === targetSlug) return false;
    if (other.links.some((l) => slugify(l) === targetSlug)) return true;
    if (other.body.toLowerCase().includes(`[[${targetTitleLower}]]`)) return true;
    return false;
  });
}
