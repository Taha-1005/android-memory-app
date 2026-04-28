/**
 * Ad-hoc benchmark runner. Runs the same set of fixtures against ONE
 * provider (Anthropic OR Gemini, never both at once) and writes a
 * results JSON to bench/results/.
 *
 * Why one provider per run: Gemini's free tier has tight per-minute
 * quotas. Running both in the same process makes results racy and forces
 * us to sleep mid-run. Splitting also keeps each result file self-
 * contained and easy to diff.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/bench/run.ts --provider anthropic
 *   GEMINI_API_KEY=...    npx tsx scripts/bench/run.ts --provider gemini
 *
 * Optional flags:
 *   --model <name>            override the default model
 *   --tasks ingest,query      restrict which task suites run (default: all)
 *   --concurrency 1           keep at 1 to respect rate limits (default 1)
 *   --pause-ms 100            sleep between calls (default 100, raise for free-tier)
 *   --out path.json           override output path
 *   --tag mylabel             optional tag baked into the filename
 *
 * Exit non-zero on any uncaught error; partial results are still written.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { runIngest } from '../../src/llm/ingest';
import { runQuery } from '../../src/llm/query';
import {
  Provider,
  defaultModelFor,
  isProvider,
} from '../../src/llm/provider';
import { IncomingPage, QueryResult, WikiPage } from '../../src/domain/types';
import {
  aggregateIngest,
  aggregateQuery,
  IngestExpected,
  IngestMetrics,
  QueryExpected,
  QueryMetrics,
  scoreIngest,
  scoreQuery,
  summariseLatency,
} from './metrics';

type Args = {
  provider: Provider;
  model?: string;
  tasks: ('ingest' | 'query')[];
  concurrency: number;
  pauseMs: number;
  out?: string;
  tag?: string;
};

type IngestFixture = {
  id: string;
  input: { title: string; kind: 'text' | 'url'; content: string | null; url: string | null };
  expected: IngestExpected;
};

type QueryFixture = {
  id: string;
  query: string;
  pages: WikiPage[];
  expected: QueryExpected;
};

type IngestCase = {
  id: string;
  task: 'ingest';
  ok: boolean;
  latencyMs: number;
  schemaValid: boolean;
  error?: string;
  pagesReturned?: number;
  metrics?: IngestMetrics;
  tokens?: { prompt?: number; output?: number; total?: number };
};

type QueryCase = {
  id: string;
  task: 'query';
  ok: boolean;
  latencyMs: number;
  schemaValid: boolean;
  error?: string;
  answerWords?: number;
  metrics?: QueryMetrics;
  tokens?: { prompt?: number; output?: number; total?: number };
};

type CaseRecord = IngestCase | QueryCase;

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(ROOT, 'bench', 'fixtures');
const RESULTS_DIR = path.join(ROOT, 'bench', 'results');

function parseArgs(argv: string[]): Args {
  const out: Args = {
    provider: 'anthropic',
    tasks: ['ingest', 'query'],
    concurrency: 1,
    pauseMs: 100,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (!v) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--provider': {
        const p = next();
        if (!isProvider(p)) throw new Error(`Unknown provider: ${p}`);
        out.provider = p;
        break;
      }
      case '--model':
        out.model = next();
        break;
      case '--tasks': {
        const ts = next().split(',').map((s) => s.trim()) as Args['tasks'];
        for (const t of ts) {
          if (t !== 'ingest' && t !== 'query') throw new Error(`Unknown task: ${t}`);
        }
        out.tasks = ts;
        break;
      }
      case '--concurrency':
        out.concurrency = Math.max(1, parseInt(next(), 10));
        break;
      case '--pause-ms':
        out.pauseMs = Math.max(0, parseInt(next(), 10));
        break;
      case '--out':
        out.out = next();
        break;
      case '--tag':
        out.tag = next();
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      // eslint-disable-next-line no-fallthrough
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: npx tsx scripts/bench/run.ts --provider <anthropic|gemini> [options]

Required env:
  ANTHROPIC_API_KEY    when --provider anthropic
  GEMINI_API_KEY       when --provider gemini

Options:
  --model <name>           override the default model
  --tasks ingest,query     restrict which task suites run (default: all)
  --concurrency <n>        parallel calls (default 1)
  --pause-ms <n>           sleep between calls (default 100)
  --out <path>             override output JSON path
  --tag <label>            extra label baked into the filename
`);
}

function getApiKey(provider: Provider): string {
  const key = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const envName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    throw new Error(`Missing ${envName} for provider=${provider}`);
  }
  return key;
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

async function loadFixtures(): Promise<{ ingest: IngestFixture[]; query: QueryFixture[] }> {
  return {
    ingest: await readJson<IngestFixture[]>(path.join(FIXTURES_DIR, 'ingest.json')),
    query: await readJson<QueryFixture[]>(path.join(FIXTURES_DIR, 'query.json')),
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function runIngestCase(
  fx: IngestFixture,
  args: Args,
  apiKey: string,
): Promise<IngestCase> {
  const start = Date.now();
  try {
    const pages: IncomingPage[] = await runIngest(fx.input, {
      provider: args.provider,
      apiKey,
      model: args.model ?? defaultModelFor(args.provider),
      maxTokens: 1500,
      timeoutMs: 60_000,
      skipConnectivityCheck: true,
    });
    const latency = Date.now() - start;
    const metrics = scoreIngest(pages, fx.expected);
    return {
      id: fx.id,
      task: 'ingest',
      ok: true,
      latencyMs: latency,
      schemaValid: true,
      pagesReturned: pages.length,
      metrics,
    };
  } catch (e) {
    const latency = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: fx.id,
      task: 'ingest',
      ok: false,
      latencyMs: latency,
      schemaValid: !/JSON|parse|Empty response/i.test(msg),
      error: msg,
    };
  }
}

async function runQueryCase(
  fx: QueryFixture,
  args: Args,
  apiKey: string,
): Promise<QueryCase> {
  const start = Date.now();
  try {
    const result: QueryResult = await runQuery(fx.query, fx.pages, {
      provider: args.provider,
      apiKey,
      model: args.model ?? defaultModelFor(args.provider),
      maxTokens: 800,
      timeoutMs: 60_000,
      skipConnectivityCheck: true,
    });
    const latency = Date.now() - start;
    const metrics = scoreQuery(result, fx.expected);
    return {
      id: fx.id,
      task: 'query',
      ok: true,
      latencyMs: latency,
      schemaValid: true,
      answerWords: metrics.answerWords,
      metrics,
    };
  } catch (e) {
    const latency = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: fx.id,
      task: 'query',
      ok: false,
      latencyMs: latency,
      schemaValid: !/JSON|parse|Empty response/i.test(msg),
      error: msg,
    };
  }
}

async function runWithLimit<T, R>(
  items: T[],
  concurrency: number,
  pauseMs: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await task(items[i], i);
      if (pauseMs > 0 && i < items.length - 1) await sleep(pauseMs);
    }
  });
  await Promise.all(workers);
  return results;
}

function isoStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getApiKey(args.provider);
  const model = args.model ?? defaultModelFor(args.provider);

  const fixtures = await loadFixtures();
  const startedAt = new Date();

  // eslint-disable-next-line no-console
  console.log(
    `[bench] provider=${args.provider} model=${model} tasks=${args.tasks.join(',')} ` +
      `concurrency=${args.concurrency} pause-ms=${args.pauseMs}`,
  );

  const cases: CaseRecord[] = [];

  if (args.tasks.includes('ingest')) {
    // eslint-disable-next-line no-console
    console.log(`[bench] running ${fixtures.ingest.length} ingest cases…`);
    const recs = await runWithLimit(fixtures.ingest, args.concurrency, args.pauseMs, (fx) =>
      runIngestCase(fx, args, apiKey).then((r) => {
        // eslint-disable-next-line no-console
        console.log(
          `  ingest ${fx.id.padEnd(28)} ${r.ok ? 'ok' : 'ERR'} ${r.latencyMs}ms` +
            (r.ok ? `  pages=${r.pagesReturned}` : `  ${r.error}`),
        );
        return r;
      }),
    );
    cases.push(...recs);
  }

  if (args.tasks.includes('query')) {
    // eslint-disable-next-line no-console
    console.log(`[bench] running ${fixtures.query.length} query cases…`);
    const recs = await runWithLimit(fixtures.query, args.concurrency, args.pauseMs, (fx) =>
      runQueryCase(fx, args, apiKey).then((r) => {
        // eslint-disable-next-line no-console
        console.log(
          `  query  ${fx.id.padEnd(28)} ${r.ok ? 'ok' : 'ERR'} ${r.latencyMs}ms` +
            (r.ok ? `  words=${r.answerWords}` : `  ${r.error}`),
        );
        return r;
      }),
    );
    cases.push(...recs);
  }

  const finishedAt = new Date();
  const ingestRecs = cases.filter((c) => c.task === 'ingest');
  const queryRecs = cases.filter((c) => c.task === 'query');
  const ingestMetrics = ingestRecs
    .filter((c) => c.task === 'ingest' && c.ok && c.metrics)
    .map((c) => (c as Extract<CaseRecord, { task: 'ingest' }>).metrics as IngestMetrics);
  const queryMetrics = queryRecs
    .filter((c) => c.task === 'query' && c.ok && c.metrics)
    .map((c) => (c as Extract<CaseRecord, { task: 'query' }>).metrics as QueryMetrics);

  const out = {
    provider: args.provider,
    model,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSec: Math.round((finishedAt.getTime() - startedAt.getTime()) / 100) / 10,
    args: {
      tasks: args.tasks,
      concurrency: args.concurrency,
      pauseMs: args.pauseMs,
      tag: args.tag ?? null,
    },
    totals: {
      calls: cases.length,
      successes: cases.filter((c) => c.ok).length,
      errors: cases.filter((c) => !c.ok).length,
      successRate: cases.length ? cases.filter((c) => c.ok).length / cases.length : 0,
      schemaValidRate:
        cases.length ? cases.filter((c) => c.schemaValid).length / cases.length : 0,
      latency: summariseLatency(cases.map((c) => c.latencyMs)),
    },
    byTask: {
      ingest: {
        latency: summariseLatency(ingestRecs.map((c) => c.latencyMs)),
        ...aggregateIngest(ingestMetrics),
      },
      query: {
        latency: summariseLatency(queryRecs.map((c) => c.latencyMs)),
        ...aggregateQuery(queryMetrics),
      },
    },
    cases,
  };

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const stamp = isoStamp(finishedAt);
  const tagPart = args.tag ? `_${args.tag.replace(/[^A-Za-z0-9._-]/g, '-')}` : '';
  const safeModel = model.replace(/[^A-Za-z0-9._-]/g, '-');
  const filename = args.out ?? path.join(
    RESULTS_DIR,
    `${args.provider}_${safeModel}${tagPart}_${stamp}.json`,
  );
  await fs.writeFile(filename, JSON.stringify(out, null, 2));
  // eslint-disable-next-line no-console
  console.log(`[bench] wrote ${path.relative(ROOT, filename)}`);
  // eslint-disable-next-line no-console
  console.log(
    `[bench] success=${out.totals.successes}/${out.totals.calls} ` +
      `schemaValid=${(out.totals.schemaValidRate * 100).toFixed(0)}% ` +
      `p50=${Math.round(out.totals.latency.p50Ms)}ms ` +
      `p95=${Math.round(out.totals.latency.p95Ms)}ms`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
