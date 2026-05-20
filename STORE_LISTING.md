# Play Store Listing — Mobile Wiki

Copy these fields into Play Console → **Main store listing** and **App content**.
Everything here is a draft — tweak before hitting publish.

---

## Main store listing

### App name (max 30)
`Mobile Wiki`

### Short description (max 80)
`Turn pasted text into a cross-linked personal wiki, offline, on-device.`

### Full description (max 4000)

```
Mobile Wiki is a single-user personal wiki for your phone.

Paste any text — a note, an article, a chunk of a book — and the app turns
it into a small set of cross-linked wiki pages using your own LLM API key
(Anthropic Claude or Google Gemini). Browse the pages, follow [[wikilinks]],
and ask natural-language questions that are answered with citations into
your own corpus.

Why use it
- 100% on-device. Your wiki lives in a local SQLite database. Nothing is
  synced or backed up to the cloud unless you export it yourself.
- Bring-your-own-key. You pay the LLM provider directly; the app has no
  servers, no subscription, no telemetry.
- Two providers supported. Use Anthropic Claude (pay-as-you-go, highest
  quality) or Google Gemini (free tier available).
- Works offline for everything except the moment of ingest / ask, which
  needs network access to your chosen provider's API.

Features
- Paste text → automatic page extraction with titles, summaries, facts,
  and [[wikilinks]].
- Browse and search your wiki, with backlinks on every page.
- Ask grounded questions across your corpus.
- Export and import your entire wiki as a single JSON file — the only
  backup path.
- Light, dark, and system-following themes.
- API keys stored in the Android Keystore (EncryptedSharedPreferences),
  never written to disk in plaintext.

What's intentionally not here
- No cloud sync, no accounts, no sign-in.
- No analytics, no ads, no tracking.
- No URL scraping — paste the text yourself.
- No multi-user / team features.

You need an API key from either Anthropic (https://console.anthropic.com)
or Google AI Studio (https://aistudio.google.com/apikey) to use the app.
The Gemini free tier is enough for casual use.
```

### Category
`Productivity`

### Tags (Play Console picks up to 5)
- Note taking
- Wiki
- Personal knowledge
- AI assistant
- Offline

### Contact email
`tahafbharucha@gmail.com`

### Website
`https://github.com/taha-1005/android-memory-app`  *(or wherever you want to host)*

### Privacy policy URL
**Required.** Host `PRIVACY.md` (rendered to HTML) somewhere public — GitHub
Pages on this repo is the easiest path. Suggested final URL:
`https://taha-1005.github.io/android-memory-app/privacy.html`

---

## Graphic assets you need to produce

| Asset | Size | Notes |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, no alpha | Already have `assets/icon.png` — re-export at 512×512 if not already. |
| Feature graphic | 1024×500 PNG/JPG | Required. Hero image at the top of the listing. Can be just app name + tagline on the `#f4ede0` background. |
| Phone screenshots | min 2, max 8, 16:9 or 9:16, 320–3840 px | Capture from a real device or emulator. Recommended flow: onboarding → browse → page detail → ask. |
| 7-inch tablet | optional | Skip for v1. |
| 10-inch tablet | optional | Skip for v1. |

Capture screenshots with Maestro:
```bash
emulator -avd mobilewiki &
adb wait-for-device
adb install -r path/to/preview.apk
# add `takeScreenshot: browse.png` lines to a Maestro flow and run it
```

---

## App content (the compliance forms)

### Privacy policy
Paste the public URL of `PRIVACY.md` (see above).

### Ads
**No**, this app does not contain ads.

### App access
**All functionality available without restrictions** — there is no login.
*(You may want to provide a demo account note saying "no login required;
user supplies their own LLM API key on first launch.")*

### Content rating questionnaire
Answer **No** to every "does your app contain X" question. Mobile Wiki has
no violence, sex, gambling, drugs, social features, user-generated content
shared with other users, or location features. Expected rating: **Everyone**.

### Target audience
- Target age: **18+** (because the LLM provider terms require it) or **13+**
  if you've confirmed your provider TOS permits it. Default to **18+** to be
  safe.
- Appeals to children: **No**.

### News app
**No**.

### COVID-19 contact tracing
**No**.

### Data safety form

**Data collected:** none by the app itself. The app does not transmit any
user data to a server you operate.

Important caveat: when the user pastes text into the Add tab, that text is
sent to the LLM provider the user has chosen (Anthropic or Google). The user
authenticates directly with that provider using their own API key. The Play
data-safety form considers this "data sharing initiated by the user, not by
the app" — but to be safe, declare it:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS to api.anthropic.com / generativelanguage.googleapis.com) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — uninstalling the app wipes the local DB; the user controls their LLM provider account directly. |

Declare under **"Personal info → Other info"**:
- Data type: **Other info** — "Text the user pastes into the app."
- Collected: **No** (we do not collect it on our servers — there are no servers).
- Shared: **Yes**, with the LLM provider the user selects (Anthropic or
  Google), only for the purpose of processing the user's request, only at
  the user's explicit action.
- Optional: **Yes** — users can refuse to paste anything.

---

## Release notes (for the internal-track first build)

```
First internal build. Smoke-test onboarding, paste-and-ingest, ask, export.
```
