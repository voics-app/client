import '../src/install';
import { appliedAppearance } from '../src/appearance/boot';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../src/runtime';
import { watchForeground } from '../src/runtime/foreground';
import { stackScreenOptions } from '../src/navigation/stackOptions';
import { theme } from '../src/theme';
import { InAppBanner } from '../src/notifications/InAppBanner';
import { IncomingCall } from '../src/voice/IncomingCall';

/** A deep link to a chat opens with the main screen (rail and column) underneath, so back and the edge swipe have somewhere to go. */
export const unstable_settings = { anchor: 'index' };

const chat = { animation: 'slide_from_right', gestureEnabled: true } as const;
const pushed = { animation: 'slide_from_right' } as const;

export default function RootLayout() {
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    const { session, gateway } = getRuntime();
    void session.boot();
    return watchForeground(AppState, gateway);
  }, []);

  const signedIn = status === 'connecting' || status === 'ready';
  return (
    <>
      <StatusBar style={appliedAppearance().theme === 'light' ? 'dark' : 'light'} />
      {status === 'booting' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.muted} />
        </View>
      ) : (
        <Stack screenOptions={stackScreenOptions}>
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
            <Stack.Screen name="notifications" options={{ title: 'Notifications', animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/index" options={{ title: 'Settings', ...pushed }} />
            <Stack.Screen name="settings/[page]" options={{ title: 'Settings', ...pushed }} />
            <Stack.Screen name="voice/[channelId]" options={{ title: 'Voice', animation: 'slide_from_bottom' }} />
          </Stack.Protected>
        </Stack>
      )}
      {signedIn && <IncomingCall />}
      {signedIn && <InAppBanner />}
    </>
  );
}
