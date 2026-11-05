import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useTrustedDomainStore } from '@discordy/core/application/stores/composerStores';
import { ChatContext, type ChatContextValue } from '../../src/messages/chatContext';
import { MarkdownText } from '../../src/messages/markdown/MarkdownText';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));

const context = (extra: Partial<ChatContextValue> = {}): ChatContextValue => ({
  guildId: 'g1',
  canManageMessages: false,
  onPressUser: jest.fn(),
  onPressChannel: jest.fn(),
  onJumpToMessage: jest.fn(),
  onWave: jest.fn(),
  canReact: false,
  onMoreReactions: jest.fn(),
  onWhoReacted: jest.fn(),
  canReply: false,
  onReplyTo: jest.fn(),
  onOpenPins: jest.fn(),
  onOpenThread: jest.fn(),
  ...extra,
});
const show = (source: string, ctx = context(), selectable?: boolean) =>
  render(
    <ChatContext.Provider value={ctx}>
      <MarkdownText source={source} selectable={selectable} />
    </ChatContext.Provider>,
  );
const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

beforeEach(() => {
  jest.clearAllMocks();
  usePrefsStore.setState(DEFAULT_PREFS);
  useTrustedDomainStore.setState({ domains: [] });
  useGuildStore.setState({
    members: { g1: { 222: { user: { id: '222', username: 'pat', global_name: 'Pat', discriminator: '0', avatar: null }, roles: [] } } },
    channels: { 999: { id: '999', name: 'random' } },
  } as never);
});

describe('MarkdownText', () => {
  it('draws bold, italic, strike and underline as styled nested text', async () => {
    await show('**bold** *italic* ~~gone~~ __under__');
    expect(styleOf('bold').fontWeight).toBe('700');
    expect(styleOf('italic').fontStyle).toBe('italic');
    expect(styleOf('gone').textDecorationLine).toBe('line-through');
    expect(styleOf('under').textDecorationLine).toBe('underline');
  });

  it('keeps one paragraph in one selectable Text', async () => {
    await show('plain **bold** text', context(), true);
    expect(screen.getByText('bold').parent?.props.selectable).toBe(true);
  });

  it('draws inline code in a monospace face', async () => {
    await show('run `npm test` now');
    expect(styleOf(' npm test ').fontFamily).toBeTruthy();
  });

  it('draws a code block with a language and copies its code', async () => {
    await show('```ts\nconst a = 1;\n```');
    expect(screen.getByText('ts')).toBeTruthy();
    expect(screen.getByText('const a = 1;')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Copy code'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('const a = 1;');
  });

  it('draws quotes, headings and lists', async () => {
    await show('# Title\n> quoted words\n- one\n- two');
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByText('quoted words')).toBeTruthy();
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.getAllByText('•')).toHaveLength(2);
  });

  it('opens a bare link in the in-app browser', async () => {
    await show('see https://example.org/page');
    await fireEvent.press(screen.getByText('https://example.org/page'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.org/page');
  });

  it('asks before opening a masked link to an unknown host, and can trust the host', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await show('[click me](https://evil.example/x)');
    await fireEvent.press(screen.getByText('click me'));
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('You are leaving the app', expect.stringContaining('https://evil.example/x'), expect.any(Array));
    const buttons = alert.mock.calls[0]![2]!;
    buttons.find((b) => b.text?.startsWith('Always trust'))!.onPress!();
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://evil.example/x');
    expect(useTrustedDomainStore.getState().domains).toContain('evil.example');
    alert.mockRestore();
  });

  it('opens a masked link to a trusted host without asking', async () => {
    useTrustedDomainStore.setState({ domains: ['example.org'] });
    const alert = jest.spyOn(Alert, 'alert');
    await show('[docs](https://example.org/a)');
    await fireEvent.press(screen.getByText('docs'));
    expect(alert).not.toHaveBeenCalled();
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.org/a');
  });

  it('hides spoilers until tapped and keeps their text out of the tree', async () => {
    await show('before ||secret||');
    expect(screen.queryByText('secret')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Spoiler, tap to reveal'));
    expect(screen.getByText('secret')).toBeTruthy();
  });

  it('shows a member mention by name and opens their profile', async () => {
    const ctx = context();
    await show('hi <@222>', ctx);
    await fireEvent.press(screen.getByText('@Pat'));
    expect(ctx.onPressUser).toHaveBeenCalledWith('222');
  });

  it('shows a channel mention and navigates to it', async () => {
    const ctx = context();
    await show('go to <#999>', ctx);
    await fireEvent.press(screen.getByText('#random'));
    expect(ctx.onPressChannel).toHaveBeenCalledWith('999');
  });

  it('draws a custom emoji from the CDN', async () => {
    await show('<:party:777>');
    const image = screen.getByLabelText(':party:');
    expect(image.props.source.uri).toMatch(/\/emojis\/777\.png$/);
  });

  it('draws emoji-only messages larger', async () => {
    await show('<:party:777>');
    expect(StyleSheet.flatten(screen.getByLabelText(':party:').props.style).width).toBeGreaterThan(30);
    await screen.unmount();
    await show('text <:party:777>');
    expect(StyleSheet.flatten(screen.getByLabelText(':party:').props.style).width).toBeLessThan(30);
  });

  it('puts the trailing marker on the last line of text', async () => {
    await render(<MarkdownText source="hello" trailing={<>{' (edited)'}</>} />);
    expect(screen.getByText(/hello/).props.children).toBeTruthy();
    expect(screen.getByText(/\(edited\)/)).toBeTruthy();
  });
});

describe('Always underline links', () => {
  it('underlines a link only when the setting is on', async () => {
    await show('see https://example.com now');
    expect(styleOf('https://example.com').textDecorationLine).toBeUndefined();
    usePrefsStore.getState().set('linkUnderline', true);
    await show('see https://example.com now');
    expect(screen.getAllByText('https://example.com').map((n) => StyleSheet.flatten(n.props.style).textDecorationLine)).toContain('underline');
  });
});
