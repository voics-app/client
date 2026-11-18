# Scheduled messages in the composer

This extends the existing Nightglass chat composer and its dialogs/sheets in Operate mode. The task is to schedule a Standard text message for a clearly identified local time, then inspect, edit or cancel the author's schedules for the current channel. Existing typography, tokens, form controls, icons, focus behavior and native safe areas remain the visual authority.

Desktop uses the composer's action menu for Send later and a scheduled-message list. Mobile uses the composer action sheet and a long-press Send action; the existing native sheet owns scrolling, keyboard clearance and dismissal. Date/time fields name their format and show the local IANA timezone plus the resulting offset and date. No new native dependency is required.

The first view groups the message preview, date/time choice and explicit scheduling action. The channel list places active schedules first, shows the server's status and exact scheduled time, and offers Edit/Cancel only while pending. Destructive cancellation requires confirmation. Failures preserve form edits. A stale edit refreshes the resource and asks the author to review the newer version before submitting another mutation.

The shared create journal saves the lowercase UUIDv4 request ID and exact original body before POST, scoped to API instance, author and channel. A lost/unavailable response keeps that request across dismissal or restart; Retry confirmation reuses it. A definite rejection permits correction. A chat that has become private resolves a previous request with exact GET only. Composer text is cleared only after acknowledgment and only if the original source draft still matches.

Views refresh on entry, foreground and every 15 seconds while visible. Resource revisions cannot decrease; an old response cannot restore cleared terminal content. Empty filtered pages retain and follow their cursor. The server keeps terminal list records for seven days.

Delivery could not be confirmed is an explicit state with an Inspect channel action. Its chosen message ID is not evidence of delivery and there is no automatic resend. Sent means the server stored the message, not that every recipient device received it. Attachments, forwarding, embeds, components, application commands and non-Standard drafts are not scheduled or silently discarded.

Wire authority: contracts #50 (`0de0e52c7cce04aad1b7f5a3e46677bcbb15848f`), docs #182 / ADR 0028 and the scheduled-message specification. Backend, client and native/runtime acceptance are separate gates; source or component fixtures are not evidence of deployed scheduling.
