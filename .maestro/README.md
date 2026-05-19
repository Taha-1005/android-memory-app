# Maestro flows

E2E flows that drive the real native build on an emulator/device.

**Setup + run instructions live in [`MAESTRO.md`](../MAESTRO.md) at the repo
root** — single source of truth, kept there so it's discoverable next to
`README.md` / `VERSIONING.md`.

| File | Secret-free | What it checks |
|---|---|---|
| `onboarding.yaml` | yes | Golden path: fresh launch shows onboarding (logo, providers, key form, submit button) |
| `key-entry.yaml`  | no (needs `MAESTRO_API_KEY`) | Enters a key, asserts the add-source screen |

Quick run (after one-time setup per `MAESTRO.md`):

```bash
emulator -avd mobilewiki -no-window -no-audio -no-snapshot -gpu swiftshader_indirect &
adb wait-for-device
adb install -r /path/to/app.apk
npm run e2e
```
