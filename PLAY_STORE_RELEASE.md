# Play Store Release Runbook

End-to-end steps to ship Mobile Wiki to Google Play, starting from zero.
First target is the **internal testing track** (no Google review, instant
availability to up to 100 named testers).

---

## Phase 1 — One-time setup (≈ 1–2 days, mostly waiting)

### 1.1 Create a Google Play developer account

1. Go to <https://play.google.com/console/signup>.
2. Pick **Personal** account type (unless you have a registered business).
3. Pay the **$25 USD** one-time fee.
4. Complete identity verification (government ID upload). Google takes
   **1–2 business days** to approve. You cannot publish anything until
   verification clears.

### 1.2 Create the app in Play Console

After verification:

1. Play Console → **Create app**.
2. App name: `Mobile Wiki`. Default language: English (US).
3. App or game: **App**. Free or paid: **Free**.
4. Accept the declarations (Developer Program Policies, US export laws).

### 1.3 Create a Google Cloud service account for `eas submit`

`eas submit` uploads the AAB to Play on your behalf via a service account
with the **Service Account User** role on the Play Console side.

1. <https://console.cloud.google.com/iam-admin/serviceaccounts> — create a
   new project (or reuse one).
2. Create a service account, e.g. `play-publisher`.
3. **Keys → Add key → JSON** — download the JSON file. Save it as
   `play-service-account.json` at the repo root (already gitignored).
4. <https://play.google.com/console> → **Settings → API access** →
   **Link Google Cloud project** → pick the project from step 1.
5. On the service account row → **Grant access** → role: **Admin (all
   permissions)** or, more narrowly:
   - **App access:** the Mobile Wiki app
   - **Account permissions:** *Create and edit draft apps*, *Release to
     testing tracks*, *Manage store presence*

### 1.4 Host the privacy policy

Play requires a **public URL** for the privacy policy.

Easiest path — GitHub Pages on this repo:

```bash
# in a separate branch or directly on main via PR
mkdir -p docs
cp PRIVACY.md docs/privacy.md
# enable Pages: Repo settings → Pages → Source: main /docs
```

Or paste `PRIVACY.md`'s contents into a Gist (raw URL works too).

Plug the final URL into Play Console → **App content → Privacy policy**.

### 1.5 Produce graphic assets

See `STORE_LISTING.md` for the required sizes:

- Feature graphic (1024×500) — required.
- Phone screenshots — at least 2.
- App icon at 512×512.

Capture screenshots with Maestro on the emulator (see `MAESTRO.md`).

---

## Phase 2 — Build and upload the first AAB

Once Phase 1 is done.

### 2.1 Bump version (if needed)

`app.json` currently has `expo.version = 1.0.1`. `versionCode` is now
managed by EAS (`autoIncrement: true` in `eas.json`), so you don't touch
it manually.

### 2.2 Build the production AAB

```bash
cd /Users/taha/code/android-memory-app
eas build --platform android --profile production
```

EAS will:
- Ask which signing key to use → pick **Generate new keystore** on the
  first run. EAS holds the key for you; you can download it later via
  `eas credentials`.
- Run a cloud build (≈ 10–15 min).
- Print a URL to download the `.aab`.

### 2.3 Submit to the internal track

```bash
eas submit --platform android --profile production --latest
```

This uses `submit.production` in `eas.json`:
- Reads `./play-service-account.json`
- Uploads the latest production build to the **internal** track
- Creates a **draft** release (you still have to click "Review release →
  Start rollout" in Play Console — that's intentional, it lets you eyeball
  the release notes first)

### 2.4 Add testers in Play Console

Play Console → **Testing → Internal testing** → **Testers** tab:

1. Create an email list, add your own Gmail + anyone else you want.
2. Copy the **opt-in URL**.
3. Open that URL on the test phone (signed in to a Gmail in the list) and
   tap **Become a tester**.
4. Install via the Play Store link that appears.

---

## Phase 3 — Required Play Console forms

These have to be filled in once before any track can ship. Most are in
**App content** in the left nav. Use the answers in `STORE_LISTING.md`.

- [ ] Privacy policy URL
- [ ] App access (no login required → declare in form)
- [ ] Ads (No)
- [ ] Content rating questionnaire (expect: Everyone)
- [ ] Target audience and content (18+ recommended)
- [ ] News app (No)
- [ ] COVID-19 contact tracing and status (No)
- [ ] Data safety form (see `STORE_LISTING.md` for the answers)
- [ ] Government app (No)
- [ ] Financial features (No)
- [ ] Health (No)

In **Main store listing**:

- [ ] App name + short description + full description
- [ ] App icon (512×512)
- [ ] Feature graphic (1024×500)
- [ ] Phone screenshots (at least 2)
- [ ] Application type + category

---

## Phase 4 — Promote internal → production

Once you're happy with the internal build:

1. Play Console → **Production** → **Create new release**.
2. Click **Add from library** → pick the same AAB you uploaded to
   internal. (Or build a fresh one.)
3. Fill release notes.
4. **Review release → Start rollout to Production** (start at 20%
   rollout for safety).
5. Google reviews the app — typically **a few hours to 7 days** for a
   first submission, faster on subsequent updates.

---

## Subsequent releases (the steady-state loop)

```bash
# 1. Bump expo.version in app.json if it's a native-affecting change.
#    For pure JS/asset changes, prefer an EAS Update on the production
#    channel instead of a new build (see VERSIONING.md).
git checkout -b feature/release-vX.Y.Z
# edit app.json, commit, PR, merge

# 2. Build + submit
eas build --platform android --profile production
eas submit --platform android --profile production --latest

# 3. In Play Console, promote the new release to whichever track you want.
```

---

## Things that will trip you up (read this)

- **"Upload failed: APK signed with the wrong key"** — happens if you
  changed signing key after the first upload. Fix by uploading from the
  original keystore, or filing a Play key reset (slow). Easiest path:
  let EAS manage the upload key from day one and don't touch it.
- **Service account permissions race** — newly created service accounts
  sometimes need ~15 minutes before Play accepts them. If `eas submit`
  errors with `403`, wait and retry.
- **Data safety mismatch** — Play sometimes flags the listing if your
  declared data practices don't match what their static scan finds. The
  app does not collect or transmit data outside the user-driven LLM call,
  so we declare that explicitly in the form. See `STORE_LISTING.md`.
- **First production review** is the slow one — budget a week. Internal
  testing is the right place to iterate.
- **Target API level** — Play requires apps to target a recent Android
  API (currently API 34+). Expo SDK 54 targets API 35, so you're fine.
- **64-bit requirement** — required since 2019. Expo handles this.
- **Native changes need a new AAB**, not an OTA update. See
  `VERSIONING.md` for the rule.
