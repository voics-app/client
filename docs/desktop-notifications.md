# Desktop notifications and reply controls

## Activity and alerts

Windows shows a generated taskbar overlay for unread channels or a mention count.
The tray distinguishes normal, unread and mentions and describes the counts in its
tooltip. The window title uses `(N)` for mentions (capped at `99+`) or a bullet for
unread channels without mentions. Clearing all activity clears these indicators.
macOS and Linux use Electron's badge count for mentions; their tray and title use
the same activity state.

Text channels, announcements, threads, DMs and group DMs contribute to activity.
Muted servers, parent channels/categories and individual channels do not contribute
to OS activity. Mute changes update the indicators immediately; timed mutes expire
without needing another incoming message. DND and window focus suppress alerts,
not unread history or mention counts.

Notifications follow the channel override, then its parent, then the server setting
and server default. **Nothing** suppresses alerts and new local private-mode mention
counts. **Only @mentions** includes direct mentions and roles the viewer holds;
server switches can suppress role and `@everyone`/`@here` mentions. A direct mention
still counts when role/everyone mentions are suppressed. The device's only-mentions
preference can further restrict alerts. Muting suppresses alerts at every level.

The app plays the message sound using the selected output device and volume. The
master sound switch, per-sound switch, DND, mute and current focused channel gate
it. Turning off desktop notifications alone leaves the app sound enabled. OS toasts
are silent to avoid a second sound. Clicking a toast shows/focuses the window and
opens its exact channel and message. Private-message plaintext is excluded from
the OS notification body.

## Mark read

`Escape` marks the current channel read; `Shift+Escape` marks the current server.
Settings > Keybinds can change the base shortcut; adding Shift selects the server
variant, including combinations such as `Ctrl+R` / `Ctrl+Shift+R`. Explicitly
configured combinations take precedence over that implicit variant.

The composer lets an unconsumed Escape or modifier shortcut reach mark-read.
Escape first cancels autocomplete, editing or a reply. Dialogs, menus, ordinary
settings inputs and normal text typing retain their own keyboard behavior.

## Reply ping and silent messages

Standard chats show an accessible `@ ON/OFF` button when replying to somebody else.
The last choice is remembered on this device. OFF sends
`allowed_mentions.replied_user: false`: it disables the implicit reply mention,
while explicitly selected user/role mentions still follow normal notification
rules. Own-message replies and private delivery modes do not offer this control;
the private protocols do not implement this server-side reply flag.

In Standard chats, prefix a message with `@silent ` and some content to send
`SUPPRESS_NOTIFICATIONS` (4096). The prefix is removed from the delivered content.
A bare `@silent` stays literal text. Silent messages have no notification sound,
toast, flash, mention badge or mention-inbox entry, while remaining ordinary unread
messages in the history. `/tts` retains its separate behavior.

If sending fails while the composer is still empty, it restores the text,
attachments/descriptions, reply target and selected mention tokens together. A
retry keeps the silent prefix and remembered ping choice. A newer draft or newly
selected reply is left intact instead of mixing in the failed message.

A failure that cannot restore (newer draft, new reply, edit or slash command in
progress, composer unmounted after navigating away) is not lost: Standard-mode
failures go to an in-memory failed-send queue (`failedSendQueue.ts`), keyed by
session generation, account, instance, channel and mode. The composer shows
"Restore failed message" (enabled only while the composer is empty) and
"Discard failed message". The queue is cleared on sign-out, account, device,
session or instance change and never persists to disk; Private modes are not
queued. Other surfaces that need the same retention (for example the age-gate
composer recovery) reuse this module rather than keeping their own copy.

## Acceptance

Automated regression coverage lives in desktop `activityReporting`,
`markReadShortcuts`, `silentNotifications`, `Composer` and `attention` tests; core
`privateMentionPolicy`, `notificationPolicy`, `incomingAlert`, `dispatchRouter`
and private sender tests cover the shared rules and wire fields.

Real Windows acceptance requires the native client and a second account:

1. Send an ordinary unread message, a direct mention and a viewer-role mention in
   text/announcement/thread/DM chats. Check overlay, tray tooltip and title; mark
   everything read and verify each clears. Exercise more than 99 mentions.
2. Mute/unmute a channel, its parent and its server. Check immediate OS changes and
   timed expiry with no new traffic. Exercise All, Only @mentions and Nothing,
   role/everyone suppression and an explicit channel override.
3. With another channel active or the app unfocused, check app sound at changed
   volume/output, desktop notifications off, both sound switches, DND and focused
   active-channel suppression. DND must not discard unread/mention state.
4. Click a notification from a hidden/minimized window and confirm focus plus the
   exact message jump. Confirm private text never appears in the OS toast.
5. Use Escape and Shift+Escape from the composer, then rebound modifier shortcuts.
   First Escape must cancel a reply/autocomplete/edit without marking read; an
   open dialog or settings field must retain its Escape behavior.
6. Reply with ping ON/OFF, include a separate explicit mention, send `@silent`,
   simulate a failed send and retry. Verify stored flags/allowed mentions, received
   pings, ordinary unread history and no silent alert. Verify a newer draft stays
   intact after a late failure and private chats expose no ineffective ping toggle.

The native checks are distinct from unit-test evidence. Versioned Standard read
state reconciliation belongs to its gateway rollout; integration must retain its
authority guard while private-mode counts keep the local notification-level gate.
