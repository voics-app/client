# Voics client

Standard forum posts retain their request ID and draft while delivery is pending. Reopen the forum and check the same request after an uncertain result. The forum feed shows stored previews, covers, tags, reply counts and activity when the server can supply them. Private-mode forum creation and first-message attachments are not yet available.

Electron + React desktop client for Voics: servers, channels, threads, DMs, voice, video and screen share, with three delivery modes per chat (Standard, Ephemeral E2EE, P2P). Windows is the primary target; macOS and Linux build from the same sources.

## Layout

Desktop streamer mode is configured in Settings → Notifications; it can hide account email and generated server invite codes, redact direct-message notifications and silence app notification/call tones. Settings → Keybinds offers a configurable toggle. Optional OBS detection checks local process names every five seconds; turn the mode on manually before streaming. See [the streamer mode guide](docs/streamer-mode.md) for its boundaries and verification.

Desktop and mobile share gateway recovery in `packages/core`. Each socket has
10 seconds to receive HELLO, then 30 seconds to finish READY/RESUMED; heartbeat
ACKs and duplicate HELLOs do not extend authentication. A failed connection to the
advertised resume endpoint falls back to the configured gateway with the existing reconnect backoff, retaining
the session, sequence and current token. The failed address is ignored until a
fresh READY supplies one. Fatal authentication/intent errors still stop retries;
manual disconnect cancels pending recovery. No extra origins are added to CSP.

