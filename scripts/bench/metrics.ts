/**
 * Pure scoring helpers for the LLM benchmark. Kept isolated from the
 * provider clients so the same metrics can be applied to any captured
 * result without re-running the API calls.
 */

import { IncomingPage, QueryResult } from '../../src/domain/types';

export interface IngestExpected {
  minPages: number;
  maxPages: number;
  requiredKinds: string[];
  preferredKinds: string[];
  keywords: string[];
  linkKeywords: string[];
  maxBodyWords: number;
}

export interface QueryExpected {
  keywords: string[];
  mustCite: string[];
  mayCite?: string[];
  minConfidence?: 'low' | 'medium' | 'high';
  maxConfidence?: 'low' | 'medium' | 'high';
  maxAnswerWords?: number;
  mustNotHallucinate?: string[];
}

const CONF_RANK: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function lower(s: string): string {
  return s.toLowerCase();
}

function fractionMatched(needles: string[], haystack: string): number {
  if (needles.length === 0) return 1;
  const hay = lower(haystack);
  const hits = needles.filter((n) => hay.includes(lower(n))).length;
  return hits / needles.length;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const w = rank - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

export function summariseLatency(latencies: number[]): {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
} {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    meanMs: sorted.length ? sum / sorted.length : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

export interface IngestMetrics {
  pagesReturned: number;
  pagesInRange: boolean;
  hasRequiredKinds: boolean;
  preferredKindsPresent: boolean;
  keywordCoverage: number; // 0..1, fraction of expected keywords present anywhere in any body or fact
  linkKeywordCoverage: number; // 0..1, fraction of link-keywords matched in [[wikilinks]]
  bodyAvgWords: number;
  bodiesOverWordLimit: number;
  facts: number;
  linksDeclared: number;
}

export function scoreIngest(
  pages: IncomingPage[],
  expected: IngestExpected,
): IngestMetrics {
  const allText = pages
    .map((p) => `${p.title}\n${p.body}\n${p.facts.join('\n')}`)
    .join('\n');
  const allLinks = pages.flatMap((p) => p.links).join('\n');
  const kinds = new Set(pages.map((p) => p.kind));
  const hasRequired = expected.requiredKinds.every((k) => kinds.has(k as IncomingPage['kind']));
  const preferred = expected.preferredKinds.length === 0
    ? true
    : expected.preferredKinds.some((k) => kinds.has(k as IncomingPage['kind']));
  const wordCounts = pages.map((p) => wordCount(p.body));
  const avg = wordCounts.length ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length : 0;
  const over = wordCounts.filter((w) => w > expected.maxBodyWords).length;
  return {
    pagesReturned: pages.length,
    pagesInRange: pages.length >= expected.minPages && pages.length <= expected.maxPages,
    hasRequiredKinds: hasRequired,
    preferredKindsPresent: preferred,
    keywordCoverage: fractionMatched(expected.keywords, allText),
    linkKeywordCoverage: fractionMatched(expected.linkKeywords, allLinks),
    bodyAvgWords: Math.round(avg),
    bodiesOverWordLimit: over,
    facts: pages.reduce((a, p) => a + p.facts.length, 0),
    linksDeclared: pages.reduce((a, p) => a + p.links.length, 0),
  };
}

export interface QueryMetrics {
  answerWords: number;
  answerOverLimit: boolean;
  keywordCoverage: number;
  citationPrecision: number; // of cited pages, fraction in mustCite ∪ mayCite
  citationRecall: number; // of mustCite, fraction actually cited
  confidenceInRange: boolean;
  hallucinationsHit: number;
}

export function scoreQuery(result: QueryResult, expected: QueryExpected): QueryMetrics {
  const words = wordCount(result.answer);
  const allowedSet = new Set(
    [...(expected.mustCite ?? []), ...(expected.mayCite ?? [])].map(lower),
  );
  const cited = (result.cited ?? []).map((c) => lower(c).trim());
  const citedInAllowed = cited.filter((c) => allowedSet.has(c)).length;
  const must = (expected.mustCite ?? []).map(lower);
  const mustHit = must.filter((c) => cited.includes(c)).length;
  const halluHits = (expected.mustNotHallucinate ?? []).filter((bad) =>
    lower(result.answer).includes(lower(bad)),
  ).length;
  let confidenceInRange = true;
  if (expected.minConfidence) {
    confidenceInRange =
      confidenceInRange && CONF_RANK[result.confidence] >= CONF_RANK[expected.minConfidence];
  }
  if (expected.maxConfidence) {
    confidenceInRange =
      confidenceInRange && CONF_RANK[result.confidence] <= CONF_RANK[expected.maxConfidence];
  }
  return {
    answerWords: words,
    answerOverLimit: expected.maxAnswerWords ? words > expected.maxAnswerWords : false,
    keywordCoverage: fractionMatched(expected.keywords, result.answer),
    citationPrecision: cited.length === 0 ? (must.length === 0 ? 1 : 0) : citedInAllowed / cited.length,
    citationRecall: must.length === 0 ? 1 : mustHit / must.length,
    confidenceInRange,
    hallucinationsHit: halluHits,
  };
}

/**
 * Aggregate per-case ingest metrics into a single object suitable for
 * row-by-row comparison.
 */
export function aggregateIngest(items: IngestMetrics[]): Record<string, number> {
  if (items.length === 0) return {};
  const n = items.length;
  const sum = (f: (m: IngestMetrics) => number): number =>
    items.reduce((a, m) => a + f(m), 0);
  const all = (f: (m: IngestMetrics) => boolean): number =>
    items.filter(f).length / n;
  return {
    cases: n,
    pagesInRangeRate: all((m) => m.pagesInRange),
    requiredKindsRate: all((m) => m.hasRequiredKinds),
    preferredKindsRate: all((m) => m.preferredKindsPresent),
    avgKeywordCoverage: sum((m) => m.keywordCoverage) / n,
    avgLinkKeywordCoverage: sum((m) => m.linkKeywordCoverage) / n,
    avgPagesReturned: sum((m) => m.pagesReturned) / n,
    avgBodyWords: sum((m) => m.bodyAvgWords) / n,
    bodiesOverLimit: sum((m) => m.bodiesOverWordLimit),
    avgFacts: sum((m) => m.facts) / n,
    avgLinksDeclared: sum((m) => m.linksDeclared) / n,
  };
}

export function aggregateQuery(items: QueryMetrics[]): Record<string, number> {
  if (items.length === 0) return {};
  const n = items.length;
  const sum = (f: (m: QueryMetrics) => number): number =>
    items.reduce((a, m) => a + f(m), 0);
  const all = (f: (m: QueryMetrics) => boolean): number =>
    items.filter(f).length / n;
  return {
    cases: n,
    avgKeywordCoverage: sum((m) => m.keywordCoverage) / n,
    avgCitationPrecision: sum((m) => m.citationPrecision) / n,
    avgCitationRecall: sum((m) => m.citationRecall) / n,
    confidenceInRangeRate: all((m) => m.confidenceInRange),
    avgAnswerWords: sum((m) => m.answerWords) / n,
    answersOverLimit: sum((m) => (m.answerOverLimit ? 1 : 0)),
    hallucinationHits: sum((m) => m.hallucinationsHit),
  };
}
