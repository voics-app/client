import '../src/install';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { getRuntime } from '../src/runtime';
import { watchForeground } from '../src/runtime/foreground';
import { theme } from '../src/theme';

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
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
        </Stack>
      )}
    </>
  );
}
