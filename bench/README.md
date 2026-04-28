# LLM benchmark (ad-hoc, opt-in)

The repo ships a small benchmark harness so you can measure how Claude
and Gemini behave on this app's actual workload — ingest extraction and
grounded QA over a tiny in-memory wiki. It is **not** part of the test
suite; nothing runs unless you explicitly invoke the scripts below.

## What it measures

The fixtures live in `bench/fixtures/{ingest,query}.json` (5 cases each,
hand-crafted with expected ground-truth signals). For every API call the
runner records:

- **Latency** — per call, plus mean / p50 / p95 over the suite.
- **Schema validity** — did the response parse as the expected JSON shape?
- **Ingest metrics** (extraction)
  - Pages-in-range rate (did the model honour the 1-6 page budget?)
  - Required-kinds rate (did it always include a `source` page?)
  - Preferred-kinds rate (did it produce at least one `entity`/`concept`?)
  - Keyword coverage (fraction of expected keywords found across bodies + facts)
  - Link-keyword coverage (fraction of expected wikilink targets present)
  - Avg pages, body words, facts and links produced
  - Bodies over the 200-word soft limit
- **Query metrics** (grounded QA)
  - Keyword coverage in the answer
  - Citation precision and recall against the ground-truth `mustCite` set
  - Confidence-in-range rate (did the model match the expected confidence?)
  - Answer length adherence
  - **Hallucination hits** — for "out-of-scope" queries we check that the
    answer doesn't sneak in forbidden tokens (e.g. inventing a Tokyo
    population when no Tokyo page exists).

There is **no LLM-as-judge step** — every metric is deterministic, so a
re-run of the same data gives the same score, and Gemini's free-tier
quota isn't burned scoring its own answers.

## Why one provider per run

The runner only ever calls one provider per invocation. Two reasons:

1. **Free-tier quotas don't collide.** Gemini caps at 10 requests/min
   on Flash. Mixing in Claude calls makes the wall-clock time and the
   rate-limit headroom impossible to reason about.
2. **Each result file is self-contained and diffable** — the comparator
   reads two completed files instead of trying to interleave live calls.

## How to run it

```bash
# 1. Install dev deps (only needed once — pulls in tsx).
npm install

# 2. Run the benchmark against Claude. Writes a JSON file into bench/results/.
ANTHROPIC_API_KEY=sk-ant-... npm run bench:claude

# 3. Run the SAME fixtures against Gemini's free tier.
GEMINI_API_KEY=AIza...      npm run bench:gemini

# 4. Compare the two newest result files side-by-side.
npm run bench:compare -- bench/results/anthropic_*.json bench/results/gemini_*.json
# add --markdown for a Markdown table you can paste into a PR
```

Useful flags on the runner:

```bash
npm run bench:gemini -- --model gemini-2.5-flash-lite --pause-ms 6500
#   ^ stay safely under 10 req/min on Flash-Lite by sleeping >=6s between calls

npm run bench:claude -- --tasks ingest        # restrict to ingest fixtures
npm run bench:claude -- --tag baseline-may26  # adds a label to the filename
npm run bench:run    -- --provider gemini --out bench/results/custom.json
```

The runner prints a one-line summary to the terminal and writes the full
case-by-case JSON. Result files are git-ignored (`bench/results/*.json`)
because they're personal and re-generatable.

## Cost expectations

- **Anthropic** (Sonnet): a full 10-call run is roughly a few cents of
  API usage. Use `--tasks query` first while iterating on fixtures.
- **Gemini** (Flash): $0 on the free tier. Mind the 10 req/min cap —
  the default `--pause-ms 100` is fine for 10 calls; raise it if you
  add more fixtures.
