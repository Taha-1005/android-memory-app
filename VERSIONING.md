# Versioning & Release Rules

These rules govern when and how to change the app version. **Assess every change
against this file before merging to `main`** (see the checklist at the bottom).

## 0. Quick rule (the 90% case)

- **JS/TS-only change** → **do NOT bump `expo.version`.** It ships OTA to
  everyone on merge, no reinstall.
- **Native change** (native dep, Expo SDK, `ios/`/`android/`, native
  `app.json` keys, launcher icon/splash) → **bump `expo.version` + new
  `eas build`.** Installed apps need a one-time reinstall to catch up.

Why bumping on a JS-only change is harmful: `runtimeVersion` uses the
`appVersion` policy, so changing `expo.version` changes the runtime version
and **orphans every installed app from OTA** until they reinstall. Only bump
when a native change already forces a rebuild anyway. This coupling is
intentional (predictable: OTA compatibility breaks only when you bump) — see
§3 for the full reasoning.

## 1. Two things to decide for every change

Every merge has to answer two independent questions:

1. **SemVer impact** — does this change the MAJOR, MINOR, or PATCH number?
2. **Delivery path** — can it ship over-the-air (OTA), or does it need a new
   native build (APK/AAB)?

They are independent: a JS-only patch fix and a native-dependency upgrade are
both "fixes", but only one of them can reach users without a reinstall.

## 2. SemVer rules (`MAJOR.MINOR.PATCH`)

Source: [Semantic Versioning 2.0.0](https://semver.org/).

| Part | Bump when… | Examples in this app |
|------|------------|----------------------|
| **MAJOR** (`X.0.0`) | A backward-**incompatible** change. Existing users must change data or can't load old data. | Export/import JSON format change that old versions can't read; a SQLite schema migration that isn't backward compatible; removing a screen/feature others depend on. |
| **MINOR** (`x.Y.0`) | A backward-**compatible** new feature or capability. | New panel/screen, a new LLM provider, an additive settings option, a new optional DB column with a safe migration. |
| **PATCH** (`x.y.Z`) | A backward-**compatible** bug fix or internal change. No new feature, no behavior contract change. | Logic fix, refactor, copy/UI tweak, dependency bump with no API change, CI/test changes. |

Additional SemVer rules that apply here:

- Pre-1.0 (`0.y.z`) means anything may change; once we ship `1.0.0` the public
  surface (data format, export schema, deep-link scheme) is the contract.
- A released version is immutable — never re-point a shipped version at
  different code; cut a new version instead.

## 3. Delivery rules (the Expo/EAS part — read this carefully)

This project sets, in `app.json`:

```json
"runtimeVersion": { "policy": "appVersion" }
```

So **`runtimeVersion` is exactly `expo.version`.** An OTA update only loads on a
build whose runtime version matches. Consequences:

- Sources: [Expo — Runtime versions and updates](https://docs.expo.dev/eas-update/runtime-versions/),
  [Expo — Updates SDK](https://docs.expo.dev/versions/latest/sdk/updates/).

### 3a. Ships OTA — do NOT change `version`

Pure **JavaScript / TypeScript / React** changes are OTA-deliverable and reach
already-installed APKs automatically (CI publishes to the `preview` channel on
merge to `main`). For these, **leave `expo.version` unchanged** — bumping it
would change the runtime version and *orphan every installed app from OTA*
until users reinstall a new native build.

Examples: domain/logic fixes, screen/component changes, prompt changes, styling,
copy, test changes, refactors with no native impact.

### 3b. Requires a new native build — MUST bump `version`

Any **native** change requires a new `eas build` **and** a `version` bump (so
the new build and its updates share a fresh runtime version, and old installs
don't get incompatible updates):

- Adding, removing, or upgrading a **native dependency** (any `expo-*` /
  React Native package with native code).
- Upgrading the **Expo SDK**.
- Changing native config in `app.json`: `plugins`, `scheme`,
  `ios`/`android` blocks, permissions, `bundleIdentifier`/`package`,
  `runtimeVersion`, or the `updates` block.
- Editing anything under `ios/` or `android/`.

If you forget to bump `version` on a native change, builds and updates get a
runtime-version mismatch and OTA silently stops working.

### 3c. Combine with SemVer

When a native change also warrants a SemVer bump, do both at once: pick the
MAJOR/MINOR/PATCH level from §2, set `expo.version` accordingly in `app.json`,
and cut a new build. JS-only MINOR/PATCH work accumulates and is "named" at the
next native release rollup.

## 4. How to actually bump

1. Edit `expo.version` in `app.json` (single source of truth; `runtimeVersion`
   follows it automatically).
2. Commit on the feature branch with a message stating the level and why
   (e.g. `chore: bump version to 1.1.0 — adds <feature>, native dep added`).
3. After merge, trigger `eas build --profile preview --platform android` and
   distribute the new APK (OTA cannot deliver a native change).

## 5. Pre-merge checklist (assess before every merge to `main`)

- [ ] Does the diff touch native deps, the Expo SDK, `ios/`, `android/`, or
      native `app.json` keys? → **bump `version`** + plan a new build (§3b).
- [ ] Is it a backward-incompatible change to data/export/schema/public
      surface? → **MAJOR** bump (§2).
- [ ] Is it a new backward-compatible feature? → **MINOR** (bump now if it's a
      native release; otherwise it ships OTA and is named at the next rollup).
- [ ] Is it a backward-compatible JS-only fix/refactor? → **no `version`
      change**; it ships OTA on merge (§3a).
- [ ] If `version` changed, is a fresh `eas build` queued so installed apps
      aren't orphaned from OTA?

## Sources

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Expo — Runtime versions and updates](https://docs.expo.dev/eas-update/runtime-versions/)
- [Expo — Updates SDK reference](https://docs.expo.dev/versions/latest/sdk/updates/)
