# Design — "Nightglass"

Discordy's visual world. Operate mode: the interface serves long-lived chat and voice sessions, so the brand lives in precise details (light, depth, motion), not decoration. Tokens live in `apps/desktop/src/renderer/interface/shared/theme/tokens.css`; every value below is a token there.

## Principles
1. **Ink, not black.** Dark surfaces are blue-violet tinted graphite (OKLCH hue 275), stepped in four elevations. OLED drops to true black for the backdrop and near-black panels. Light is a cool paper white, never stark.
2. **Glass is for things that float.** Command palette, menus, popovers, tooltips, toasts, the voice dock and PiP windows use frosted glass (blur 24px, saturate 140%, a 1px inner highlight, soft offset shadow). Scrolling content never blurs.
3. **One accent, used for intent.** The accent marks selection, primary actions, focus and the speaking ring. Six accents: Iris (default), Aurora, Ember, Rose, Citrine, Sky — each defined by hue/chroma and derived for every theme so contrast holds.
4. **Delivery modes have their own voice.** Standard is neutral (globe), Ephemeral E2EE is emerald (sealed lock), P2P is amber (direct link). Mode colour never collides with the accent's role.
5. **8px rhythm.** Spacing steps 4/8/12/16/24/32/48/64. Message rows sit on a 4px sub-grid for density.

## Typography
- **Inter Variable** for all UI and message text, with `cv11 ss01 ss03` (single-storey a off, open digits) and tabular numerals for counts, timestamps and badges.
- **JetBrains Mono Variable** only for code spans, code blocks, IDs, keybind captions and fingerprints/safety numbers.
- Scale (px): 11 caption · 12 meta · 13 small · 14 UI · 15 message body · 17 title · 20 section · 24 page · 30 hero. Ratio ≈1.125; fixed rem, not fluid. Headings 600–650 weight with −0.01 to −0.02em tracking.

## Depth and shape
- Radii: 6 (chips), 10 (buttons/inputs), 14 (panels/cards), 20 (dialogs), full (avatars, pills). Server icons are squircles that tighten from 18 to 14 radius when active.
- Shadows always carry offset and soft blur (`0 12px 32px -8px`), tinted from the backdrop, never pure black halos.
- Hairlines are `color-mix(fg 8%)`, never flat grey.

## Motion
- Framer Motion springs: `snappy` (520/38) for presses and toggles, `gentle` (320/32) for panels, `layout` for list reorders. CSS transitions use `cubic-bezier(0.16, 1, 0.3, 1)` at 150–220ms.
- The authored moment is the **speaking ring**: a two-layer accent halo whose scale and opacity follow the live audio level. Second: the server rail's liquid selection pill.
- `prefers-reduced-motion` and the in-app "Reduce motion" switch collapse springs to instant opacity changes; the speaking ring becomes a static outline.

## Browser surfaces
Selection uses the accent at 32% alpha; caret is accent; thin themed scrollbars; focus ring is a 2px accent ring with 2px offset on `:focus-visible` only.

## Icons
Phosphor icons, `regular` weight at 20px for UI, `fill` for active/selected states, `light` for empty-state illustrations. No emoji as icons.
