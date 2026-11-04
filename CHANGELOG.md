# Changelog

## Unreleased

- Messages with more than four images show a compact grid of four with a "+N" on the last tile, and swiping left or right in the image viewer turns to the next or previous image.
- Internal: fixed a flaky P2P attachments test; it stopped waiting for the link after a fixed number of ticks while the files were still being encrypted. No change in behaviour.
- Moderation: Duplicate role (role list context menu and role settings), Settings, Overview, Safety has Only administrators can prune members, Members has Prune members (pick 1 to 30 days, see how many would be removed, then confirm), and Mod View opens from a ban or an audit log entry to show a user who is no longer in the server with their ban reason and moderation history. Needs api#112 (prune) and the api#101 changes.
- Group DMs can have up to 25 members (was 10); the new-group dialog follows. Needs the api change that raises the cap (api#100); an api configured with a lower `GROUP_DM_MAX_PARTICIPANTS` will refuse the extra members with an error.
- Internal: the domain and application layers no longer touch `window`, `document` or `localStorage`; persistence goes through a storage port, a first step towards sharing the core with the mobile app. No change in behaviour.
- Internal: the mobile app skeleton depends on `@discordy/core` (the sign-in screen shows its delivery-mode copy with the installed brand); Metro and Jest resolve the workspace package.
- Internal: the application ports and 20 zustand stores (everything except the voice, session, update and transfer stores) moved into `@discordy/core` (`src/application`), which now depends on zustand. No change in behaviour.
- Internal: the product identity the domain rules read (name, deep-link scheme, hosts) is now an installed `BrandConfig` (`@discordy/core/domain/brandConfig`) instead of an import of the desktop brand module, so the six brand-aware rules (sessions, channel links, delivery modes, invites, link trust, templates) moved into `@discordy/core`. No change in behaviour.
- Internal: the domain rules and protocol contracts moved into the new `packages/core` workspace package (`@discordy/core`), which the desktop imports; the mobile app will share it.
- The composer has a timestamp picker: type @time or press the clock button, choose a date, time and format (short or long time, short or long date, date and time, relative), and it inserts a timestamp that every reader sees in their own time zone, with the full date on hover.
- Settings, Voice and Video has Confirm before calling (on by default, this device only): starting a voice or video call that nobody is in yet asks "Start a voice call with X?" before it rings.
- Messages render GitHub-style pipe tables: a header row, per-column alignment (`:--`, `:-:`, `--:`) and horizontal scrolling when wide; limited to 12 columns and 50 rows.
- Settings, Devices now lists where you are logged in (client, OS, approximate location, last active) with a Log out per device and Log out all known devices; revoked devices are signed out right away. Needs the api and gateway session revocation.
- Fixed components at the bottom of the window lagging and leaving a trail while resizing on Windows: the voice dock is opaque, and blur and transitions are suspended during a resize.

## 0.2.0

Calls, privacy and servers catch up with Discord.

- Invite links: `https://discordy.voics.nl/invite/<code>` opens the app (also on cold start and after sign-in) and joins the server after a confirmation.
- Calls: incoming ringing with a selectable ringtone and volume, ringback for the caller, leaving the call when the app closes, fullscreen video tiles, the call view opens from the channel list.
- Video: camera and screen share are separate streams; quality presets up to 4K for both, plus Source for the camera.
- Text chat beside voice channels (on by default, switchable per channel).
- Members: roles grouped in the member list, role editor and right-click menu with moderation and server nicknames.
- Ephemeral and P2P messages reach the other side (MLS welcome ordering, non-trickle ICE).
- Animated server icons and avatars; friends appear in the New DM picker immediately.

## 0.1.0

Initial release: Electron shell, design system, auth, servers, messaging, three delivery modes, voice, video and screen share.

- Single-source branding: the product name and identity live in `apps/desktop/brand.json`; the installer is configured by `electron-builder.config.cjs`.
- The Local connection profile now defaults to `127.0.0.1:18000` (API, gateway, `/cdn`).
- Native crypto module builds without OpenSSL or Perl.
- Slash commands, attachments, TURN support and voice engine fixes.
