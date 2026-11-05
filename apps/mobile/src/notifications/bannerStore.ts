import { AppState } from 'react-native';
import { create } from 'zustand';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { incomingAlert } from '@discordy/core/domain/incomingAlert';
import { scopeKey } from '@discordy/core/domain/notificationSettings';
import { bannerOf, type Banner } from './bannerModel';

interface BannerState {
  banner: Banner | null;
  /** The chat on screen, so its own messages raise no banner. */
  viewing: string | null;
  setViewing(channelId: string | null): void;
  show(banner: Banner): void;
  dismiss(): void;
}

export const useBannerStore = create<BannerState>((set) => ({
  banner: null,
  viewing: null,
  setViewing: (viewing) => set({ viewing }),
  show: (banner) => set({ banner }),
  dismiss: () => set({ banner: null }),
}));

/** Raises the in-app banner for a message that just arrived, when the notification rules say it deserves one and the app is in the foreground. */
export function offerBanner(message: ChatMessage): void {
  const me = useSessionStore.getState().user;
  if (!me || AppState.currentState !== 'active') return;
  const guilds = useGuildStore.getState();
  const channel = guilds.channels[message.channel_id];
  const alert = incomingAlert({
    message,
    meId: me.id,
    channel,
    settings: useNotificationSettingsStore.getState().byScope[scopeKey(message.guild_id)],
    guildDefaultNotifications: message.guild_id ? guilds.guilds[message.guild_id]?.default_message_notifications : 0,
    myRoleIds: (message.guild_id ? guilds.members[message.guild_id]?.[me.id]?.roles : undefined) ?? [],
    onlyMentionsPref: usePrefsStore.getState().notifyOnlyMentions,
    viewingChannel: useBannerStore.getState().viewing === message.channel_id,
    doNotDisturb: useSessionStore.getState().settings.status === 'dnd',
    now: Date.now(),
  });
  if (alert) useBannerStore.getState().show(bannerOf(message, channel));
}
