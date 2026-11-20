import '../src/install';
import { appliedAppearance } from '../src/appearance/boot';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFavouriteFriendsStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../src/runtime';
import { watchForeground } from '../src/runtime/foreground';
import { stackScreenOptions } from '../src/navigation/stackOptions';
import { theme } from '../src/theme';
import { InAppBanner } from '../src/notifications/InAppBanner';
import { PushNotifications } from '../src/notifications/push/PushNotifications';
import { InteractionModal } from '../src/commands/InteractionModal';
import { InviteLinkSheet } from '../src/invites/InviteLinkSheet';
import { WideShell } from '../src/shell/WideShell';
import { useWideLayout } from '../src/shell/layoutModel';
import { CallKitHost } from '../src/voice/callkit/CallKitHost';
import { useFriendInviteStore } from '../src/friends/friendInviteStore';
import { IncomingCall } from '../src/voice/IncomingCall';

/** A deep link to a chat opens with the main screen (rail and column) underneath, so back and the edge swipe have somewhere to go. */
export const unstable_settings = { anchor: 'index' };

const chat = { animation: 'slide_from_right', gestureEnabled: true } as const;
const pushed = { animation: 'slide_from_right' } as const;

export default function RootLayout() {
  const status = useSessionStore((s) => s.status);
  const wide = useWideLayout();
  const friendToken = useFriendInviteStore((s) => s.token);

  useEffect(() => {
    const { session, gateway } = getRuntime();
    void session.boot();
    return watchForeground(AppState, gateway);
  }, []);

  useEffect(() => {
    if (status !== 'ready') { useFavouriteFriendsStore.getState().set([]); return; }
    let active = true;
    const initial = useFavouriteFriendsStore.getState().ids;
    void Promise.resolve().then(() => getRuntime().api.favouriteFriends()).then((ids) => {
      if (active && useFavouriteFriendsStore.getState().ids === initial) useFavouriteFriendsStore.getState().set(ids);
    }).catch(() => {});
    return () => { active = false; };
  }, [status]);

  useEffect(() => {
    if (status !== 'ready' || !friendToken) return;
    useFriendInviteStore.getState().set(null);
    void getRuntime().api.useFriendInvite(friendToken).then(
      () => Alert.alert('Friend request sent'),
      () => Alert.alert('Could not send friend request', 'The link may have expired or been revoked.'),
    );
    router.replace('/');
  }, [status, friendToken]);

  const signedIn = status === 'connecting' || status === 'ready';
  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
      <StatusBar style={appliedAppearance().theme === 'light' ? 'dark' : 'light'} />
      {status === 'booting' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.muted} />
        </View>
      ) : (
        <Shell wide={wide && signedIn}>
          <Stack screenOptions={stackScreenOptions}>
            {/* Reachable from an email link whether or not someone is signed in. */}
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
            <Stack.Screen name="verify-email" options={{ headerShown: false }} />
            <Stack.Screen name="friend-invite/[token]" options={{ title: 'Friend invite' }} />
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="dms/index" options={{ headerShown: false }} />
              <Stack.Screen name="servers/[guildId]/index" options={{ headerShown: false }} />
              <Stack.Screen name="dms/new" options={{ title: 'New message', ...pushed }} />
              <Stack.Screen name="pins/[channelId]" options={{ title: 'Pinned messages', ...pushed }} />
              <Stack.Screen name="threads/[channelId]" options={{ title: 'Threads', ...pushed }} />
              <Stack.Screen name="search/[channelId]" options={{ title: 'Search', ...pushed }} />
              <Stack.Screen name="groups/[channelId]" options={{ title: 'Group settings', ...pushed }} />
              <Stack.Screen name="discover" options={{ title: 'Discover', ...pushed }} />
              <Stack.Screen name="friends" options={{ title: 'Friends', ...pushed }} />
              <Stack.Screen name="dms/[channelId]" options={chat} />
              <Stack.Screen name="servers/[guildId]/[channelId]" options={chat} />
              <Stack.Screen name="servers/[guildId]/members" options={{ title: 'Members', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/index" options={{ title: 'Server settings', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/overview" options={{ title: 'Overview', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/roles/index" options={{ title: 'Roles', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/roles/[roleId]" options={{ title: 'Role', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/members" options={{ title: 'Members', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/invites" options={{ title: 'Invites', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/channels" options={{ title: 'Channels', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/emoji" options={{ title: 'Emoji', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/bans" options={{ title: 'Bans', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/audit" options={{ title: 'Audit log', ...pushed }} />
              <Stack.Screen name="servers/[guildId]/settings/channel/[channelId]" options={{ title: 'Channel', ...pushed }} />
              <Stack.Screen name="notifications" options={{ title: 'Notifications', animation: 'slide_from_right' }} />
              <Stack.Screen name="settings/index" options={{ title: 'Settings', ...pushed }} />
              <Stack.Screen name="settings/[page]" options={{ title: 'Settings', ...pushed }} />
              <Stack.Screen name="voice/[channelId]" options={{ title: 'Voice', animation: 'slide_from_bottom' }} />
            </Stack.Protected>
          </Stack>
        </Shell>
      )}
      {signedIn && <IncomingCall />}
      <PushNotifications />
      <CallKitHost />
      {signedIn && <InAppBanner />}
      {signedIn && <InviteLinkSheet />}
      {signedIn && <InteractionModal />}
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/** Beside the chat on a tablet the rail and channel list stay on screen; on a phone every screen takes the whole window. */
function Shell({ wide, children }: { wide: boolean; children: ReactNode }) {
  return wide ? <WideShell>{children}</WideShell> : <>{children}</>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: theme.background } });
