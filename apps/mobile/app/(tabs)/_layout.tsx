import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { theme } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName, focusedName: IconName) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => <Ionicons name={focused ? focusedName : name} size={size} color={typeof color === 'string' ? color : undefined} />;

/** Servers and DMs hold their own stack (with its own header and back arrow), so their tab hides the tab header to avoid two stacked bars. The tab bar itself is left to react-navigation, which pads it by the bottom safe-area inset. */
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
      <Tabs.Screen name="servers" options={{ title: 'Servers', headerShown: false, tabBarIcon: icon('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="dms" options={{ title: 'DMs', headerShown: false, tabBarIcon: icon('mail-outline', 'mail') }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications', tabBarIcon: icon('notifications-outline', 'notifications') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
