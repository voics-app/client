import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../src/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
