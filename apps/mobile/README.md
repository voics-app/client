# Voics mobile (Expo, React Native)

iOS first, Android from the same code ([client#203](https://github.com/discordy-voics/client/issues/203), plan: docs `plans/2026-11-03-mobile-app.md`, stack: ADR 0024). The app signs in (with two-factor), keeps a gateway connection that resumes when the app returns to the foreground, and lists your servers and their text channels. Tapping a text channel opens its messages (read, send, reply, edit, delete, reactions). The DMs tab lists your 1:1 and group conversations (newest first) and opens them in the same message screen; encrypted conversations show the private-delivery notice. Tapping an author, or Profile in a 1:1 DM, opens their profile (avatar, names, About me, Friends since). The You tab has account info, a device-local reactions switch and Sign out. Attachments are next (client#206 follow-ups). It has not been run on a device or simulator yet; the tests use Jest with mocks.

- Expo SDK 58, React Native 0.88, React 19.3, TypeScript strict. All versions are pinned; check them with `npx expo install --check`.
- `app.config.ts` reads the display name, URL scheme (`voics://`) and bundle id/package from `../desktop/brand.json` (`displayName`, `protocolScheme`, `appId`). The icon is `../desktop/build/icon.png`. The bundle id and Android package are `nl.voics.app`.
- The workspace uses pnpm with `node-linker=hoisted` (root `.npmrc`), which Expo supports; Metro picks up the monorepo automatically. Desktop and mobile pin the same React version so there is one copy.

## Commands

Run from the repo root (`pnpm install` first), or from `apps/mobile` without the `--filter`.

| Command | What |
|---|---|
| `pnpm dev:mobile` | Start the dev server (QR code) |
| `pnpm --filter @discordy/mobile typecheck` | `tsc --noEmit` |
| `pnpm --filter @discordy/mobile lint` | ESLint (config shared via `eslint.base.mjs`) |
| `pnpm --filter @discordy/mobile test` | Jest (jest-expo) and React Native Testing Library |

The root `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` run mobile too, so CI (the node workflow) checks it.

## Run it on a phone (no Mac needed)

1. **Expo Go (fastest).** Install Expo Go from the App Store or Google Play. Put the phone and PC on the same Wi-Fi, run `pnpm dev:mobile`, and scan the QR code (iPhone: Camera app; Android: Expo Go). If the phone cannot reach the PC (firewall, guest Wi-Fi), run `pnpm --filter @discordy/mobile start -- --tunnel`. The skeleton uses only Expo Go compatible modules.
2. **Development build.** Needed once native modules such as WebRTC, push or CallKit arrive (M1 and later). Build in the cloud with EAS (`npx eas-cli build --profile development --platform ios`); an iPhone build needs an Apple Developer account (owner decision, docs#10). Android needs none: `npx eas-cli build --profile development --platform android` gives an APK, or build locally with `pnpm --filter @discordy/mobile android` (needs Android Studio). Then start with `pnpm --filter @discordy/mobile start:dev-client`. EAS profiles are not committed yet (M1).
3. **Simulators.** The iOS simulator needs macOS. On Windows use a real iPhone, or the Android emulator from Android Studio (press `a` in the dev server).

Full walkthrough: docs repo `runbooks/run-the-mobile-app.md`.

## Layout

| Path | Purpose |
|---|---|
| `app/` | expo-router screens: `index` (redirect), `sign-in`, `(tabs)/` (`servers/` has the server list and a server channel list) |
| `src/adapters/` | Keychain session vault, key-value storage, WebSocket factory (ports from `@discordy/core`) |
| `src/runtime/` | composition root (`createRuntime`), foreground resume policy, the app runtime |
| `src/signIn/`, `src/servers/`, `src/messages/` | sign-in screen and error handling, server and channel list models, the channel screen with its message service and permission model |
| `src/` | brand (installed first), theme |
| `tests/` | Jest tests with fakes for the keychain, storage and sockets |
