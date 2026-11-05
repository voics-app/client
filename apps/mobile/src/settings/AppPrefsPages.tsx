import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import type { RoleColorMode } from '@discordy/core/domain/appearance';
import type { SpoilerDisplay } from '@discordy/core/domain/prefsTypes';
import { ChoiceRow, Hint, SectionLabel, SettingsPage, SwitchRow } from './rows';

const ROLE_COLORS: { value: RoleColorMode; label: string }[] = [
  { value: 'name', label: 'In the name' },
  { value: 'dot', label: 'As a dot' },
  { value: 'hidden', label: 'Hidden' },
];

const SPOILERS: { value: SpoilerDisplay; label: string }[] = [
  { value: 'click', label: 'On click' },
  { value: 'moderated', label: 'On servers I moderate' },
  { value: 'always', label: 'Always' },
];

/** Desktop's Accessibility page, limited to what the phone app honours: motion, role colours and links. */
export function AccessibilityPage({ highlight }: { highlight: string | null }) {
  const prefs = usePrefsStore();
  return (
    <SettingsPage highlight={highlight}>
      <SectionLabel>Motion</SectionLabel>
      <SwitchRow title="Match iPhone motion setting" description="Reduce motion whenever your iPhone asks for it. This device only." value={prefs.syncOsMotion} onChange={(v) => prefs.set('syncOsMotion', v)} />
      <SwitchRow title="Reduce motion" description="Sheets and panels appear instantly instead of sliding." value={prefs.reduceMotion} onChange={(v) => prefs.set('reduceMotion', v)} />
      <SectionLabel>Colour and contrast</SectionLabel>
      <ChoiceRow title="Role colours" description="How the top role colour of a member shows beside their name." options={ROLE_COLORS} value={prefs.roleColors} onChange={(v) => prefs.set('roleColors', v)} />
      <SwitchRow title="Always underline links" value={prefs.linkUnderline} onChange={(v) => prefs.set('linkUnderline', v)} />
      <Hint>Text follows the text size set in your iPhone's Display and Brightness settings, and VoiceOver reads every control.</Hint>
    </SettingsPage>
  );
}

/** Notifications: what raises an in-app banner. Push notifications arrive with the native build. */
export function NotificationsPage({ highlight }: { highlight: string | null }) {
  const prefs = usePrefsStore();
  return (
    <SettingsPage highlight={highlight}>
      <SwitchRow title="Only mentions" description="Banners only for mentions and direct messages, whatever a server's own setting says." value={prefs.notifyOnlyMentions} onChange={(v) => prefs.set('notifyOnlyMentions', v)} />
      <Hint>Set a server or channel to All messages, Only mentions or Nothing, or mute it, from its menu in the server list. Do not disturb in Profile silences banners. Push notifications for when the app is closed come with the native build.</Hint>
    </SettingsPage>
  );
}

/** Desktop's Chat page, limited to what the phone app shows: media, spoilers, reactions and emoticons. */
export function ChatPage({ highlight }: { highlight: string | null }) {
  const prefs = usePrefsStore();
  return (
    <SettingsPage highlight={highlight}>
      <SectionLabel>Display</SectionLabel>
      <SwitchRow title="Display images and videos" description="Show attachments inside the message instead of as files." value={prefs.inlineMedia} onChange={(v) => prefs.set('inlineMedia', v)} />
      <ChoiceRow title="Show spoiler content" description="When hidden text is revealed without a tap." options={SPOILERS} value={prefs.spoilerDisplay} onChange={(v) => prefs.set('spoilerDisplay', v)} />
      <SwitchRow title="Show reactions" description="Reaction chips under messages." value={prefs.showReactions} onChange={(v) => prefs.set('showReactions', v)} />
      <SectionLabel>Composer</SectionLabel>
      <SwitchRow title="Convert emoticons" description="Turn :) and similar into emoji as you send." value={prefs.convertEmoticons} onChange={(v) => prefs.set('convertEmoticons', v)} />
    </SettingsPage>
  );
}
