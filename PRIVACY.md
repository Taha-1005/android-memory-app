# Privacy Policy — Mobile Wiki

_Last updated: 2026-05-20_

Mobile Wiki ("the app") is a single-user personal wiki for Android. This
document describes what data the app handles and where it goes.

## TL;DR

- The app has **no servers** and does not collect, store, or transmit any
  data about you to the developer.
- Everything you create lives in a local SQLite database on your device.
- The only network traffic the app generates is to the LLM provider **you
  choose** (Anthropic or Google), using **your own API key**, with the
  prompts **you explicitly send** by tapping "Save & process" or asking a
  question.

## Data the app stores on your device

- **Pages, source log, and metadata** — in an on-device SQLite database
  managed by `expo-sqlite`. Not encrypted at rest beyond Android's
  full-disk encryption.
- **API keys** — in `expo-secure-store`, which uses Android's
  EncryptedSharedPreferences (backed by the Android Keystore). Never
  written to plaintext storage or logs.
- **Theme preference** — in `expo-secure-store`.

Uninstalling the app removes all of the above. There is no cloud backup
(`android.allowBackup` is `false`).

## Data sent to third parties

When you tap **Save & process** or ask a question, the app sends the
relevant text to the LLM provider you have selected:

- **Anthropic Claude** — `https://api.anthropic.com` — governed by
  Anthropic's privacy policy: <https://www.anthropic.com/legal/privacy>
- **Google Gemini** — `https://generativelanguage.googleapis.com` —
  governed by Google's privacy policy: <https://policies.google.com/privacy>

You authenticate directly with that provider using your own API key. The
developer of this app has no access to your prompts, responses, or account.

The app contacts **no other network endpoints**. There is no analytics,
crash reporting, advertising SDK, or telemetry.

## Data we (the developer) collect

**None.** There is no server-side component. We cannot see your wiki, your
prompts, your API keys, or whether you've installed the app.

## Your controls

- **Switch providers** at any time from Settings → Provider.
- **Delete a provider's API key** from Settings.
- **Export your wiki** to a JSON file you control (Settings → Export).
- **Wipe everything** by uninstalling the app.

## Children

The app is not directed at children. Use of the underlying LLM providers
is governed by their respective terms, which generally require users to be
at least 13 or 18 years old depending on jurisdiction.

## Changes to this policy

If this policy changes, the new version will be committed to the project
repository at <https://github.com/taha-1005/android-memory-app> and the
`Last updated` date above will be revised.

## Contact

tahafbharucha@gmail.com
