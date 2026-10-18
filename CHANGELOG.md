# Changelog

## 0.1.0

Initial release: Electron shell, design system, auth, servers, messaging, three delivery modes, voice, video and screen share.

- Single-source branding: the product name and identity live in `apps/desktop/brand.json`; the installer is configured by `electron-builder.config.cjs`.
- The Local connection profile now defaults to `127.0.0.1:18000` (API, gateway, `/cdn`).
- Native crypto module builds without OpenSSL or Perl.
- Slash commands, attachments, TURN support and voice engine fixes.
