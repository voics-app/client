import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { ChatContext, type ChatContextValue } from '../../src/messages/chatContext';
import { MessageRow, type MessageRowProps } from '../../src/messages/MessageRow';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const PAT = { id: '222', username: 'pat', global_name: 'Pat', discriminator: '0', avatar: 'abc' };
const message = (extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: '1', channel_id: 'c1', author: PAT, content: 'hello **world**', timestamp: new Date().toISOString(), edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as ChatMessage;

const ctx = (extra: Partial<ChatContextValue> = {}): ChatContextValue => ({
  guildId: 'g1',
  canManageMessages: false,
  onPressUser: jest.fn(),
  onPressChannel: jest.fn(),
  onJumpToMessage: jest.fn(),
  onWave: jest.fn(),
  ...extra,
});
const row = (m: ChatMessage, props: Partial<MessageRowProps> = {}, context = ctx()) =>
  render(
    <ChatContext.Provider value={context}>
      <MessageRow message={m} replied={undefined} showHeader onLongPress={jest.fn()} onToggleReaction={jest.fn()} onPressAuthor={jest.fn()} onRetry={jest.fn()} onDiscard={jest.fn()} {...props} />
    </ChatContext.Provider>,
  );

beforeEach(() => {
  useGuildStore.setState({
    guilds: { g1: { id: 'g1', roles: [{ id: 'r1', name: 'Mod', color: 0xff8800, position: 2 }, { id: 'r0', name: 'Low', color: 0x00ff00, position: 1 }] } },
    members: { g1: { '222': { user: PAT, roles: ['r0', 'r1'] } } },
  } as never);
});

describe('MessageRow', () => {
  it('shows the author with the colour of their highest coloured role, and rendered markdown', async () => {
    await row(message());
    expect(StyleSheet.flatten(screen.getByText('Pat').props.style).color).toBe('#ff8800');
    expect(StyleSheet.flatten(screen.getByText('world').props.style).fontWeight).toBe('700');
  });

  it('shows the real avatar from the CDN', async () => {
    await row(message());
    expect(screen.getByLabelText('Pat avatar').props.source.uri).toContain('/avatars/222/abc');
  });

  it('marks edited messages', async () => {
    await row(message({ edited_timestamp: new Date().toISOString() }));
    expect(screen.getByText('(edited)', { exact: false })).toBeTruthy();
  });

  it('shows the replied-to message above and jumps to it when tapped', async () => {
    const onJumpToMessage = jest.fn();
    const original = message({ id: '0', content: 'the original' });
    await row(message({ message_reference: { message_id: '0' } as never }), { replied: original }, ctx({ onJumpToMessage }));
    expect(screen.getByText('@Pat')).toBeTruthy();
    expect(screen.getByText('the original')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Jump to the original message'));
    expect(onJumpToMessage).toHaveBeenCalledWith('0');
  });

  it('says so when the original message was deleted', async () => {
    await row(message({ message_reference: { message_id: '0' } as never, referenced_message: null }));
    expect(screen.getByText('Original message was deleted')).toBeTruthy();
  });

  it('draws system messages with their text instead of a placeholder', async () => {
    await row(message({ type: 6, content: '', message_reference: { message_id: '0' } as never }));
    expect(screen.getAllByText(/pinned/).length).toBeGreaterThan(0);
    expect(screen.getByText('a message')).toBeTruthy();
  });

  it('jumps to the pinned message from a pin notice', async () => {
    const onJumpToMessage = jest.fn();
    await row(message({ type: 6, content: '', message_reference: { message_id: '0' } as never }), {}, ctx({ onJumpToMessage }));
    await fireEvent.press(screen.getByText('a message'));
    expect(onJumpToMessage).toHaveBeenCalledWith('0');
  });

  it('offers a wave on join messages', async () => {
    const onWave = jest.fn();
    await row(message({ type: 7, content: '' }), {}, ctx({ onWave }));
    await fireEvent.press(screen.getByText('Wave to say hi'));
    expect(onWave).toHaveBeenCalledWith('1');
  });

  it('names the added member in a group message', async () => {
    await row(message({ type: 1, content: '', mentions: [{ id: '333', username: 'sam', global_name: null, discriminator: '0', avatar: null }] }));
    expect(screen.getByText('sam')).toBeTruthy();
  });
});
