# Running Maestro E2E (like-on-mobile tests)

Maestro drives the **real native build** on an Android emulator or device —
the faithful "as on mobile" test layer. Unit tests (Jest) mock the native
side; these don't, so they exercise real `expo-sqlite`, `expo-secure-store`,
navigation, and theming.

The instructions below were end-to-end verified against an Android-34 arm64
emulator on an Apple Silicon Mac with the v1.0.1 preview APK — every step
ran clean, all assertions in `.maestro/onboarding.yaml` pass.

## One-time setup

Installs go into `$(brew --prefix)` (no `sudo`).

```bash
# 1. JDK 17 (brew formula, not the cask, to avoid sudo prompts)
brew install openjdk@17
export JAVA_HOME="$(brew --prefix)/opt/openjdk@17"

# 2. Android command-line tools
brew install --cask android-commandlinetools
export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# 3. Accept licenses + install SDK packages (multi-GB download)
yes | sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "platforms;android-34" \
  "system-images;android-34;google_apis;arm64-v8a"

# 4. Create the AVD
avdmanager create avd -n mobilewiki -f \
  -k "system-images;android-34;google_apis;arm64-v8a" --device pixel_6

# 5. Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version    # should print 2.5.x or newer
```

Persist the four `export` lines in your shell profile (`~/.zshrc` /
`~/.bashrc`) so `adb`, `emulator`, and `maestro` stay on `PATH`.

## Run

```bash
# Boot the emulator headlessly (skip --no-window if you want to watch it)
emulator -avd mobilewiki -no-window -no-audio -no-boot-anim \
  -no-snapshot -gpu swiftshader_indirect -accel auto &
adb wait-for-device
# Wait for full boot
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 4; done

# Install the app under test (use any APK — preview, dev build, etc.)
adb install -r /path/to/app.apk

# Run the secret-free golden path (also wired up as `npm run e2e`)
maestro test .maestro/onboarding.yaml

# Tear down
adb emu kill
```

## Flows

| File | Secret-free | What it checks |
|---|---|---|
| `.maestro/onboarding.yaml` | yes | Fresh launch → onboarding shows logo, provider buttons (Anthropic Claude / Google Gemini), the API key form, and the "Validate & save" button |
| `.maestro/key-entry.yaml` | no (needs `MAESTRO_API_KEY`) | Enters a real key, taps "Validate & save", asserts landing on the add-source screen ("Paste text") |

Run the deeper flow only when you want to validate the network path:

```bash
maestro test -e MAESTRO_API_KEY="sk-ant-..." .maestro/key-entry.yaml
```

## Writing more flows — the one lesson worth remembering

**Maestro `id:` on Android matches the native resource-id, NOT React
Native's `accessibilityLabel`.** Asserting `id: ".*API key"` will not
match a TextInput that uses `accessibilityLabel="… API key"`. Use the
visible text the screen actually renders (form labels, button text):

```yaml
- assertVisible: "API key"         # the <Text style={styles.label}>
- assertVisible: "Validate & save" # the submit button
- tapOn: { below: "API key" }      # focus the input under the label
- inputText: "…"
```

This was learned the hard way during the initial validation run
(4 / 5 assertions passed; the `id:` matcher was the failure). Stick to
visible-text matchers and the suite stays robust.

## Troubleshooting

- **`Unable to locate a Java Runtime`** — `export JAVA_HOME` and `PATH`
  as above; the brew formula doesn't auto-link `java` to `/usr/bin`.
- **Emulator hangs at "device online; waiting for full boot"** —
  give it longer on first boot (system image init can take 90s+); confirm
  with `adb shell getprop sys.boot_completed` returning `1`.
- **Maestro `Element selector may be incorrect`** — open the test
  artifacts directory printed in the failure output; it contains a UI
  hierarchy dump + screenshot showing the actual visible text.

## CI / not-CI

`.maestro/onboarding.yaml` is deterministic and CI-safe (no secrets, no
network). `.maestro/key-entry.yaml` requires `MAESTRO_API_KEY` and hits
the provider — keep it out of CI unless you're explicitly testing the key
path. Maestro saves screenshots in the working directory; these are
git-ignored (`*.png` at repo root would be unusual; ignored under the
explicit Maestro outputs pattern).