Standard mention counts use authoritative versioned snapshots when READY certifies
`read_state_versioned` (contracts#48 / docs ADR0027). ACK and READ_STATE_UPDATE apply only newer
channel versions; CREATE does not increment an already-included count. READ_STATE_SYNC after
resume repairs missed updates and local optimistic ACKs that never committed, without replacing
a newer replayed snapshot. Fresh READY resets the version history. Older gateways retain legacy
counting and private decrypted traffic stays local; private explicit MESSAGE_ACK still syncs
read markers and manual unread using its existing behavior. Notifications and the local mention inbox
continue to consume messages independently; this does not claim durable accounting or delivery.

Server Settings → Overview includes a **Permanent invite** field. Members with
Manage Server can set a 2–32-character code, copy its invite link, rename it or
remove it. Codes ignore case; renaming resets the join count. The server needs a
text channel visible to everyone. The API validates uniqueness and still checks
bans when someone joins.

Server Settings → Audit log includes **Record audit log** and **Keep audit
entries** (30, 90 or 365 days). Only owners and administrators can change these.
Disabling logging preserves retained entries; policy changes always remain
recorded. Shorter retention removes older entries automatically. A role with
View Audit Log can open this page and read entries without changing the policy.
Both controls display server errors and retain unsaved input for correction.
These controls require the API vanity/audit-policy release (api#96 and api#85).

| Path | Purpose |
|---|---|
| `apps/desktop/src/main` | Main process: hardened window, typed IPC, tray (icon, menu, unread state; show / minimize / close-to-tray settings in `trayController.ts` and `desktop/desktopSettings.ts`), deep links, capture, push-to-talk, updater, crypto host |
| `apps/desktop/src/preload` | `window.discordy` bridge (contextIsolation, sandbox) |
| `packages/core` | `@discordy/core`, shared by desktop and mobile: `src/domain` (pure logic: permissions, delivery modes, SDP synthesis, markdown, frame format), `src/application` (ports and platform-free zustand stores), `src/infrastructure` (HTTP and gateway clients), and `src/contracts` (REST P9, gateway P7, voice P8). No UI, Electron or browser globals (eslint) |
| `apps/desktop/src/shared` | IPC contract and the brand |
| `apps/desktop/src/renderer/domain` | The few domain modules that still read the brand (`BRAND`); they move once the brand is injected |
| `apps/desktop/src/renderer/application` | Zustand stores, use cases (session, privacy, voice, watch), ports |
| `apps/desktop/src/renderer/infrastructure` | HTTP and gateway clients, WebRTC, audio, workers |
| `apps/desktop/src/renderer/interface` | React UI: design system, features, composition root |
| `apps/mobile` | Expo (React Native) app: sign-in/2FA, servers, channels, messages, DMs, attachments, settings, push and calls. Name and scheme come from `apps/desktop/brand.json`. See [apps/mobile/README.md](apps/mobile/README.md) |
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

Desktop renderer builds defer settings, server administration, the emoji picker and slash-command panel until opened. Chunk failures retry with backoff, then offer retry, close or reload (reload can discard unsaved changes). The container CI build prints the entry and its static JavaScript imports and enforces a 2,800,000-byte uncompressed budget; run `node apps/desktop/scripts/check-renderer-budget.mjs` after a desktop build. CSS, workers, on-demand chunks and compressed transfer size are outside that budget. See [renderer performance](docs/renderer-performance.md) for measurement and acceptance.


## Desktop navigation and safety

Right-click a server icon or open its header menu for notification settings, Hide muted channels, Collapse all categories, account privacy settings and Copy server ID. Hide muted channels is saved per server through notification settings. Muted servers remain reachable but do not add unread or mention badges. Drag near the rail edges to scroll, or focus an icon and press Alt+Shift+Up/Down to reorder it. The Home badge counts unread, unmuted DM conversations; at most eight conversation avatars appear below it.

DM rows show custom status or live typing and offer a close button on hover or keyboard focus. Closing a DM hides its row; it does not delete its history or leave a group conversation. Friends > Active Now includes voice, activities and custom statuses. Join voice appears only for an accessible server voice channel; the column hides below 1100px.

The Forward picker uses each DM recipient's user ID for their global avatar, including animated images. Forwarding still targets the DM channel ID; recipients without an avatar retain their initials. The routing regression is covered by `apps/desktop/tests/unit/interface/ForwardDialog.test.tsx`.

Server settings group implemented pages under Server, People and Moderation. The owner can delete a server from the settings footer or server menu after typing its exact name. Server profile (under People, for every member) edits your own server nickname, avatar, banner and About me; clearing a field or removing an image falls back to your account profile, and changes use the shared unsaved-changes bar. The Widget page stays hidden until its API exists. Privacy and delivery includes safety guidance; report dialogs disclose what is sent, and private bot responses can be dismissed locally.

Desktop taskbar, tray and title activity follows text chats, announcements, threads
and DMs, with immediate mute updates and timed expiry. Escape marks a channel read;
Shift+Escape marks its server, including when the composer has focus after its own
cancel actions. Standard replies offer a remembered ping toggle and `@silent`
messages. Failed sends restore reply context and mention tokens without replacing
a newer draft. See [desktop notifications](docs/desktop-notifications.md) for rules,
keyboard behavior and native acceptance checks.
## Webhooks and authorized applications

Server Settings → Integrations lists installed application bots and incoming webhooks.
Manage Server exposes application management; Manage Webhooks exposes webhook editing.
Create or edit a webhook's name, avatar and channel, follow its audit entries, or confirm
deletion and URL regeneration. Create/regenerate shows the execution URL once, with Copy
and Hide controls. Leaving the editor discards it; it never enters the query cache or
persistent settings. Failed saves retain the draft and show a persistent retry action.

`voics://oauth2/authorize` and the legacy `discordy://oauth2/authorize` alias open a bot
consent dialog. It supports `bot` and optional `applications.commands`, displays the
server and permissions, and requires an explicit review before authorizing. Unsupported
scopes and redirect/code-flow parameters are rejected. An already installed bot keeps
its current permissions; the dialog acknowledges those permissions without changing them.
Consent also binds to the selected server's exact installation revision from the preview.
Removal or reinstall invalidates the review even when permission bits are unchanged;
the API rejects stale revisions with 409 and requires a fresh preview. The POST field
is required and non-null, so this client requires the matching API/contracts release.

User Settings → Authorized apps lists personal consent records. Revoke consent removes
only your record; the shared server bot stays installed. Server managers remove a bot
through Integrations, with Kick Members and the normal role hierarchy. Developer settings
continue to list applications you own. These flows require contracts#49, docs#178 and
the corresponding API integration implementation with migration 0070.
The local UI structure and behavior are recorded in [Integrations and authorized applications](docs/integrations.md).

## Mobile app

`pnpm dev:mobile` starts the Expo dev server for `apps/mobile` (phone with Expo Go or a development build, no Mac needed). Details: [apps/mobile/README.md](apps/mobile/README.md). The root `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` cover desktop and mobile; React is pinned to the same version in both apps (React Native needs 19.3), so a single copy is hoisted.

Native iOS builds include a ReplayKit broadcast extension for screen sharing during calls. Its app group, embedded target, EAS signing metadata and consent bridge are generated from source; see the mobile README for build and real-device acceptance checks. Camera and screen streams use the existing encrypted media path, including safe cancellation of late permission results and delayed native SSRC announcements.

Mobile presence becomes Idle when the app enters the background by default. Explicitly choosing
Online keeps that status on this device; the intent is stored per account across restarts.
Idle, DND and Invisible remain as selected. Returning to the foreground restores the current
status after the gateway resumes. Logout clears the live presence, and a cold start stays
invisible until READY has loaded the account settings. A supporting gateway retains suspended
mobile availability for a bounded lease (24 hours by default), without keeping the app running.

## Edit attachment descriptions and spoilers

In a Standard chat, open the menu on one of your sent messages and choose **Edit Attachments**
(right-click on desktop, long-press on mobile). Each existing file has a description and a
**Mark as spoiler** switch. Save applies only changed fields; Cancel discards the draft. A failed
save keeps the draft open for retry and leaves the timeline unchanged. Descriptions accept up to
1,024 Unicode characters; clearing one removes it. Files cannot be replaced, renamed or removed
through this editor. Pending messages, other authors' messages and private delivery modes do not
offer this action.

This uses the metadata PATCH contract in contracts#38 and messages#79. Explicit attachment flags
are authoritative: clearing a spoiler also reveals a file whose immutable name starts with
`SPOILER_`; filename fallback applies only to older payloads without flags. File and audio rows
require a reveal too, and opening a different image does not reveal concealed neighbours in the
viewer. See [docs/attachment-metadata.md](docs/attachment-metadata.md) for validation and QA steps.

## Test and lint

```
pnpm test:unit      # vitest
pnpm typecheck      # tsc --noEmit for main and renderer
pnpm lint           # eslint, max-warnings 0
pnpm test:e2e       # builds, then Playwright drives the real Electron app against an in-process fake backend
```

Media-worker tests wait for the output stream to close before asserting on frames. They do not assume WebCrypto finishes within a fixed number of milliseconds on a busy runner.

## Package

```
pnpm dist:win       # NSIS installer in apps/desktop/release/
pnpm dist:mac       # dmg (run on macOS)
pnpm dist:linux     # AppImage and deb (run on Linux)
```

Installers are unsigned, but electron-builder still writes the icon and version info into the .exe (it downloads winCodeSign, whose archive contains symlinks, so on Windows run the build as administrator or with Developer Mode on). Auto-update uses the generic provider at `UPDATE_FEED_URL`.

## How to rename the app

Edit `apps/desktop/brand.json` (displayName, productName, shortName, appId, protocolScheme, description, publisher, updateFeedHost). The window title, tray, UI copy, deep-link scheme, installer name and `electron-builder.config.cjs` all read it. The unit test `tests/unit/brand/brand.test.ts` fails if the display name is hardcoded anywhere else in `apps/desktop/src`. `@discordy/*` package names and `DISCORDY_*` environment variables are identifiers and stay as they are.

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

Desktop and mobile save a random refresh request UUID before sending a rotation.
After a lost response or failed successor save, the same token/UUID pair survives
a restart. Only a successful vault save replaces the runtime tokens and removes
the pending UUID. Logout serializes its clear after pending writes. The supporting
API recovers one immediate unused successor for five minutes; it retains strict
reuse detection for other replays and never restores revoked sessions.

Desktop encrypted files use a flushed temporary file and atomic replacement.
On Windows, Electron 38.8.6 can encrypt before its first `Local State` key write.
The first secret save therefore waits for that wrapped key and flushes its file,
failing after 15 seconds if storage stays unavailable. This may delay a very fast
first sign-in; refresh is not sent before its recovery identity is durable. This
guard depends on Electron's Windows profile format and must be revalidated when
upgrading Electron. It makes no OS power-loss or filesystem durability guarantee.

## Not in v1

Payments, DRM capture, full-text search, slash-command picker UI, and attachments in private delivery modes.

## Pending owner actions

- Code signing certificates for Windows and macOS (installers are unsigned).
- A STUN/TURN server for P2P across restrictive NATs. The gateway READY payload carries `turn` (coturn REST credentials, 1h TTL); the client builds `iceServers` from it (plus a derived STUN entry) and re-identifies at 80% of the TTL to refresh them.
- The generated `@voics-app/contracts` package, once published, replaces `packages/core/src/contracts`.

## Git hooks

Tests run locally, not in CI. Install [lefthook](https://github.com/evilmartians/lefthook) once and run `make hooks` (or `lefthook install`) to enable the pre-push hook in `lefthook.yml`: it runs this repository's lint and unit tests before every push. CI repeats only the slim gate on pull requests. Skip once with `LEFTHOOK=0 git push`.
# Passkeys

Desktop account settings support passkey enrollment, naming and removal; password sign-in offers registered passkeys as a second factor. The ceremony uses the system browser at an explicitly configured HTTPS relying-party origin. See [desktop passkeys](docs/passkeys.md) for configuration, recovery, security boundaries, the isolated browser/API test and OS/mobile acceptance limits.
