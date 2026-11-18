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

Run `node scripts/audit-localization.mjs` for a review inventory, or append `--json`
for source locations and text. This reports candidates, including examples and
technical labels; it is not a coverage percentage. Dynamic/domain/native copy also
needs review. The ongoing extraction covers language settings, account navigation,
account/security preferences, friends, chat composition, message timestamps,
search, mentions, notification rules and pins. Remaining account tools, profiles,
server/admin forms and native surfaces are being extracted before the feature is
declared complete. Mobile uses the shared catalog helpers but does not yet have a
localized navigation/provider.

Acceptance includes account persistence after a fresh login, save failure/retry,
cross-device updates, Dutch plural/number/date output, unchanged authored messages,
keyboard/screen-reader labels, a minimum-size desktop check, and a forced-RTL
layout stress check. Unit tests do not establish visual or native acceptance.
