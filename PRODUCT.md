# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the owner's brief and the platform spec (`docs/specs/2026-10-16-voics-platform-design.md`); no interview was possible in the agent run. Inferred facts are marked *(inferred)*.

## Platform

web

(Electron desktop app rendering a React web UI; Windows primary, macOS and Linux secondary.)

## Users
People who already live in Discord-style communities: friends' servers, gaming groups, small teams. They keep the app open all day beside other work, glance at unread state, drop into voice, and share screens. *(inferred)* A meaningful subset cares about privacy and wants some chats to never touch a server in plaintext.

## Product Purpose
Discordy is a Discord-equivalent chat, voice, video and screen-share platform without payments. Success: a Discord user switches and finds every habit intact (servers, channels, threads, DMs, voice) while the app feels calmer and more beautiful than Discord.

## Positioning
Three delivery modes per chat: **Standard** (server-stored), **Ephemeral E2EE** (MLS, relay-only, deleted on ACK) and **P2P** (WebRTC DataChannel, zero server persistence). The active mode is always visible in the composer.

## Operating Context
- Always-on desktop window, often on a second monitor; dark rooms at night (OLED theme) and bright offices (light theme).
- Keyboard-heavy power users: Ctrl+K command palette, push-to-talk global hotkey.
- Voice sessions run for hours; the UI must stay legible and quiet while people talk.

## Capabilities and Constraints
- Feature parity with Discord minus payments; no DRM capture (Watch Together instead); no full-text search in v1.
- Gateway protocol P7, voice protocol P8, REST P9 are pinned by the master plan.
- Unsigned installers initially.

## Brand Commitments
- Product name **Discordy**. Typefaces pinned by the owner: **Inter** and **JetBrains Mono**. Dark, OLED and light themes with an accent picker. Refined glass surfaces. 8px rhythm. Spring motion honouring reduced-motion.

## Evidence on Hand
No logos, screenshots, testimonials or user data exist yet. Do not fabricate them.

## Product Principles
1. Familiar first: a Discord user never has to relearn a habit.
2. Privacy is legible: the delivery mode is never hidden or ambiguous.
3. Calm under load: hundreds of unread channels and a busy voice call still read clearly.
4. Keyboard parity: every primary action reachable from the palette.

## Accessibility & Inclusion
WCAG 2.2 AA contrast in all three themes; full keyboard navigation with visible focus; `prefers-reduced-motion` and an in-app reduced-motion switch.
