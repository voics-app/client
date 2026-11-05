# Voics mobile (Expo, React Native)

iOS first, Android from the same code ([client#203](https://github.com/discordy-voics/client/issues/203), plan: docs `plans/2026-11-03-mobile-app.md`, stack: ADR 0024). The app signs in (with two-factor), keeps a gateway connection that resumes when the app returns to the foreground, and lists your servers and their channels of every kind the desktop sidebar shows (text, announcement, voice, stage, forum). Tapping a text channel opens its messages (read, send, reply, edit, delete, reactions). There is no tab bar: the main screen follows the desktop client, a narrow server rail on the left (Direct messages on top, a separator, then servers and folders with the same selected pill, unread pip and mention badge) beside a column with the selected server's name and channels by category (or the DM list), and a user panel at its foot. Tapping a channel or conversation opens the chat full screen over the rail; the back arrow, the iOS edge swipe and the Android back button return to it. The bell in the column header opens Notifications and the user panel (name or gear) opens You. The DM column lists your 1:1 and group conversations (newest first) and opens them in the same message screen; encrypted conversations show the private-delivery notice. The chat header follows desktop: back chevron only (no route name) on every pushed screen, then `# channel` in a server, or the friend's avatar and name in a 1:1 DM with voice call, video call (both show a "not in this test version" notice) and profile buttons; the server members button sits in the right-hand slot (see Servers below). Messages show avatars, names and times with consecutive messages grouped. The composer is a tall rounded field that grows with the text, with a + button (attachments, notice only for now), a send button that appears with text, and a `Message #general` / `Message @bob` hint; it sits above the keyboard through `KeyboardAvoidingView` offset by the measured header height. Opening a chat acks the latest message so its unread dot clears, like desktop. Tapping an author, or the profile button in a 1:1 DM, opens their profile (avatar, names, About me, Friends since). The You screen has account info, a device-local reactions switch and Sign out. Attachments are next (client#206 follow-ups). It has not been run on a device or simulator yet; the tests use Jest with mocks.

**Servers (client#274).** Voice and stage channels sit in their categories with the speaker icon, the user limit and the people connected right now (avatar, name, muted, deafened, camera and live marks, from voice state). Tapping one opens a screen with the channel and its people and the line "Voice isn't in this test version yet"; voice itself needs a native build. Ephemeral and peer-to-peer channels show the lock (or link) icon and open on a plain message, as do forum channels. The people icon in a server channel's header opens the member list (slides in from the right; grouped by hoisted role, then online and offline; avatars with status dot, role colour, owner crown, activity line, search, collapsible groups); tapping a person opens their profile sheet (roles, member since, About me) with a Message button that opens the DM. Tapping the server name opens the server menu: Invite people (expiry and use limit, then copy or share the link), Server settings (only with Manage Server, Manage Roles or Manage Channels) and Leave server (after a confirmation; not for the owner). Server settings has Overview (name, icon from the photo library), Roles (list with member counts and hierarchy locks; per role name, colour, display options and every permission, with the same locks the desktop applies), Members (search; kick and ban only for people you outrank, after a confirmation), Invites (create, copy, revoke) and Channels (create channel or category, rename, delete after a confirmation). Every page checks the same permissions as desktop and shows a note instead of controls when a deep link or a role change leaves the user without access. Not built from desktop's server settings: Emoji, Template, Discovery, Bans (the list and unban), Audit log, server banner and invite splash, description, voice region, system messages, inactive channel, default notifications, prune members, role reordering, duplicating a role, role icons, adding roles to members and members-with-a-role, per-member timeout, nickname, mod view, channel permission overwrites, topic, slowmode, age restriction and reordering of channels, pinned channels, the right-edge swipe that would open the member list, and Delete server. Attachments are next (client#206 follow-ups). It has not been run on a device or simulator yet; the tests use Jest with mocks.

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

1. **Expo Go (fastest).** Install Expo Go from the App Store or Google Play. Put the phone and PC on the same Wi-Fi, run `pnpm dev:mobile`, and scan the QR code (iPhone: Camera app; Android: Expo Go). If the phone cannot reach the PC (firewall, guest Wi-Fi), run `pnpm --filter @discordy/mobile start -- --tunnel`. Everything uses Expo Go compatible modules (including `expo-clipboard` and `expo-image-picker`, added for invite copying and the server icon).
2. **Development build.** Needed once native modules such as WebRTC, push or CallKit arrive (M1 and later). Build in the cloud with EAS (`npx eas-cli build --profile development --platform ios`); an iPhone build needs an Apple Developer account (owner decision, docs#10). Android needs none: `npx eas-cli build --profile development --platform android` gives an APK, or build locally with `pnpm --filter @discordy/mobile android` (needs Android Studio). Then start with `pnpm --filter @discordy/mobile start:dev-client`. EAS profiles are not committed yet (M1).
3. **Simulators.** The iOS simulator needs macOS. On Windows use a real iPhone, or the Android emulator from Android Studio (press `a` in the dev server).

Full walkthrough: docs repo `runbooks/run-the-mobile-app.md`.

## Layout

| Path | Purpose |
|---|---|
| `app/` | expo-router screens: `index` (the main screen: rail, column, user panel), `servers/[guildId]` and `dms` (the same screen with that view selected), `servers/[guildId]/[channelId]` and `dms/[channelId]` (chats), `you`, `notifications`, `sign-in` |
| `src/shell/` | the main screen: server rail, channel and DM columns, channel rows, the server menu, user panel; `railModel` holds the unread and mention rules |
| `src/voice/`, `src/members/`, `src/invites/`, `src/serverSettings/` | the voice channel screen and occupant list, the member list, invite creation, and the server settings pages (each page with its permission model) |
| `src/ui/` | small shared controls: bottom sheet, buttons, text field, chips, list row, `attempt` for failures |
| `src/adapters/` | Keychain session vault, key-value storage, WebSocket factory (ports from `@discordy/core`) |
| `src/runtime/` | composition root (`createRuntime`), foreground resume policy, the app runtime |
| `src/signIn/`, `src/servers/`, `src/messages/` | sign-in screen and error handling, server and channel models, the channel screen with its message service and permission model |
| `src/` | brand (installed first), theme |
| `tests/` | Jest tests with fakes for the keychain, storage and sockets |
