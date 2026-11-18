# Client localization

Settings → Language saves English (`en-US`) or Nederlands (`nl`) through the existing
account settings API. The app changes language only after a successful response.
Failure retains the selection and shows a retryable error; Reset discards the draft.
The regular unsaved-settings guard also covers this page. READY and
`USER_SETTINGS_UPDATE` supply the saved preference on login and other devices.

`LocaleProvider` subscribes to the account setting. A missing preference uses the
first supported system language. Unsupported or malformed explicit preferences
fall back to English. Regional English/Dutch tags retain their date/number
conventions while using their base language's catalog. The document's `lang` and
`dir` change with the provider. Both shipped languages are left-to-right.

`packages/core/src/domain/locales/en.ts` is the canonical ICU MessageFormat catalog;
`nl.ts` has compile-time key parity. `createI18n` supplies `t`, number, date, relative
time and list formatters. FormatJS parses ICU plural/select expressions and delegates
formatting to Intl. Missing or invalid translations fall back to English. Tests
compile every message and compare interpolation arguments. Formatting produces text,
never HTML. `catalogText` adapts trusted product-copy constants such as the settings
search index; never pass names, messages, descriptions or other authored content to it.

React surfaces use `useI18n`. Keep complete sentences and plural rules in a catalog,
pass values as arguments, and leave protocol identifiers, usernames, message text,
URLs and user-supplied labels unchanged. Timestamp markup renders in the viewer's
locale. Markdown text uses `dir="auto"` for mixed-direction authored content.
Setting rows use a canonical `searchKey`, so translated search labels and English
aliases reach the same row before and after a language change.

The renderer reports its resolved account locale to the main process using the
validated `app:locale` IPC. Main retains no separate preference. Tray actions,
unread/mention summaries, window titles, spellcheck menus and the local browser
passkey handoff share the catalog. Changing language reapplies the last attention
counts; it does not change unread accounting or notification policy. Pop-out windows
inherit the current `lang`/`dir` and track later changes.

## Coverage inventory

| Surface | Coverage and preserved data |
|---|---|
| Navigation and settings search | User/server tabs, palette and canonical row targets; translated labels and English aliases reach the same setting. User tab labels require a typed catalog entry. |
| Account and preferences | Account/security, passwords, MFA/passkeys, sessions/devices, privacy, voice, keybinds, appearance, accessibility, notifications, chat, connection, desktop, advanced, developer apps/commands and updates. Credential values, hardware names, URLs and release notes remain original. |
| Profiles | Global/server editor, live preview, save/reset/error/retry, image errors, nickname permission and global fallback. Names, bio and pronouns remain original, with automatic text direction. |
| Server administration | Overview, community/discovery, vanity, audit policy/logs, members, invites, bans, emoji, templates, roles and channel permissions. Permission bits and resource IDs stay unchanged. |
| Integrations | Bot permission review/consent, authorized apps, installed applications and webhooks. Installation revision binding, draft guard and one-time execution URL lifetime are unchanged. |
| Authentication and dialogs | Sign-in/registration, recovery, connection selection, create/join/invite, template preview, new DMs, folders, custom status, shortcut help and confirmations. |
| Chat and members | Composer, replies, silent sends, formatting, uploads, private attachment errors, markdown timestamps, system messages, emoji/reactions, pins, threads/forums, search, media, forwards, friends, member lists, moderation and report consent. Authored text, slash command names, emoji names and search DSL tokens stay original. |
| Voice and calls | Incoming calls, device menus, voice dock/stage, participants, screen picker, connection statistics, watch controls and call confirmations. OS device/source names remain original. |
| Native desktop | Tray, title/overlay descriptions, editing/spellcheck menus, local browser passkey handoff and pop-out language. OS-owned permission prompts and dictionary suggestions use the OS/device language. |

Known built-in template names/descriptions are product copy. Shared/user templates
and all snapshot role/channel names remain original, so the preview shows the
structure that will actually be created. System messages translate complete ICU
sentences with typed identity/link slots; authored names never become markup.

Run `node scripts/audit-localization.mjs` for review candidates, or append `--json`
for source locations and text. The remaining candidates were reviewed as:

- Trusted constants translated at consumption (settings metadata, permission
  labels, auth headings, transfer states, device labels, keybind groups).
- Protocol values, technical key names, connection examples, product/theme names,
  CSS expressions and search aliases that must remain stable.
- Developer-only `#/__gallery` examples, outside the account application flow.
- Unknown server/OS diagnostics, which retain their original detail after the
  translated product error. The client does not guess translations of arbitrary
  external strings. Known client errors use catalog entries.

Mobile still uses English navigation and has no locale provider/picker. Its shared
domain helpers retain English defaults; this change does not claim mobile
localization. External website passkey pages and OS-owned dialogs are separate
surfaces. Both selectable desktop languages are LTR; a forced RTL layout test is a
stress check, not an offered Arabic/Hebrew catalog.

## Validation and acceptance

Domain tests compile every ICU message, compare catalog argument parity, exercise
English fallback and regional Intl formatting, and protect authored text/IDs.
Interaction regressions exercise actual Dutch account/profile/server/report/auth,
device, consent and webhook controls, including failure, retry and switching the
language with a draft present. Native tests preserve action IDs, last unread
counts, permission revisions and passkey ceremony origin/nonce boundaries.

`pnpm --filter @discordy/desktop exec playwright test --config
playwright.localization.config.ts` runs the local-only headless layout regression.
It serves actual settings/profile components, real fonts and the HTTP client with
a synthetic loopback settings endpoint. External requests are blocked. It verifies
the locale PATCH and failure/retry, `lang`, accessible controls, no horizontal
overflow at 940×600, unchanged mixed-direction authored text and forced RTL.
Screenshots/traces go under `apps/desktop/output/playwright/` (ignored).

Before release, the coordinator independently verifies the packaged Windows app:

1. Save Nederlands, restart/sign in again, and confirm the account locale returns
   through READY. Apply a second-device preference update and confirm the open
   client reacts without changing draft text.
2. Confirm translated native tray/context menus, Windows attention descriptions
   and voice pop-outs after switching language; exercise notification clicks.
3. Inspect language/profile/account/server/integration flows at 940×600 and a
   normal laptop size, with keyboard focus and screen-reader names.

Local unit, browser and bundle checks are recorded in the PR. They do not claim
packaged Windows, real backend, cross-device or release acceptance.
