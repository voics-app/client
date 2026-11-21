# Desktop passkeys

Passkeys are a second factor: enter your password, then choose **Use passkey**. My account lists keys and supports adding, renaming and removing them. The first MFA enrollment shows recovery codes once. Save them outside the app; existing codes remain valid when adding another factor. Removal requires the password and an authenticator or backup code. Removing the last factor turns MFA off. A server removal does not delete the device's credential.

## Origin and configuration

The Electron `file://` renderer does not perform WebAuthn. A temporary loopback page opens the configured HTTPS website in the system browser. That page invokes the real `navigator.credentials.create/get`, so the signed `clientDataJSON` has the API's exact configured origin. Availability of Windows Hello, Touch ID, security keys and cross-device passkeys depends on the browser/OS. Authenticator and backup-code sign-in remain available.

Configure these desktop environment variables together:

| Variable | Value |
| --- | --- |
| `DISCORDY_PASSKEY_ORIGIN` | Exact HTTPS origin serving website `/passkeys/index.html`; no path/query/fragment/userinfo |
| `DISCORDY_PASSKEY_RP_ID` | API's exact `WEBAUTHN_RP_ID` |
| `DISCORDY_PASSKEY_API_URL` | API base URL for the current connection, binding this ceremony configuration to that server |

The API must have matching `WEBAUTHN_RP_ORIGIN` and `WEBAUTHN_RP_ID`. Configuration is intentionally explicit; an unset or mismatched site disables the add/use buttons with recovery guidance. It does not prevent listing, renaming or removing existing keys. Only the named local profile permits an HTTP `localhost` RP origin; arbitrary HTTP, `file:`, `null` and custom schemes are rejected. Changing connections cancels outstanding work.

The website origin is a security boundary. Serve the dedicated ceremony page without third-party scripts or analytics, with the CSP/COOP headers described in the website README. It must retain its cross-origin opener; a `same-origin` COOP header breaks the handshake safely. Do not grant the page Electron preload APIs.

## Handoff boundary

- Main accepts IPC only from the trusted window's main frame, validates the configured RP against the requested options, and permits one ceremony at a time.
- Its listener binds `127.0.0.1` on a random port. The URL has no credentials, challenge, query or fragment. Password, MFA ticket and session tokens stay in the app. The browser sees only public options and a fresh handoff nonce.
- The local parent sends to the exact HTTPS origin. Both pages validate `event.source`; responses require the original random nonce. The remote page accepts only its opener at a literal `http://127.0.0.1:<port>` origin. Messages use exact target origins, including the initial hello/ready handshake.
- Only a JSON POST with the exact local Host, Origin and nonce header can finish. There is no CORS allowance or remote-to-loopback fetch. The HTTPS page uses `postMessage`, and the loopback page posts to itself, avoiding a private-network fetch from the public website.
- Main checks signed client-data type, challenge and exact origin before returning the credential. The API remains authoritative: it verifies signature, RP, user verification, expiry, ownership, single-use challenge/ticket and counter.
- Cancel, denial, tab closure, app closure and timeout terminate or reject the request. No session is adopted until API verification succeeds. A failed request starts a new challenge when retried. The listener has a four-minute lifetime, bounded request bodies and HTTP timeouts.

## Repeatable browser acceptance

`apps/desktop/tests/browser/passkeys.spec.ts` uses headless Chrome's **real WebAuthn implementation** with a CDP CTAP2 virtual authenticator. It does not replace `navigator.credentials` or fabricate credential responses. The API's optional `http_passkey_browser` integration test starts a disposable PostgreSQL container, generates ephemeral test signing keys and a test account, exposes the real API router on loopback, and invokes this suite. No live account or shared database is used.

1. Install this client workspace and build the website checkout (`node scripts/build.mjs`). Install Chrome and Docker.
2. Create a short-lived local TLS key/certificate for `localhost` under your QA artifact directory, for example with OpenSSL `req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost -addext subjectAltName=DNS:localhost`. Supply explicit `-keyout` and `-out` paths. The QA browser accepts this test certificate; application code never bypasses certificate checks.
3. Set `PASSKEY_BROWSER_CLIENT` to the client checkout, `PASSKEY_BROWSER_SITE` to the website checkout, `PASSKEY_BROWSER_ARTIFACTS` to an isolated output directory, and `PASSKEY_BROWSER_TLS_KEY` / `PASSKEY_BROWSER_TLS_CERT` to those files. Port 8443 must be available for the HTTPS fixture. Use a dedicated `CARGO_TARGET_DIR` for the API worktree.
4. In the API checkout run `cargo test -p infrastructure --test http_passkey_browser -- --ignored --nocapture`.

The harness passes API origin and ephemeral access token through child-process environment variables, never URLs or logs. Keep browser traces/network-body logging disabled: they could capture test recovery material. The suite verifies registration, MFA status, signed sign-in, replay denial, cancellation then backup-code recovery, rename/remove, and no auth secrets in browser request URLs. It also rejects a result from a same-origin impostor tab or a wrong nonce. Website fixtures use the intended CSP and COOP headers. Screenshot output is the pre-credential enrollment page.

Run ordinary coverage with `pnpm --filter @discordy/core test`, `pnpm --filter @discordy/desktop test` and website `npm test`. The browser suite is separate because it needs the paired API/website checkouts and Docker.

## Acceptance limits

The automated browser evidence proves the HTTPS origin and cryptographic verifier round-trip on Chromium, not physical Windows Hello/Touch ID/security-key availability. Physical Windows/macOS/Linux browser acceptance remains necessary before declaring every OS supported. Direct Electron `file://` WebAuthn is deliberately unused. This increment adds no iOS/Android native passkey bridge; mobile retains its existing authenticator/backup-code flow. Publishing the ceremony page and configuring an installation are separate operator actions; this code change does not deploy them.
