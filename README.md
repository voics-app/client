# Voics client

Electron + React desktop client for Voics: servers, channels, threads, DMs, voice, video and screen share, with three delivery modes per chat (Standard, Ephemeral E2EE, P2P). Windows is the primary target; macOS and Linux build from the same sources.

## Layout

| Path | Purpose |
|---|---|
| `apps/desktop/src/main` | Main process: hardened window, typed IPC, tray (icon, menu, unread state; show / minimize / close-to-tray settings in `trayController.ts` and `desktop/desktopSettings.ts`), deep links, capture, push-to-talk, updater, crypto host |
| `apps/desktop/src/preload` | `window.discordy` bridge (contextIsolation, sandbox) |
| `packages/core` | `@discordy/core`, shared by desktop and (next) mobile: `src/domain` (pure logic: permissions, delivery modes, SDP synthesis, markdown, frame format) and `src/application` (ports and platform-free zustand stores) and `src/contracts` (REST P9, gateway P7, voice P8). No UI, Electron or browser globals (eslint) |
| `apps/desktop/src/shared` | IPC contract and the brand |
| `apps/desktop/src/renderer/domain` | The few domain modules that still read the brand (`BRAND`); they move once the brand is injected |
| `apps/desktop/src/renderer/application` | Zustand stores, use cases (session, privacy, voice, watch), ports |
| `apps/desktop/src/renderer/infrastructure` | HTTP and gateway clients, WebRTC, audio, workers |
| `apps/desktop/src/renderer/interface` | React UI: design system, features, composition root |
| `apps/mobile` | Expo (React Native) app skeleton: expo-router tabs (Servers, DMs, Notifications, You), name and scheme from `apps/desktop/brand.json`. See [apps/mobile/README.md](apps/mobile/README.md) |
| `eslint.base.mjs` | ESLint rules shared by desktop and mobile |
| `native/crypto` | Rust crypto core (OpenMLS, Ed25519 identity, encrypted local store) with two interface layers: napi-rs for desktop and uniffi for iOS (XCFramework, built by the manual `crypto-ios` workflow) |

## Run locally

Requires Node 24, pnpm 10 and (for encrypted modes) Rust 1.99.

```
pnpm install
pnpm build:native   # builds native/crypto for this platform
pnpm dev            # electron-vite dev server with HMR
```

Run these from this `client` folder (the parent `voics` folder is not a pnpm project).

**A second dev client** (another account, side by side): `pnpm dev2`. It uses renderer port 5174 and its own user data folder `%TEMP%\discordy-dev2`, so it has a separate login, settings, E2EE keys and single-instance lock. Delete that folder to start fresh. Override with `RENDERER_PORT` and `DISCORDY_USER_DATA_DIR` (for a third instance, give both new values). The script is `apps/desktop/scripts/dev2.mjs`.

**Dev clients and production:** production's CORS list only allows the packaged app (`null` origin). So in dev builds only, the main process rewrites `Access-Control-Allow-Origin` on cross-origin responses to the dev server origin (`withDevServerCors` in `src/main/window.ts`). Without that, every request fails with status 0 and the client shows "You appear to be offline". The **Local** connection needs the local backend running (docs `runbooks/local-development.md`).

The component gallery is at `#/__gallery` (open the renderer URL with that hash).

## Mobile app

`pnpm dev:mobile` starts the Expo dev server for `apps/mobile` (phone with Expo Go or a development build, no Mac needed). Details: [apps/mobile/README.md](apps/mobile/README.md). The root `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` cover desktop and mobile; React is pinned to the same version in both apps (React Native needs 19.3), so a single copy is hoisted.

## Test and lint

```
pnpm test:unit      # vitest
pnpm typecheck      # tsc --noEmit for main and renderer
pnpm lint           # eslint, max-warnings 0
pnpm test:e2e       # builds, then Playwright drives the real Electron app against an in-process fake backend
```

## Package

```
pnpm dist:win       # NSIS installer in apps/desktop/release/
pnpm dist:mac       # dmg (run on macOS)
pnpm dist:linux     # AppImage and deb (run on Linux)
```

Installers are unsigned, but electron-builder still writes the icon and version info into the .exe (it downloads winCodeSign, whose archive contains symlinks, so on Windows run the build as administrator or with Developer Mode on). Auto-update uses the generic provider at `UPDATE_FEED_URL`.

## How to rename the app

Edit `apps/desktop/brand.json` (displayName, productName, shortName, appId, protocolScheme, description, publisher, updateFeedHost). The window title, tray, UI copy, deep-link scheme, installer name and `electron-builder.config.cjs` all read it. The unit test `tests/unit/brand/brand.test.ts` fails if the display name is hardcoded anywhere else in `apps/desktop/src`. `@discordy/*` package names and `DISCORDY_*` environment variables are identifiers and stay as they are.

Packaged desktop builds register their link schemes at startup. Development builds do not claim those system associations by default, so they do not replace an installed app's handler. To test links against a development build, start it with `DISCORDY_REGISTER_DEV_PROTOCOL=1`; starting the packaged app again reclaims the association.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DISCORDY_PROFILE` | `production` | `production`, `local` or `custom` |
| `DISCORDY_API_URL` | profile | REST base URL |
| `DISCORDY_GATEWAY_URL` | profile | Gateway WebSocket base URL |
| `DISCORDY_CDN_URL` | profile | Attachments and avatars |
| `UPDATE_FEED_URL` | `https://updates.voics.nl` | electron-updater feed |
| `DISCORDY_USER_DATA_DIR` | OS default | Override the user data directory (tests, a second client) |
| `RENDERER_PORT` | `5173` | Dev server port for `pnpm dev` (run a second client) |

Users can also switch profile from the sign-in screen or Settings, Connection.

## Honest security notes

- Ephemeral E2EE and P2P never fall back to plaintext. If the native crypto module is unavailable, those sends fail with an explanation.
- Voice shows an E2EE badge only when the voice server announces DAVE and frame keys are actually installed.
- Protected (DRM) video captures as black by design. The share picker detects this and offers Watch Together.
- The session is stored with Electron `safeStorage` (OS keychain). The store key for local private history is wrapped by the same keychain.

## Not in v1

Payments, DRM capture, full-text search, slash-command picker UI, and attachments in private delivery modes.

## Pending owner actions

- Code signing certificates for Windows and macOS (installers are unsigned).
- A STUN/TURN server for P2P across restrictive NATs. The gateway READY payload carries `turn` (coturn REST credentials, 1h TTL); the client builds `iceServers` from it (plus a derived STUN entry) and re-identifies at 80% of the TTL to refresh them.
- The generated `@voics-app/contracts` package, once published, replaces `packages/core/src/contracts`.

## Git hooks

Tests run locally, not in CI. Install [lefthook](https://github.com/evilmartians/lefthook) once and run `make hooks` (or `lefthook install`) to enable the pre-push hook in `lefthook.yml`: it runs this repository's lint and unit tests before every push. CI repeats only the slim gate on pull requests. Skip once with `LEFTHOOK=0 git push`.
