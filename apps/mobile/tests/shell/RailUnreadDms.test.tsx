import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { openChat } from '../../src/navigation/openChat';
import { ServerRail } from '../../src/shell/ServerRail';

jest.mock('../../src/navigation/openChat', () => ({ openChat: jest.fn() }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const bob = { id: 'u2', username: 'bob', global_name: null, avatar: null };
const dm = { id: '100', type: ChannelType.DM, last_message_id: '200', recipients: [bob] } as unknown as Channel;

const rail = (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <ServerRail />
  </SafeAreaProvider>
);

describe('ServerRail unread conversations', () => {
  beforeEach(() => {
    useGuildStore.setState({ channels: { [dm.id]: dm }, rail: [], guilds: {} });
    useReadStateStore.setState({ byChannel: { [dm.id]: { lastReadId: '150', mentionCount: 3 } } });
  });

  it('shows the person with the number of new messages and opens the chat', async () => {
    await render(rail);
    expect(screen.getByText('3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('bob, 3 unread'));
    expect(openChat).toHaveBeenCalledWith({ channelId: '100' });
  });

  it('shows nothing once the conversation is read', async () => {
    useReadStateStore.setState({ byChannel: { [dm.id]: { lastReadId: '200', mentionCount: 0 } } });
    await render(rail);
    expect(screen.queryByLabelText('bob, 3 unread')).toBeNull();
  });
});
