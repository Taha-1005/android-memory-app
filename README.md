# Mobile Wiki

A single-user personal wiki for mobile. You paste text or a URL, and the app
turns it into cross-linked wiki pages via your choice of LLM — **Anthropic
Claude** (paid) or **Google Gemini Flash** (free tier). Browse, search, ask
natural questions, and maintain the corpus — all offline-capable, all
on-device.

Built with **Expo (React Native) + TypeScript + SQLite**. Matches the
spec in the original request (v1).

---

## What's in this repo

| Path | What it is |
|---|---|
| `app/` | Expo Router screens: tabs (add / browse / ask / log), page detail, settings modal, onboarding |
| `src/domain/` | Pure TypeScript logic — slugify, mergePage, rank, backlinks, lint. 100% unit-tested |
| `src/db/` | SQLite schema + repositories for `pages` and `source_log` |
| `src/llm/` | Anthropic + Gemini clients (each with hard-timeout via `Promise.race`), the `provider.ts` dispatcher, prompt builders, response parsers |
| `src/secure/` | `expo-secure-store` wrapper for per-provider API keys + the active-provider selector |
| `src/services/` | Ingest pipeline + export/import orchestration |
| `src/components/` | Reusable UI: `WikiBody` (renders `[[wikilinks]]`), `StatusPill`, `PageCard`, etc. |
| `__tests__/unit/` | Jest suites covering every domain/DB/LLM module with a mocked fetch |
| `__tests__/integration/` | A 3-call live Anthropic API smoke test, gated behind `INTEGRATION=1` |
| `bench/` | Fixtures (`bench/fixtures/`) and result JSONs (`bench/results/`) for the ad-hoc LLM benchmark |
| `scripts/bench/` | The benchmark runner and side-by-side comparator (run via `tsx`, not jest) |

---

## Running the tests

```bash
npm install
npm test                    # unit tests only — no network, no API key needed
npm run typecheck           # tsc --noEmit
```

### Integration test (real Anthropic API, minimal cost)

This suite makes exactly **three** live calls — a 5-token probe, one ingest,
and one query — all using `claude-haiku-4-5-20251001` with tiny inputs. A
full run is well under $0.001 of API usage.

```bash
ANTHROPIC_API_KEY=sk-ant-... INTEGRATION=1 npm run test:integration
```

Without `ANTHROPIC_API_KEY`, the three paid tests auto-skip and only the
negative-path sanity checks run.

---

## Choosing a provider (Anthropic vs Gemini)

The app supports two LLM providers. You pick one at onboarding and can
switch any time from **Settings → Provider**.

| Provider | Default model | Cost | Notes |
|---|---|---|---|
| **Anthropic Claude** | `claude-sonnet-4-6` | Pay-as-you-go | Highest answer quality. Get a key at <https://console.anthropic.com/settings/keys> |
| **Google Gemini** | `gemini-2.5-flash` | Free tier | 10 req/min, 250 req/day on Flash; 15 req/min, 1000/day on Flash-Lite. Get a key at <https://aistudio.google.com/apikey> |

Each provider stores its own API key in `expo-secure-store` under a
separate slot — switching providers does **not** wipe the other key.
Models can be overridden per provider in Settings; the model dropdown for
Gemini lists the free-tier models (`gemini-2.5-flash`,
`gemini-2.5-flash-lite`).

### Provider-specific notes

- **Gemini free tier:** rate limits are tight. The app does not retry
  automatically on `429`; a long ingest of the same source may need to be
  re-tapped after a minute. Heavy use should upgrade to Anthropic or to
  Gemini's paid tier.
- **No data leaves your device** beyond the prompts you actively send.
  Anthropic prompts go to `api.anthropic.com`; Gemini prompts go to
  `generativelanguage.googleapis.com`. Nothing else is contacted.

---

## LLM benchmark (ad-hoc, opt-in)

The repo ships a small benchmark harness so you can measure how Claude
and Gemini behave on this app's actual workload — ingest extraction and
grounded QA over a tiny in-memory wiki. It is **not** part of the test
suite; nothing runs unless you explicitly invoke the scripts below.

### What it measures

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

### Why one provider per run

The runner only ever calls one provider per invocation. Two reasons:

1. **Free-tier quotas don't collide.** Gemini caps at 10 requests/min
   on Flash. Mixing in Claude calls makes the wall-clock time and the
   rate-limit headroom impossible to reason about.
2. **Each result file is self-contained and diffable** — the comparator
   reads two completed files instead of trying to interleave live calls.

### How to run it

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

### Cost expectations

- **Anthropic** (Sonnet): a full 10-call run is roughly a few cents of
  API usage. Use `--tasks query` first while iterating on fixtures.
