# Attachment metadata editing

The desktop message context menu and mobile long-press action sheet offer **Edit Attachments**
for the author's sent messages with attachments in Standard chats. The UI uses existing dialog,
sheet, field, button and theme primitives. The native sheet scrolls and follows the existing
keyboard/safe-area behavior; native device verification is a separate QA step below.

The shared `attachmentMetadataEdits` model compares against the snapshot when the editor opened.
It trims descriptions, counts Unicode code points (matching the service's character limit), sends
`description: null` for a cleared description, and emits `flags: 8` or `flags: 0` only when the
spoiler setting changed. Untouched fields and attachments are omitted, preventing unrelated edits
on another device from being written back. The service preserves other flag bits and checks
authorization, message ownership and attachment IDs. Filename, content type, URL and file bytes
are immutable through this operation. There is no attachment removal/replacement in this editor.

`editAttachments` rechecks the active author and standard delivery before the request. It patches
the timeline's attachments and edit timestamp only after the server responds, preserving newer
message text. Failure retains the draft and shows an inline error; duplicate submits and dismissal
during a pending request are disabled. Reopening a cancelled mobile editor starts a fresh draft.

Explicit response flags override the legacy `SPOILER_` filename convention. A response with
`flags: 0` is visible even if that prefix remains. Only payloads omitting flags fall back to the
filename. Both platforms conceal ordinary files and audio as well as media tiles; media viewers
exclude other concealed spoilers. Spoilers are a display choice, not an access-control boundary.

Dependencies: [contracts#38](https://github.com/voics-app/contracts/pull/38) and
[messages#79](https://github.com/voics-app/messages/pull/79), paired with
[messages#60](https://github.com/voics-app/messages/issues/60). Client issue #60 concerns
role management and is unrelated.

## Regression commands

```powershell
pnpm --filter @discordy/core test
pnpm --filter @discordy/desktop exec vitest run tests/unit/interface/AttachmentMetadataDialog.test.tsx tests/unit/interface/mediaView.test.tsx --maxWorkers=1
pnpm --filter @discordy/mobile exec jest tests/messages/AttachmentMetadataSheet.test.tsx tests/messages/attachments/AttachmentList.test.tsx tests/messages/messageAccess.test.ts tests/messages/ChannelScreen.test.tsx --runInBand
pnpm lint
pnpm typecheck
pnpm --filter @discordy/desktop build
```

Coverage includes author/standard eligibility, the actual HTTP PATCH shape, clearing descriptions,
preserving immutable names and unrelated metadata/content, Unicode limits, failed save/retry,
cancel/reopen, explicit zero flags, file concealment and concealed-media exclusion from viewers.

## Device QA

Use an isolated test account and Standard chat with an image, audio file and document. On desktop,
right-click the author's message; on iOS and Android, long-press it. Change a description, clear
another and toggle spoilers. Confirm Save updates the message, reload retains the changes, a
second client receives the update, and each concealed attachment requires revealing. Opening a
visible image must not reveal the other hidden image. Check a legacy `SPOILER_` filename can be
made visible without renaming it.

Cancel and reopen: no draft should persist. Disconnect before Save: the error must retain the draft
for retry. With several attachments and the keyboard open, check scrolling, Save/Cancel access,
large text, screen-reader labels and back/escape behavior on each native platform. The desktop
component has been inspected in an isolated browser at 1,280×900 and 390×844 with a synthetic
response stub. React Native component tests pass using mocks; this does not establish native
keyboard/gesture behavior or a live gateway round trip.
