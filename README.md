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
| `src/domain/` | Pure TypeScript logic — slugify, mergePage, mergeStates, rank, backlinks, lint, shared types. 100% unit-tested |
| `src/db/` | SQLite schema + repositories for `pages`, `source_log`, and `backlinks` |
| `src/llm/` | Anthropic + Gemini clients (each with hard-timeout via `Promise.race`), the `provider.ts` dispatcher, prompt builders, response parsers |
| `src/secure/` | `expo-secure-store` wrapper for per-provider API keys + the active-provider selector |
| `src/services/` | Ingest pipeline + export/import orchestration |
| `src/components/` | Reusable UI: `WikiBody` (renders `[[wikilinks]]`), `StatusPill`, `PageCard`, etc. |
| `__tests__/unit/` | Jest suites covering every domain/DB/LLM module with a mocked fetch |
| `__tests__/integration/` | Unified parametrized live suite — one row per provider (Anthropic + Gemini), 3 calls each (probe + ingest + query), gated behind `INTEGRATION=1` |
| `bench/` | Fixtures (`bench/fixtures/`) and result JSONs (`bench/results/`) for the ad-hoc LLM benchmark |
| `src/utils/` | Shared utilities — JSON extraction (`json.ts`), network helpers (`network.ts`), time formatting (`time.ts`) |
| `scripts/bench/` | The benchmark runner and side-by-side comparator (run via `tsx`, not jest) |

---

## Running the tests

```bash
npm install
npm test                    # unit tests only — no network, no API key needed
npm run typecheck           # tsc --noEmit
```

### Integration tests (real API, minimal cost)

A single parametrized live suite covers every provider — one row per
provider in `__tests__/integration/liveApi.test.ts`. Each row makes
exactly **three** calls (key probe + one ingest + one query) using a
cheap/free model and tiny inputs.

The gate is the `INTEGRATION=1` flag and **only** that flag. Setting it
without configuring the relevant API keys is a configuration error and
the suite will fail loudly — there is no per-key auto-skip. Running
`npm test` (no flag) never touches the live API.

```bash
# Both providers in one go (each row needs its own key).
ANTHROPIC_API_KEY=sk-ant-... GEMINI_API_KEY=AIza... \
  INTEGRATION=1 npm run test:integration

# To exercise only one provider, run jest with a name filter:
ANTHROPIC_API_KEY=sk-ant-... \
  INTEGRATION=1 npx jest __tests__/integration -t anthropic
```

Override the models with `ANTHROPIC_MODEL=...` or `GEMINI_MODEL=...`
(defaults: `claude-haiku-4-5-20251001` and `gemini-2.5-flash-lite`).
Anthropic on Haiku is well under $0.001 per full run; Gemini on
Flash-Lite is $0 on the free tier.

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

The repo ships a small benchmark harness for measuring Claude vs Gemini
on this app's actual workload (ingest extraction + grounded QA). It's
opt-in, deterministic (no LLM-as-judge), and not part of the test suite.

See **[`bench/README.md`](bench/README.md)** for what it measures, how to
run it, available flags, and cost expectations.

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

#### Live updates (OTA) for the EAS preview APK

Once you've installed an APK from the `preview` profile, the app can pull
JavaScript / asset changes over-the-air without a reinstall — a push to
`main` republishes the JS bundle and the installed app picks it up on next
launch.

**One-time setup (per repo, per Expo account):**

1. Locally, after `eas login`, run:
   ```bash
   eas update:configure
   ```
   This writes `extra.eas.projectId` and `updates.url` into `app.json` and
   links the project to your Expo account. Commit those changes.
2. In Expo's dashboard, create a Personal Access Token and add it to the
   GitHub repo as a secret named `EXPO_TOKEN` (Settings → Secrets and
   variables → Actions).
3. Build a fresh preview APK so the channel and `expo-updates` runtime are
   baked into the binary:
   ```bash
   eas build -p android --profile preview
   ```
   Install this APK on the phone.

**After that:** every push to `main` runs `.github/workflows/eas-update.yml`,
which publishes an update to the `preview` EAS Update branch. The installed
APK reloads with the new bundle on next launch.

**You'll need a new APK (not just an OTA update) when:**
- You add or upgrade a native dependency (anything with a `ios/` /
  `android/` directory in its package — most `expo-*` modules do).
- You bump `expo.version` in `app.json` (the `runtimeVersion` policy is
  `appVersion`, so a version bump invalidates older OTA bundles).
- You change anything under `expo.android` / `expo.ios` in `app.json`.

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
