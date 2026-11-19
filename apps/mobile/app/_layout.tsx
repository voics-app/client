// Isolated QA-only fixture. This branch is never merged into the product.
import '../src/install';
import { useState } from 'react';
import { Linking, SafeAreaView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { LinkedConnection, User } from '@discordy/core/contracts/rest';
import { ConnectionsPage } from '../src/settings/ConnectionsPage';
import { ProfileSheet } from '../src/profile/ProfileSheet';
import { getRuntime } from '../src/runtime';
import { Button } from '../src/ui/controls';

const user = { id: '101', username: 'fixture', global_name: 'Fixture User', avatar: null, bio: 'Local QA fixture' } as User;
let linked: LinkedConnection[] = [];
const api = getRuntime().api;
Object.assign(api, {
  connections: async () => linked.map((x) => ({ ...x })),
  authorizeGithubConnection: async () => ({ url: 'https://github.com/login/oauth/authorize?state=fixture' }),
  setConnectionVisibility: async (_provider: string, visible: boolean) => { linked = linked.map((x) => ({ ...x, visible })); },
  deleteConnection: async () => { linked = []; },
  userConnections: async () => linked.filter((x) => x.visible).map((x) => ({ ...x })),
  userProfile: async () => ({ user, mutual_guilds: [], mutual_friends: [] }),
});
Linking.openURL = async () => { linked = [{ provider: 'github', account_id: '123', name: 'fixture-github', visible: false }]; };
useSessionStore.setState({ status: 'ready', user });
export default function RootLayout() {
  const [profile, setProfile] = useState(false);
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0c0d12' }}><SafeAreaView style={{ flex: 1 }}>
    <Text style={{ color: 'white', padding: 12 }}>Connections QA fixture ? no network</Text>
    <View style={{ flexDirection: 'row', padding: 8 }}><Button label="Open public profile" onPress={() => setProfile(true)} /></View>
    <ConnectionsPage highlight={null} />
    <ProfileSheet user={profile ? user : null} onClose={() => setProfile(false)} />
  </SafeAreaView></GestureHandlerRootView>;
}
