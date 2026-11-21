# Age-restricted channels

Desktop and mobile use one shared, memory-only acknowledgement policy. A channel
whose `nsfw` flag or ancestor is restricted requires Continue before its content
mounts. Continue acknowledges content for this session; it does not verify age or
grant server permissions. Missing channels, incomplete or inconsistent ancestry,
malformed flags and unknown channel types remain unavailable.

Settings → Privacy → Hide age-restricted channels saves the optional account
preference `preferences.hide_age_restricted_channels` using the existing settings
PATCH. Missing means false. This control uses confirmed account settings, never a
device preference migrated into another account. A failed or unsupported save
keeps the previous value and allows retry. Enabling Hide removes restricted
navigation entries and revokes acknowledgements; disabling it requires Continue
again. Acknowledgements also reset on logout, account/instance change and relevant
restriction or ancestry changes. A rename alone does not invalidate them.

## Boundaries

- Main text, forum and voice stages, thread/pin/search side panels and mobile
  direct routes do not mount their content before acknowledgement. Cached rows,
  embeds, attachments and native media viewers stay behind the same boundary.
- Search requests include only acknowledged/public channel IDs; late responses
  are filtered again. Mentions, foreground notifications, TTS, voice occupants
  and forward destinations apply the same current policy. Read counts keep their
  existing semantics.
- Restriction changes close the global desktop media viewer and queued speech.
  Active calls close transport/playback before asynchronous capture cleanup.
  Server-directed moves cannot bypass the gate. Standalone reaction and bot-form
  dialogs are gated; forward comments and bot-form drafts survive re-confirmation.
- Report channel works without opening content. It sends the channel ID, category
  and optional note. The API checks current VIEW_CHANNEL and supplies channel ID,
  server ID, parent ID, name, type and restricted flag, plus owner context. The
  disclosure explains this before submission. No message, topic, attachment or
  member-list fetch is required. Failed report drafts remain available for retry.
- Leave server uses the existing confirmation/API flow, with errors visible for
  retry. Owners cannot leave their own server. Back and Privacy remain available
  when the channel is hidden or metadata is incomplete.

All new gate/settings/report copy uses the central English/Dutch catalog; authored
names and notes remain unchanged. Desktop moves keyboard focus to the interstitial
heading. Native buttons retain the existing touch targets and semantic roles.

## Companion and release checks

Account preference: contracts#52 and api#151. Channel reporting: contracts#53,
api#152 and admin#35. Background APNs/FCM policy: api#153 forces the existing
`previews` field false for restricted ancestry and removes hidden-account targets;
local Continue never enables background previews. See the cross-repository
[specification](https://github.com/discordy-voics/docs/pull/192).

Focused regressions cover desktop stages and standalone dialogs; actual mobile
route wrappers for text/forum/voice, threads, pins, search and a guild ID in a DM
link; account/instance isolation, restriction round trips, malformed context,
late saves/search responses, NL error/retry, report disclosure/DTO, sidebar changes,
foreground/native notifications, TTS and immediate voice revocation.

Root owns native Windows/iOS/Android and paired API acceptance. Check direct links
and notification taps before Continue, minimum desktop viewport, keyboard/screen
reader navigation, live remote Hide, logout/login/account switching, active media,
report/leave success and retry, and generic background pushes. When integrating
scheduled-message PR358, redact scheduled body previews until Continue while
keeping the own-message list and cancellation available. This branch is based on
locale PR357; preserve the independent 352 draft/reply/notification-route behavior
and 348 public-listing report target during combined integration.
