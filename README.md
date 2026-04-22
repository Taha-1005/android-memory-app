# Mobile Wiki

A single-user personal wiki for mobile. You paste text or a URL, and the app
turns it into cross-linked wiki pages via Claude. Browse, search, ask natural
questions, and maintain the corpus — all offline-capable, all on-device.

Built with **Expo (React Native) + TypeScript + SQLite**. Matches the
spec in the original request (v1).

---

## What's in this repo

| Path | What it is |
|---|---|
| `app/` | Expo Router screens: tabs (add / browse / ask / log), page detail, settings modal, onboarding |
| `src/domain/` | Pure TypeScript logic — slugify, mergePage, rank, backlinks, lint. 100% unit-tested |
| `src/db/` | SQLite schema + repositories for `pages` and `source_log` |
| `src/llm/` | Anthropic client (with hard-timeout via `Promise.race`), prompt builders, response parsers |
| `src/secure/` | `expo-secure-store` wrapper for the API key |
| `src/services/` | Ingest pipeline + export/import orchestration |
| `src/components/` | Reusable UI: `WikiBody` (renders `[[wikilinks]]`), `StatusPill`, `PageCard`, etc. |
| `__tests__/unit/` | 12 Jest suites — 54 tests — hit every domain/DB/LLM module with a mocked fetch |
| `__tests__/integration/` | A 3-call live API smoke test, gated behind `INTEGRATION=1` |

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
4. On first launch, paste your Anthropic API key
   (<https://console.anthropic.com/settings/keys>) into the onboarding screen.

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

1. Launch the app → onboarding screen prompts for your Anthropic API key.
2. Paste the key. The app makes one tiny validation call (Haiku, 5 tokens).
3. On the **Add** tab, paste ~300 words of text, give it a title, tap
   **Save & process**. Claude extracts 2-4 pages.
4. On **Browse**, open one of the new pages — wikilinks are tappable.
5. On **Ask**, ask a question about the content. The answer cites pages.
6. Use the wrench (top-right) to reach Settings → **Export / Import**. That's
   your only backup path; there is no cloud sync by design.

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
```

---

## Security notes

- The API key lives in **`expo-secure-store`** only — Keychain on iOS,
  EncryptedSharedPreferences on Android. Never written to SQLite or logs.
- The app sends requests to `api.anthropic.com` and **nowhere else**.
- Uninstalling the app wipes the stored key and the SQLite database. No
  automatic cloud backup (`android.allowBackup` is `false` in `app.json`).

---

## What's intentionally out of scope (v1)

- Cloud sync, OAuth, team / multi-user features
- URL scraping (the LLM summarises from its own knowledge only)
- WYSIWYG editing — markdown + `[[wikilinks]]` only
- PDF / image ingest
- Push notifications, widgets, analytics
