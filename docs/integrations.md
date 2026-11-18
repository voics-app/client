# Integrations and authorized applications

This is an Operate surface within the existing Nightglass desktop interface. It extends Server Settings, User Settings and the shared dialog host. The global visual authority remains [DESIGN.md](../DESIGN.md); this document records the local structure and behavioral constraints.

## Structure and visual treatment

Server Settings → Integrations presents installed applications first and incoming webhooks second. Each row has an identity, contextual detail and a precise action; hairline separators retain the existing settings density. Application permissions expand inline. New webhook is the primary action for the webhook section, and webhook metadata editing stays inline beneath its list.

User Settings → Authorized apps is a separate list of the user's recorded consent. Developer settings continue to contain applications the user owns. These destinations must not collapse into a single application list: revoking personal consent and removing a shared server installation have different effects.

Use production Inter, Nightglass spacing and surface tokens, standard Avatar, Button, Form, Modal and UnsavedBar primitives. Page, section and identity headings follow the incumbent hierarchy. The settings body is opaque; the shared modal provides the protected-focus treatment for consent and destructive confirmation. No new palette, imagery, decorative motion or custom control system is introduced.

The shipped desktop minimum is 980×600, with 1366×768 laptop and 1440×1000 wide reference captures. The existing settings content scrolls at the minimum size; identity rows can wrap. Consent uses the standard 520-pixel modal width and must keep the server, permission review and primary action reachable. This feature does not add a native mobile settings surface.

## Consent

A supported voics:// or legacy discordy:// authorization link opens the real application identity, supported scopes, eligible server selector and permission checklist. The link parser accepts bot and optional applications.commands scopes; redirect and authorization-code parameters are unsupported.

For an absent bot, the checklist displays requested role permissions and discloses inherited everyone-role permissions. For an installed bot, it displays current effective permissions and explains that Record consent does not change the shared installation. Both require an explicit review checkbox.

The acknowledgment identifies the account, application, guild, installation revision, installed/absent action, permission bits and scopes. A refresh changing any part of this review requires acknowledgment again. POST echoes the selected guild's exact installation_revision from the authenticated GET preview; the deep link cannot supply it. Missing revision disables submission. The API requires a non-null revision, rejects stale previews with 409 and repeats the revision check in its transaction. An old client omitting the field receives 400, so client, API and contracts must be released together.

Loading, denied and load-error states are explicit. Failure retains the selected server, clears the checkbox and refetches the preview. Cancel performs no authorization. A different deep-link request remounts the consent dialog through its request key.

## Webhook editing and credentials

Name, eligible destination channel and optional avatar form a metadata-only patch. Image reading and validation failures appear next to the upload control. Unsaved edits use the shared navigation guard. Failed saves preserve the draft and expose recovery in the persistent UnsavedBar; Reset discards the draft.

Execution credentials have a separate lifecycle. Create and Regenerate URL reveal a URL once; Copy URL and Hide URL operate on component-local state. Retained metadata, query data and persistent settings must contain no execution token. Existing credentials cannot be recovered through an ordinary list or metadata edit.

Close, account/server changes and editor-selection changes dispose of the visible URL. After creation, New webhook starts a fresh blank editor and disposes of the preceding URL. It still respects the unsaved-navigation guard. Regeneration and deletion require explicit confirmation; regeneration warns that the old URL immediately stops working. Audit navigation preserves the selected webhook or bot target.

## Access and removal

Manage Server controls installed applications; Manage Webhooks controls webhooks independently. Eligible destination channels also require visibility and Manage Webhooks. Server application removal additionally requires Kick Members and sufficient role hierarchy, enforced by the API.

Revoke consent names the application and guild and explicitly says the shared bot stays installed. Remove application explains that it removes membership, managed roles and all consent records for that installation. Other guild installations and bot credentials remain unchanged.

## Verification

The integration component suite covers explicit review, current effective permissions, revision changes, missing revisions, failure/retry, personal revoke, metadata-only retry, credential disposal and a fresh draft after creation. Core tests cover supported deep links, permission masks, eligible webhook channels and the exact wire calls. See `apps/desktop/tests/unit/interface/integrations.test.tsx` and `packages/core/tests/domain/{botAuthorization,integrations}.test.ts`.

Component tests do not certify packaged Windows protocol registration or paired API/client operation. Those remain release acceptance checks; real PostgreSQL tests in the API repository own stale-preview, lifecycle and credential-race proof.
