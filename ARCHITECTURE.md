# Architecture

Clean Architecture inside the renderer: `domain` has no framework or IO imports (enforced by eslint), `application` holds stores, use cases and ports, `infrastructure` implements ports (HTTP, gateway, WebRTC, audio), `interface` is React. `interface/app/runtime.ts` is the composition root. `domain` and `application` use no browser globals (`window`, `document`, `localStorage`; enforced by eslint) so they can move to the shared `packages/core` for the mobile app: device-local persistence goes through the `KeyValueStorage` port (`application/ports/deviceStorage.ts`), installed by `infrastructure/storage/installBrowserStorage.ts`, which the renderer entry imports first.

```mermaid
C4Component
  title Discordy client, component view
  Container_Boundary(main, "Main process") {
    Component(shell, "Window and policies", "Electron", "CSP, navigation guards, tray, single instance, deep links")
    Component(ipc, "IPC handlers", "Electron", "Typed channels; session vault, capture, hotkeys, updater")
    Component(crypto, "Crypto host", "napi-rs", "OpenMLS, Ed25519, encrypted SQLite local store (ChaCha20-Poly1305)")
  }
  Container_Boundary(preload, "Preload") {
    Component(bridge, "window.discordy", "contextBridge", "Whitelisted API")
  }
  Container_Boundary(renderer, "Renderer") {
    Component(ui, "Interface", "React 19", "Design system, features, palette")
    Component(app, "Application", "Zustand", "Stores, session manager, privacy engines, voice controller")
    Component(infra, "Infrastructure", "TS", "REST, gateway P7, voice P8, WebRTC, audio worklets")
    Component(domain, "Domain", "pure TS", "Permissions, P11 modes, SDP synthesis, frame format")
  }
  System_Ext(api, "api / messages", "REST P9")
  System_Ext(gw, "gateway", "WebSocket P7")
  System_Ext(voice, "voice node", "WebSocket P8 + DTLS-SRTP")
  Rel(ui, app, "reads and commands")
  Rel(app, infra, "ports")
  Rel(app, domain, "uses")
  Rel(infra, api, "HTTPS")
  Rel(infra, gw, "WSS")
  Rel(infra, voice, "WSS, UDP")
  Rel(ui, bridge, "IPC")
  Rel(bridge, ipc, "invoke")
  Rel(ipc, crypto, "calls")
```

## Delivery modes

- **Standard**: REST send with optimistic message reconciled by nonce; a 409 `50160` triggers re-resolution and the private path.
- **Ephemeral**: one MLS group per channel (group id = channel id). Welcome and commit envelopes precede application messages over op 20. Incoming envelopes are decrypted, persisted in the encrypted local store, shown, then ACKed (op 21).
- **P2P**: WebRTC DataChannel; offer/answer/ICE relayed over op 22. Each side signs its DTLS fingerprint with its device identity key and verifies the peer's signature against the published identity key. Unverified peers are refused.

## Voice

The voice server sends a ~1 KB SESSION_DESCRIPTION, never SDP. The client creates a local offer, derives SELECT_PROTOCOL from it, and synthesizes the remote answer (`domain/sdp.ts`). Media E2EE (DAVE) uses an encoded-transform worker with keys from MLS exporter secrets.
