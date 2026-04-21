import { WikiPage } from './types';

export function rankPagesForQuery(
  query: string,
  pages: WikiPage[],
  k = 8,
): WikiPage[] {
  const q = query.toLowerCase();
  const terms = Array.from(new Set(q.split(/\s+/).filter((t) => t.length > 2)));
  if (terms.length === 0) return [];
  const scored = pages.map((p) => {
    const hay = `${p.title} ${p.body} ${p.facts.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const matches = hay.split(t).length - 1;
      score += matches * (p.title.toLowerCase().includes(t) ? 3 : 1);
    }
    return { p, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score > 0)
    .slice(0, k)
    .map((s) => s.p);
}
