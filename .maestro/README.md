# Maestro E2E (like-on-mobile)

These flows drive the **real native build** on an Android emulator or device —
the faithful "exactly as on mobile" test. Unit tests (Jest) mock the native
layer; these don't: real `expo-sqlite`, `expo-secure-store`, navigation.

## One-time local setup

Requires a JDK, the Android SDK + emulator, and the Maestro CLI.

```bash
brew install --cask temurin                       # JDK (Maestro + Android need Java)
brew install --cask android-commandlinetools      # sdkmanager / avdmanager
export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "platforms;android-34" \
  "system-images;android-34;google_apis;arm64-v8a"
avdmanager create avd -n mobilewiki -k "system-images;android-34;google_apis;arm64-v8a" --device pixel_6
curl -Ls "https://get.maestro.mobile.dev" | bash   # installs ~/.maestro/bin/maestro
```

Add the env exports above to your shell profile so `adb`/`emulator`/`maestro`
stay on `PATH`.

## Run

```bash
emulator -avd mobilewiki -no-snapshot -gpu swiftshader_indirect &   # boot emulator
adb wait-for-device
# install the app under test (preview APK, or a local `eas build`/dev build):
adb install -r /path/to/app.apk
npm run e2e                  # runs the secret-free flows in .maestro/
```

Deeper flow that enters a key (network, not for CI):

```bash
maestro test -e MAESTRO_API_KEY="sk-ant-..." .maestro/key-entry.yaml
```

## Flows

| File | Secret-free | What it checks |
|---|---|---|
| `onboarding.yaml` | yes | Fresh launch shows onboarding (logo, providers, key field) |
| `key-entry.yaml` | no (needs `MAESTRO_API_KEY`) | Key entry → lands on the tab UI |

`onboarding.yaml` is the CI-safe golden path. Keep new deterministic,
secret-free flows here; gate anything needing a key or network behind an env
var like `key-entry.yaml` does.
