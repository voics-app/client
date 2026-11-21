import Constants from 'expo-constants';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { Alert } from 'react-native';
import { BRAND } from '../../brand';
import { openChat } from '../../navigation/openChat';
import { openEvent } from '../../events/openEvent';
import { openMessage } from '../../navigation/openMessage';
import { getRuntime } from '../../runtime';
import { useBannerStore } from '../bannerStore';
import { loadNativePush } from './nativePush';
import { PushController } from './PushController';
import { environmentOf, type PushTarget } from './pushModel';
import { usePushPrefs, usePushStatus } from './pushStore';

let current: PushController | null = null;

/** A tapped notification opens its chat, and scrolls to the message when the payload names one. */
export function openTarget(target: PushTarget): void {
  if (target.kind === 'scheduled_event') {
    openEvent(target.guildId, target.eventId);
    return;
  }
  const { guildId, channelId, messageId } = target;
  if (messageId) openMessage({ guildId, channelId, messageId });
  else openChat({ guildId, channelId });
}

/** Explains what the permission is for before iOS asks, so the one system prompt is not wasted on a surprise. */
function explainPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Turn on notifications?',
      `Get a notification when someone messages or mentions you while ${BRAND.displayName} is closed. You can change this any time in Settings.`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Turn on', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** The app's one push controller; off (every call does nothing) in Expo Go and wherever the native module does not exist. */
export function getPush(): PushController {
  current ??= new PushController({
    native: loadNativePush(),
    api: { registerPushToken: (body) => getRuntime().api.registerPushToken(body) },
    prefs: {
      offered: () => usePushPrefs.getState().offered,
      previews: () => usePushPrefs.getState().previews,
      onlyMentions: () => usePrefsStore.getState().notifyOnlyMentions,
      markOffered: () => usePushPrefs.getState().markOffered(),
    },
    setStatus: (status) => usePushStatus.getState().setStatus(status),
    environment: environmentOf(Constants.expoConfig?.extra?.pushEnvironment),
    gatewayState: () => getRuntime().gateway.state,
    viewing: () => useBannerStore.getState().viewing,
    open: openTarget,
    offer: explainPermission,
  });
  return current;
}
