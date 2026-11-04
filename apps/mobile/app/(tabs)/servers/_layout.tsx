import { Stack } from 'expo-router';
import { theme } from '../../../src/theme';

export default function ServersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Servers' }} />
      <Stack.Screen name="[guildId]" options={{ title: '' }} />
    </Stack>
  );
}
