# Native chat input checks

The mobile chat uses keyboard-controller 1.23.1 with React Native 0.88.1. A native
rebuild and reinstall are required for this dependency update. Reloading Metro or
using Expo Go does not update the native library.

## Why the layout changed

The old inverted chat combined a translated native scroll container, measured
composer padding and an absolutely positioned sticky composer. On Android Fabric,
the library before 1.23.1 could move a row without updating the position used by
React Native's press handlers. A small MOVE could cancel a stationary long press,
avatar tap or inline link. The upstream correction is
[keyboard-controller#1759](https://github.com/kirillzyusko/react-native-keyboard-controller/pull/1759).

Repeated keyboard and composer-height changes also exposed inconsistent list
insets. The composer now participates in normal layout with the list. One
keyboard-controller `KeyboardAvoidingView` owns keyboard avoidance; the list no
longer adds a second simulated composer inset. Its automatic native offset and
negative bottom safe-area offset account for the dock's existing safe-area padding.

Incoming messages preserve the visible native row. Scrolling near the latest edge
allows new arrivals to follow it; reading farther back keeps that position. The
jump button belongs to the composer, so its relative bottom position stays on screen.

## Repeat the Android keyboard regression

Use the existing disposable emulator and QA app `nl.voics.app.qa`, connected to a
local QA backend. Open a writable chat, scroll to its newest message, and identify
a unique visible text or link label in that message. Start with an expendable draft:
the script replaces it and leaves `Short QA`. It does not send the draft.

From `apps/mobile`, with `adb` on PATH (or its full path in environment variable `ADB`):

```sh
node scripts/android-keyboard-smoke.mjs emulator-5554 "Unique latest message label" output/keyboard-check
```

The script refuses a non-emulator serial or a different foreground app. It uses
native touch events including MOVE, expands and shrinks the composer, opens and
closes the keyboard twice, and checks the last label against the input bounds after
every step. It saves `results.json`, the UI hierarchy and a final screenshot.
This regression failed against the previous floating/inset arrangement and passed
all nine observations with the final layout in root QA.

Also check a chat with at least three screens of history:

1. Scroll back and verify **Jump to latest** is visible above the input.
2. Send a new message from a second local QA account. The row being read must stay
   in place; root's captured regression moved 236 physical pixels before the fix
   and zero after it.
3. Tap **Jump to latest** and confirm the new message is fully above the composer.
4. Hold a message with a small movement, tap its avatar, reveal a spoiler and tap
   an inline mention/link. Check the expected actions and cancel any external link.
5. Scroll vertically without opening actions, then swipe left to reply and cancel.

Root ran these native checks on the installed Android QA build with production
JavaScript served by Metro. Component tests use keyboard/gesture mocks and do not
prove native geometry. Physical iPhone keyboard dragging, safe-area transitions,
rotation and VoiceOver remain separate acceptance checks; an unsigned iOS simulator
build does not establish those results.
