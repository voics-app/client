import { Tabs } from 'expo-router';
import { theme } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.background },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
      }}
    >
      <Tabs.Screen name="servers" options={{ title: 'Servers' }} />
      <Tabs.Screen name="dms" options={{ title: 'DMs' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
