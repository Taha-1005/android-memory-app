# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contribution rules (enforced by branch protection on `main`)

- **No direct pushes to `main`** — including by repo admins. All changes go through a pull request.
- **Branch names must start with `feature/`.** PRs from any other prefix (e.g. `chore/`, `fix/`, `claude/`) are rejected by the `Validate source branch` check.
- **Required CI checks:** `Typecheck and unit tests` and `Validate source branch` must pass before a PR can merge. Defined in `.github/workflows/test.yml` (runs on `pull_request` to `main`).
- **Reviews: 1 required, code-owner only.** `.github/CODEOWNERS` makes `@Taha-1005` the owner of all paths and `require_code_owner_reviews` is on, so **only `@Taha-1005`'s approval can satisfy a PR's review** — another collaborator's approval does not count. Anyone with write access can still create `feature/*` branches and open PRs.
- **Admin bypass:** `enforce_admins` is **off** so the repo owner can merge their own PRs (GitHub disallows self-approval). All non-admins are fully gated by the code-owner review.
- **No force pushes, no branch deletions** on `main`.
- The `EAS Update` workflow is **not** a required check (it runs on push to `main` after merge).
- **Versioning:** before merging any PR to `main`, assess the change against
  [`VERSIONING.md`](./VERSIONING.md) and run its pre-merge checklist. It decides
  the SemVer bump (or none) and whether the change ships OTA or needs a new
  native build + `expo.version` bump. Native changes that skip the bump silently
  break OTA for installed apps.

Standard flow:
```bash
git checkout -b feature/<short-description>
# work, commit
git push -u origin feature/<short-description>
gh pr create --base main
# wait for green checks, then merge
```

## Commands

```bash
npm install                   # install deps
npm test                      # unit tests (offline, no API key)
npm run test:watch            # watch mode
npx jest __tests__/unit/foo.test.ts          # single test file
npx jest __tests__/unit/foo.test.ts -t "name"  # single test by name
npm run typecheck             # tsc --noEmit (also used as lint)
npm start                     # Expo dev server (scan QR with Expo Go)
npm run e2e                   # Maestro E2E on emulator/device — see .maestro/README.md for setup

# Integration tests — hit real APIs, cost real tokens
ANTHROPIC_API_KEY=sk-ant-... INTEGRATION=1 npm run test:integration
ANTHROPIC_API_KEY=sk-ant-... INTEGRATION=1 npx jest __tests__/integration -t anthropic

# Benchmarks (opt-in, separate from jest)
ANTHROPIC_API_KEY=... npm run bench:claude
GEMINI_API_KEY=...    npm run bench:gemini
npm run bench:compare          # compare two result JSONs
```

## Architecture

### Data flow (ingest)

User pastes text → `saveSource` writes a `source_log` row → `runIngestForLog` calls the LLM (`runIngest`) → `applyIngestResults` upserts pages via `mergePage` → DB.

The pipeline is split into two phases (`runIngestForLog` / `applyIngestResults`) so the caller can insert a duplicate cross-check between the LLM call and the write.

### LLM layer (`src/llm/`)

- **`provider.ts`** — single entry point `callLLM`. Normalises Anthropic and Gemini into one `LLMCallResult` shape, retries once on transient HTTP errors (408/429/5xx), and surfaces friendly rate-limit messages. **Anthropic always uses `claude-sonnet-4-6` regardless of user model overrides** (Gemini honours `opts.model`).
- **`prompts.ts`** — every LLM call goes through a `buildXxxPrompt()` that returns `{ system, user, tool?, cacheSystem? }`. The `system`/`user` split lets Anthropic use its dedicated system field (and optional prompt cache); Gemini receives them concatenated.
- **`client.ts`** / **`geminiClient.ts`** — raw HTTP clients with hard timeouts via `Promise.race`. Use `tool` (Anthropic tool-use) or `jsonMode` (Gemini `responseMimeType`) to get structured JSON back.
- **`ingest.ts`** / **`duplicates.ts`** / **`merge.ts`** / **`query.ts`** — one module per LLM task; each parses its own response via `extractJson` (in `src/utils/json.ts`).

### Domain layer (`src/domain/`)

Pure TypeScript, no I/O, 100 % unit-tested.

- **`mergePage`** — upsert logic: if `userEdited`, the stored body/kind wins; otherwise the incoming page wins. Facts and links always union.
- **`slugify`** — canonical slug generation used as the pages primary key.
- **`mergeStates`** — reconciles React state lists after upserts without a full DB re-fetch.
- **`rankPages`** / **`backlinks`** / **`lint`** — browse ordering, backlink index, and corpus health checks (orphans, thin pages, stale pages, duplicate groups).

### Database (`src/db/`)

SQLite via `expo-sqlite`. Three tables: `pages` (slug PK), `source_log`, `meta` (schema version). Repositories in `src/db/repositories/` wrap all SQL. `initDb()` in `client.ts` runs `ALL_STATEMENTS` and resets any `processing=1` rows that survived a crash.

### Secure storage (`src/secure/apiKey.ts`)

API keys live in `expo-secure-store` only — one slot per provider (`anthropic`, `gemini`). `getProvider()` / `getApiKey()` / `getModel()` are the read helpers used throughout the LLM layer.

### Screens (`app/`)

Expo Router file-based routing. `_layout.tsx` initialises the DB before rendering. `index.tsx` redirects to onboarding (no key) or browse (has key). Tab group is `(tabs)/`. `settings.tsx` and `page/[slug].tsx` are modals/stack screens.

### Testing conventions

- Unit tests mock `fetch` via `jest.fn()` — never hit real APIs.
- `__tests__/helpers/memDb.ts` provides an in-memory SQLite instance for repository tests.
- Integration tests are gated by `INTEGRATION=1`; Jest config excludes `__tests__/integration/` unless that env var is set.
- Default models for integration tests: `claude-haiku-4-5-20251001` (Anthropic), `gemini-2.5-flash-lite` (Gemini) — override with `ANTHROPIC_MODEL` / `GEMINI_MODEL`.