- **Gemini** (Flash): $0 on the free tier. Mind the 10 req/min cap —
  the default `--pause-ms 100` is fine for 10 calls; raise it if you
  add more fixtures.

---

## Downloading / installing the app on an Android phone

You have three options — easiest first.

### Option 1 — Expo Go (fastest, no build needed)

Great for trying the app immediately. Requires a laptop on the same Wi-Fi.

1. Install **Expo Go** from the Play Store:
   <https://play.google.com/store/apps/details?id=host.exp.exponent>
2. On your laptop:
   ```bash
   git clone https://github.com/taha-1005/android-memory-app.git
   cd android-memory-app
   npm install
   npx expo start
   ```
3. A QR code appears in the terminal. Open **Expo Go** on your phone and scan
   the QR code. The app loads over LAN.
4. On first launch, pick a provider and paste your API key. Get one from:
   - Anthropic: <https://console.anthropic.com/settings/keys>
   - Google Gemini (free tier): <https://aistudio.google.com/apikey>

### Option 2 — EAS Build (real APK, no Play Store listing)

This produces a real APK/AAB you can sideload onto any Android device.

1. Install the EAS CLI once:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. From the repo root:
   ```bash
   npm install
   eas build -p android --profile preview      # produces an installable APK
   ```
   `preview` is defined in `eas.json` and builds a debug-signed, shareable
   APK. For a Play-ready AAB use `--profile production`.
3. When the build finishes, EAS prints a download URL. On your phone:
   - Open the URL in Chrome → tap **Download**.
   - Open the downloaded `.apk` → Android will ask to allow "Install unknown
     apps" for Chrome (Settings → Apps → Chrome → Install unknown apps →
     Allow). Accept, then tap **Install**.
4. On first launch, paste your API key into onboarding.

### Option 3 — Local Gradle build (no EAS account)

If you prefer a fully local build:

```bash
npm install
npx expo prebuild -p android
cd android
./gradlew assembleRelease    # produces app/build/outputs/apk/release/app-release.apk
```

Transfer `app-release.apk` to the phone (e.g. `adb install app-release.apk`
with USB debugging on, or via Google Drive / email). Allow "Install unknown
apps" for the source, then tap **Install**.

> **Why sideloading?** Distributing through the Play Store requires a
> Google Play developer account and review. This is a personal tool — you own
> the key, the data, the device — so sideloading an EAS preview APK is the
> expected path.

---

## First-run checklist

1. Launch the app → onboarding asks you to pick a provider (Anthropic or
   Gemini) and paste your API key.
2. The app makes one tiny validation call against that provider's
   "reply with OK" probe (a handful of tokens).
3. On the **Add** tab, paste ~300 words of text, give it a title, tap
   **Save & process**. The model extracts 2-4 pages.
4. On **Browse**, open one of the new pages — wikilinks are tappable.
5. On **Ask**, ask a question about the content. The answer cites pages.
6. Use the wrench (top-right) to reach Settings → switch providers,
   change models, or **Export / Import**. That's your only backup path;
   there is no cloud sync by design.

---

## Project commands

```bash
npm start                     # start the Expo dev server
npm run android               # build+open on a connected Android emulator/device
npm test                      # unit tests (offline)
npm run test:integration      # live API tests (needs ANTHROPIC_API_KEY + INTEGRATION=1)
npm run typecheck             # tsc --noEmit
npm run build:android         # EAS build, production profile
npm run build:android:preview # EAS build, sideloadable APK
npm run bench:claude          # ad-hoc benchmark against Anthropic (needs ANTHROPIC_API_KEY)
npm run bench:gemini          # ad-hoc benchmark against Gemini   (needs GEMINI_API_KEY)
npm run bench:compare         # side-by-side compare of two result files
```

---

## Security notes

- API keys live in **`expo-secure-store`** only — Keychain on iOS,
  EncryptedSharedPreferences on Android. Never written to SQLite or logs.
  Each provider's key has its own slot.
- The app contacts only the API of the provider you've selected:
  `api.anthropic.com` (Anthropic) or
  `generativelanguage.googleapis.com` (Gemini). Nothing else.
- Uninstalling the app wipes the stored keys and the SQLite database. No
  automatic cloud backup (`android.allowBackup` is `false` in `app.json`).

---

## What's intentionally out of scope (v1)

- Cloud sync, OAuth, team / multi-user features
- URL scraping (the LLM summarises from its own knowledge only)
- WYSIWYG editing — markdown + `[[wikilinks]]` only
- PDF / image ingest
- Push notifications, widgets, analytics
