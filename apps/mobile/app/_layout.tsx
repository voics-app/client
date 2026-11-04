import '../src/install';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../src/runtime';
import { watchForeground } from '../src/runtime/foreground';
import { theme } from '../src/theme';

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
      <StatusBar style="light" />
      {status === 'booting' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.muted} />
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            // Back shows the chevron only, never the previous screen's name.
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle: '',
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="dms/index" options={{ headerShown: false }} />
            <Stack.Screen name="servers/[guildId]/index" options={{ headerShown: false }} />
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
            <Stack.Screen name="you" options={{ title: 'You', animation: 'slide_from_right' }} />
          </Stack.Protected>
        </Stack>
      )}
    </>
  );
}
