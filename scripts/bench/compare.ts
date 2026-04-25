/**
 * Reads two bench result JSONs and prints a side-by-side comparison.
 *
 * Usage:
 *   npx tsx scripts/bench/compare.ts <fileA.json> <fileB.json>
 *
 * Pass --markdown to emit a Markdown table instead of plain text.
 *
 * The script makes no assumptions about which provider is "winning";
 * it just shows the numbers and arrow-marks the metric that prefers
 * higher / lower values.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

type LatencySummary = {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

type Result = {
  provider: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  totals: {
    calls: number;
    successes: number;
    errors: number;
    successRate: number;
    schemaValidRate: number;
    latency: LatencySummary;
  };
  byTask: {
    ingest: Record<string, unknown>;
    query: Record<string, unknown>;
  };
};

type Direction = 'higher' | 'lower' | 'neutral';

interface Row {
  label: string;
  a: number | null;
  b: number | null;
  fmt: 'pct' | 'ms' | 'int' | 'float';
  better: Direction;
}

function readJson<T>(file: string): Promise<T> {
  return fs.readFile(file, 'utf8').then((s) => JSON.parse(s) as T);
}

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function ms(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Math.round(v)}ms`;
}

function num(v: number | null | undefined, digits = 2): string {
  if (v == null) return '—';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(digits);
}

function format(row: Row, side: 'a' | 'b'): string {
  const v = side === 'a' ? row.a : row.b;
  switch (row.fmt) {
    case 'pct':
      return pct(v ?? null);
    case 'ms':
      return ms(v ?? null);
    case 'int':
      return num(v ?? null, 0);
    case 'float':
      return num(v ?? null, 2);
  }
}

function deltaArrow(row: Row): string {
  if (row.a == null || row.b == null || row.better === 'neutral') return '';
  const eps = row.fmt === 'pct' ? 0.005 : row.fmt === 'ms' ? 5 : 0.01;
  const diff = row.b - row.a;
  if (Math.abs(diff) < eps) return '=';
  if (row.better === 'higher') return diff > 0 ? 'B↑' : 'A↑';
  // lower-is-better
  return diff < 0 ? 'B↑' : 'A↑';
}

function deltaText(row: Row): string {
  if (row.a == null || row.b == null) return '';
  const diff = row.b - row.a;
  switch (row.fmt) {
    case 'pct':
      return `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}pp`;
    case 'ms':
      return `${diff >= 0 ? '+' : ''}${Math.round(diff)}ms`;
    default:
      return `${diff >= 0 ? '+' : ''}${num(diff, 2)}`;
  }
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function leftPad(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

function num0(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function buildRows(a: Result, b: Result): { section: string; rows: Row[] }[] {
  const aIngest = a.byTask.ingest;
  const bIngest = b.byTask.ingest;
  const aQuery = a.byTask.query;
  const bQuery = b.byTask.query;

  const aIngestLatency = aIngest.latency as LatencySummary;
  const bIngestLatency = bIngest.latency as LatencySummary;
  const aQueryLatency = aQuery.latency as LatencySummary;
  const bQueryLatency = bQuery.latency as LatencySummary;

  return [
    {
      section: 'Overall',
      rows: [
        { label: 'Total calls', a: a.totals.calls, b: b.totals.calls, fmt: 'int', better: 'neutral' },
        { label: 'Success rate', a: a.totals.successRate, b: b.totals.successRate, fmt: 'pct', better: 'higher' },
        { label: 'JSON parse rate', a: a.totals.schemaValidRate, b: b.totals.schemaValidRate, fmt: 'pct', better: 'higher' },
        { label: 'Mean latency', a: a.totals.latency.meanMs, b: b.totals.latency.meanMs, fmt: 'ms', better: 'lower' },
        { label: 'p50 latency', a: a.totals.latency.p50Ms, b: b.totals.latency.p50Ms, fmt: 'ms', better: 'lower' },
        { label: 'p95 latency', a: a.totals.latency.p95Ms, b: b.totals.latency.p95Ms, fmt: 'ms', better: 'lower' },
        { label: 'Wall-clock duration (s)', a: a.durationSec, b: b.durationSec, fmt: 'float', better: 'lower' },
      ],
    },
    {
      section: 'Ingest (extraction)',
      rows: [
        { label: 'Cases', a: num0(aIngest.cases), b: num0(bIngest.cases), fmt: 'int', better: 'neutral' },
        { label: 'p50 latency', a: aIngestLatency?.p50Ms ?? null, b: bIngestLatency?.p50Ms ?? null, fmt: 'ms', better: 'lower' },
        { label: 'p95 latency', a: aIngestLatency?.p95Ms ?? null, b: bIngestLatency?.p95Ms ?? null, fmt: 'ms', better: 'lower' },
        { label: 'Pages-in-range rate', a: num0(aIngest.pagesInRangeRate), b: num0(bIngest.pagesInRangeRate), fmt: 'pct', better: 'higher' },
        { label: 'Required-kinds rate', a: num0(aIngest.requiredKindsRate), b: num0(bIngest.requiredKindsRate), fmt: 'pct', better: 'higher' },
        { label: 'Preferred-kinds rate', a: num0(aIngest.preferredKindsRate), b: num0(bIngest.preferredKindsRate), fmt: 'pct', better: 'higher' },
        { label: 'Avg keyword coverage', a: num0(aIngest.avgKeywordCoverage), b: num0(bIngest.avgKeywordCoverage), fmt: 'pct', better: 'higher' },
        { label: 'Avg link-keyword coverage', a: num0(aIngest.avgLinkKeywordCoverage), b: num0(bIngest.avgLinkKeywordCoverage), fmt: 'pct', better: 'higher' },
        { label: 'Avg pages returned', a: num0(aIngest.avgPagesReturned), b: num0(bIngest.avgPagesReturned), fmt: 'float', better: 'neutral' },
        { label: 'Avg body words', a: num0(aIngest.avgBodyWords), b: num0(bIngest.avgBodyWords), fmt: 'float', better: 'neutral' },
        { label: 'Bodies over word limit', a: num0(aIngest.bodiesOverLimit), b: num0(bIngest.bodiesOverLimit), fmt: 'int', better: 'lower' },
        { label: 'Avg facts per page', a: num0(aIngest.avgFacts), b: num0(bIngest.avgFacts), fmt: 'float', better: 'neutral' },
        { label: 'Avg links declared', a: num0(aIngest.avgLinksDeclared), b: num0(bIngest.avgLinksDeclared), fmt: 'float', better: 'neutral' },
      ],
    },
    {
      section: 'Query (grounded QA)',
      rows: [
        { label: 'Cases', a: num0(aQuery.cases), b: num0(bQuery.cases), fmt: 'int', better: 'neutral' },
        { label: 'p50 latency', a: aQueryLatency?.p50Ms ?? null, b: bQueryLatency?.p50Ms ?? null, fmt: 'ms', better: 'lower' },
        { label: 'p95 latency', a: aQueryLatency?.p95Ms ?? null, b: bQueryLatency?.p95Ms ?? null, fmt: 'ms', better: 'lower' },
        { label: 'Avg keyword coverage', a: num0(aQuery.avgKeywordCoverage), b: num0(bQuery.avgKeywordCoverage), fmt: 'pct', better: 'higher' },
        { label: 'Avg citation precision', a: num0(aQuery.avgCitationPrecision), b: num0(bQuery.avgCitationPrecision), fmt: 'pct', better: 'higher' },
        { label: 'Avg citation recall', a: num0(aQuery.avgCitationRecall), b: num0(bQuery.avgCitationRecall), fmt: 'pct', better: 'higher' },
        { label: 'Confidence-in-range rate', a: num0(aQuery.confidenceInRangeRate), b: num0(bQuery.confidenceInRangeRate), fmt: 'pct', better: 'higher' },
        { label: 'Avg answer words', a: num0(aQuery.avgAnswerWords), b: num0(bQuery.avgAnswerWords), fmt: 'float', better: 'neutral' },
        { label: 'Answers over word limit', a: num0(aQuery.answersOverLimit), b: num0(bQuery.answersOverLimit), fmt: 'int', better: 'lower' },
        { label: 'Hallucination hits', a: num0(aQuery.hallucinationHits), b: num0(bQuery.hallucinationHits), fmt: 'int', better: 'lower' },
      ],
    },
  ];
}

function renderText(a: Result, b: Result): string {
  const sections = buildRows(a, b);
  const labelW = Math.max(
    24,
    ...sections.flatMap((s) => s.rows.map((r) => r.label.length)),
  );
  const aHeader = `${a.provider}/${a.model}`;
  const bHeader = `${b.provider}/${b.model}`;
  const colW = Math.max(18, aHeader.length + 2, bHeader.length + 2);
  const lines: string[] = [];
  lines.push('LLM benchmark comparison');
  lines.push('========================');
  lines.push(`A: ${aHeader}    started=${a.startedAt}`);
  lines.push(`B: ${bHeader}    started=${b.startedAt}`);
  lines.push('');
  for (const s of sections) {
    lines.push(s.section);
    lines.push('-'.repeat(s.section.length));
    lines.push(
      pad('Metric', labelW) + leftPad(aHeader, colW) + leftPad(bHeader, colW) +
        leftPad('Δ (B-A)', colW) + leftPad('Better', 8),
    );
    for (const row of s.rows) {
      lines.push(
        pad(row.label, labelW) +
          leftPad(format(row, 'a'), colW) +
          leftPad(format(row, 'b'), colW) +
          leftPad(deltaText(row), colW) +
          leftPad(deltaArrow(row), 8),
      );
    }
    lines.push('');
  }
  lines.push('Legend: B↑ = file B is better on this metric, A↑ = file A is better, = roughly equal.');
  return lines.join('\n');
}

function renderMarkdown(a: Result, b: Result): string {
  const sections = buildRows(a, b);
  const aHeader = `${a.provider}/${a.model}`;
  const bHeader = `${b.provider}/${b.model}`;
  const lines: string[] = [];
  lines.push('# LLM benchmark comparison');
  lines.push('');
  lines.push(`- **A**: \`${aHeader}\` (started ${a.startedAt})`);
  lines.push(`- **B**: \`${bHeader}\` (started ${b.startedAt})`);
  lines.push('');
  for (const s of sections) {
    lines.push(`## ${s.section}`);
    lines.push('');
    lines.push(`| Metric | ${aHeader} | ${bHeader} | Δ (B-A) | Better |`);
    lines.push('| --- | ---: | ---: | ---: | :---: |');
    for (const row of s.rows) {
      lines.push(
        `| ${row.label} | ${format(row, 'a')} | ${format(row, 'b')} | ${deltaText(row)} | ${deltaArrow(row) || '—'} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const markdown = argv.includes('--markdown');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    // eslint-disable-next-line no-console
    console.error('Usage: npx tsx scripts/bench/compare.ts <fileA.json> <fileB.json> [--markdown]');
    process.exit(1);
  }
  const [pa, pb] = files.map((f) => path.resolve(f));
  const [a, b] = await Promise.all([readJson<Result>(pa), readJson<Result>(pb)]);
  // eslint-disable-next-line no-console
  console.log(markdown ? renderMarkdown(a, b) : renderText(a, b));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
