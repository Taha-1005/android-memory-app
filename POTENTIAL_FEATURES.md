# Potential Features & Deferred Improvements

A tracking list of code/architecture/UX improvements that have been considered
and consciously deferred. Each entry captures the problem, the rationale for
deferring, and a rough hint at when it should be reconsidered.

---

## A4. Database migration framework

**Problem.** `src/db/client.ts` writes `SCHEMA_VERSION = 1` to the `meta` table
on first init but never reads it back, and every column uses `IF NOT EXISTS`.
The moment v2 needs to add or alter a column, existing users will fail to
upgrade or run on the v1 schema with new code.

**Why deferred.** No schema changes are pending; deferring until the first real
migration is needed is fine. The cost of doing it now is similar to the cost
later, and we'd be coding against a hypothetical.

**Reconsider when.** Any column add/rename/drop is proposed for `pages`,
`source_log`, or `meta`. Pair the migration framework with that change.

---

## B3. "Wipe all wiki data" button in Settings

**Problem.** Settings can clear API keys but not the SQLite database. Users
who want to start fresh have to uninstall.

**Why deferred.** Workaround exists (uninstall) and the app is single-user.
Not safety-critical.

**Reconsider when.** Adding a debug/dev panel, or shipping to wider audience
where uninstall feels heavy.

---

## F6. Cross-check toggle should also gate "Reprocess" from the Log tab

**Problem.** The "Reprocess" action in `app/(tabs)/log.tsx` always uses the
no-toggle `processSource` path, ignoring the cross-check setting in Settings.
Inconsistent with the Add screen.

**Why deferred.** Reprocess is rarely used and the user's mental model is
"redo what was done before." Documenting the behavior in a tooltip is enough
for now.

**Reconsider when.** Users complain about inconsistent dedup behavior, or
reprocess becomes a more visible feature.

---

## C5. Replace module-level singletons in db/client.ts and secure/apiKey.ts

**Problem.** `_db` and `injected` are module-level mutable state. Couples
lifetime to module load, complicates parallel test runs.

**Why deferred.** Workable for a single-user app. The test-injection seams
already cover unit tests. React Context refactor is overkill at current scope.

**Reconsider when.** Multi-tenant or multi-database scenarios appear (very
unlikely for a personal wiki).

---

## C6. Extract a shared httpJson helper for both LLM clients

**Problem.** `src/llm/client.ts` and `src/llm/geminiClient.ts` are ~140 lines
each with ~70% mechanically identical machinery (timeout race, abort, fetch,
JSON parse, error formatting).

**Why deferred.** Duplication is shallow; each provider has its own
request/response shape. Saving ~60 lines is not worth the refactor risk.

**Reconsider when.** Adding a third provider (e.g., Mistral, Cohere). Extract
`httpJson(url, body, opts)` then.

---

## E3. Reword the heuristic Dupes stat

**Problem.** Now that AI dedup exists, the `Dupes: N` stat is just a heuristic
title-collision count. The label "Dupes" implies a duplicate detection that
the heuristic doesn't really do (Unicode-stripping bug, sort-by-token
semantics).

**Why deferred.** Cosmetic; users have the AI scan button next to it which is
the real action.

**Reconsider when.** Touching the Settings Health section. Rename to
"Title-collisions" so the meaning is unambiguous.

---

## E4. Slug collisions silently merging two distinct titles

**Problem.** "Apple Inc." and "Apple, Inc" both produce `apple-inc`. `mergePage`
folds them. The pre-ingest cross-check catches this for new ingests but it
remains possible during import or manual edits.

**Why deferred.** Edge case; covered for the common ingest path by AI dedup.

**Reconsider when.** A user reports two pages folding unexpectedly, or import
becomes a more common entry point.

---

## E5. mergePage exact-string fact/link dedup

**Problem.** "Founded 1976" and "founded 1976" survive as separate facts
through repeated merges.

**Why deferred.** The user-driven dedup feature gives users a way to clean
fact lists. Not worth automatic normalization.

**Reconsider when.** Users complain about noisy fact lists.

---

## F4. Browse uses synthesized header/item array instead of SectionList

**Problem.** `app/(tabs)/browse.tsx` flattens grouped sections into discriminated
union items to feed FlatList. RN ships SectionList for exactly this.

**Why deferred.** Stylistic; current code works.

**Reconsider when.** Touching Browse for a real feature.

---

## F5. chatWordCount uses whitespace split

**Problem.** Word ≠ token. The 1000-word budget approximates ~1300 tokens.

**Why deferred.** Soft heuristic; well under any model's context. Not worth
adding a tokenizer dependency.

**Reconsider when.** Token-precise budgeting is required (e.g., to fit a
specific model's context exactly).

---

## F7. Dynamic imports for native modules

**Problem.** `expo-sqlite`, `expo-secure-store`, `@react-native-community/netinfo`
are imported dynamically inside async functions as a ts-jest workaround. Loses
static type checks on those imports; mobile bundle has slightly less aggressive
treeshaking.

**Why deferred.** Workaround is harmless; alternative requires a jest module
mock setup.

**Reconsider when.** Migrating the test runner, or the bundle size becomes a
concern.

---

## F8. Bench scripts unread

**Problem.** `scripts/bench/run.ts` and `scripts/bench/compare.ts` are referenced
in `package.json` but not exercised in CI. May have bit-rotted alongside
provider-merge work.

**Why deferred.** Out of scope for current refactor.

**Reconsider when.** Next time you want to compare provider performance —
spot-check the scripts run cleanly first.

---

## C1. Split app/settings.tsx into per-section components

**Problem.** Settings is now ~800 lines covering provider switching, key
management, model picker, export/import, health stats, dedup scan, chat panel,
and the cross-check toggle. Re-render scope is the whole screen on any keystroke.

**Why deferred.** Mid-flight refactor risk is high; current code works. The
dedup section is the natural first split point when the next feature touches
this file.

**Reconsider when.** Adding the next Settings feature, or a contributor reports
friction editing the file.

---

## G1. UI tests via @testing-library/react-native

**Problem.** 85 unit tests cover domain + parsers. No UI-layer coverage of
`settings.tsx`, `add.tsx`, or the dedup resolution flow.

**Why deferred.** UI surface is moving fast; UI tests calcify behavior we may
still iterate on.

**Reconsider when.** UI stops moving — likely after one or two more feature
drops settle the dedup UX. Highest-value targets: the resolution sheet on
Add, and the dedup chat panel.
