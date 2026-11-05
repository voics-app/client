import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import * as WebBrowser from 'expo-web-browser';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import type { Attachment, Message } from '@discordy/core/contracts/rest';
import { PAT, resetStores, seedServer } from '../support/server';

const att = (id: string, filename: string, content_type: string): Attachment => ({ id, filename, content_type, size: 2048, url: `https://cdn.test/${filename}` }) as Attachment;
const msg = (id: string, extra: Partial<Message> = {}) =>
  ({ id, channel_id: 'general', guild_id: 'g1', author: PAT, content: `text ${id}`, timestamp: new Date().toISOString(), edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as Message;
const hit = (m: Message, context: Message[] = []) => [...context, { ...m, hit: true }];

const mockApi = {
  messages: jest.fn(async (_c: string, _q?: object): Promise<Message[]> => [msg('100')]),
  ack: jest.fn(async () => undefined),
  searchMessages: jest.fn(async (_scope: unknown, params: { has?: string[]; content?: string }) => {
    const has = params.has?.[0];
    if (has === 'image') return { total_results: 1, messages: [hit(msg('200', { attachments: [att('i1', 'cat.png', 'image/png')] }))] };
    if (has === 'video') return { total_results: 0, messages: [] };
    if (has === 'file') return { total_results: 1, messages: [hit(msg('201', { attachments: [att('f1', 'report.pdf', 'application/pdf')] }))] };
    if (has === 'link') return { total_results: 1, messages: [hit(msg('202', { content: 'read https://docs.test/start' }))] };
    return { total_results: 2, messages: [hit(msg('300', { content: 'we should deploy tonight' }), [msg('299', { content: 'context line' })]), hit(msg('301', { channel_id: 'secret', content: 'deploy later' }))] };
  }),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

async function openSearch() {
  seedServer(0n);
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Open #general'));
  await screen.findByText('text 100');
  await fireEvent.press(screen.getByLabelText('#general details'));
  await fireEvent.press(await screen.findByLabelText('Search'));
  await screen.findByLabelText('Search messages');
}

async function searchFor(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Search messages'), text);
  await fireEvent(screen.getByLabelText('Search messages'), 'submitEditing');
}

describe('search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    useMessageStore.getState().reset();
    useReadNavStore.setState({ jump: null });
  });

  it('opens from channel details and explains the filters before anything is typed', async () => {
    await openSearch();
    expect(screen).toHavePathname('/search/general');
    expect(screen.getByText(/from: mentions: has: in:/)).toBeTruthy();
  });

  it('opens from the header menu too', async () => {
    seedServer(0n);
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await fireEvent.press(await screen.findByLabelText('Open #general'));
    await fireEvent.press(await screen.findByLabelText('Channel menu'));
    await fireEvent.press(await screen.findByLabelText('Search'));
    await waitFor(() => expect(screen).toHavePathname('/search/general'));
  });

  it('suggests filters as you type and completes one', async () => {
    await openSearch();
    await fireEvent.changeText(screen.getByLabelText('Search messages'), 'fr');
    await fireEvent.press(await screen.findByLabelText('Use from:'));
    expect(screen.getByLabelText('Search messages').props.value).toBe('from:');
    await fireEvent.changeText(screen.getByLabelText('Search messages'), 'from:pa');
    await fireEvent.press(await screen.findByLabelText('Use from:pat'));
    expect(screen.getByLabelText('Search messages').props.value).toBe('from:pat ');
  });

  it('searches the whole server and shows hits with their channel, highlighting and context', async () => {
    await openSearch();
    await searchFor('deploy from:pat');
    expect(await screen.findByText('2 results in Home Base')).toBeTruthy();
    expect(mockApi.searchMessages).toHaveBeenCalledWith({ guildId: 'g1', channelId: 'general' }, expect.objectContaining({ content: 'deploy', author_id: ['u2'], offset: 0 }));
    expect(screen.getByText('in #general')).toBeTruthy();
    expect(screen.getByText('in #secret')).toBeTruthy();
    expect(screen.getByText('Pat: context line')).toBeTruthy();
    expect(screen.getAllByText('deploy', { exact: true })).toHaveLength(2);
    expect(screen.getByLabelText('Remove filter from:pat')).toBeTruthy();
  });

  it('sorts results: newest first by default, then oldest or most relevant, searching again each time', async () => {
    await openSearch();
    await searchFor('deploy');
    await waitFor(() => expect(mockApi.searchMessages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ sort_by: 'timestamp', sort_order: 'desc' })));
    await fireEvent.press(screen.getByLabelText('Sort: Oldest'));
    await waitFor(() => expect(mockApi.searchMessages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ sort_by: 'timestamp', sort_order: 'asc', offset: 0 })));
    await fireEvent.press(screen.getByLabelText('Sort: Most relevant'));
    await waitFor(() => expect(mockApi.searchMessages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ sort_by: 'relevance', sort_order: 'desc' })));
    expect(screen.getByLabelText('Sort: Most relevant').props.accessibilityState.selected).toBe(true);
  });

  it('removes a filter chip and searches again', async () => {
    await openSearch();
    await searchFor('deploy from:pat');
    await fireEvent.press(await screen.findByLabelText('Remove filter from:pat'));
    await waitFor(() => expect(mockApi.searchMessages).toHaveBeenLastCalledWith(expect.anything(), expect.not.objectContaining({ author_id: expect.anything() })));
    expect(screen.queryByLabelText('Remove filter from:pat')).toBeNull();
  });

  it('jumps back to the chat at a hit in the same channel', async () => {
    await openSearch();
    await searchFor('deploy');
    await fireEvent.press(await screen.findByText('in #general'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/general'));
  });

  it('opens a hit from another channel in that channel', async () => {
    await openSearch();
    await searchFor('deploy');
    await fireEvent.press(await screen.findByText('in #secret'));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/secret'));
  });

  it('shows images and videos on the Media tab', async () => {
    await openSearch();
    await searchFor('trip');
    await fireEvent.press(await screen.findByLabelText('Media'));
    expect(await screen.findByLabelText('Image from Pat')).toBeTruthy();
    expect(mockApi.searchMessages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ has: ['image'] }));
    expect(mockApi.searchMessages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ has: ['video'] }));
  });

  it('lists files with their size and opens one', async () => {
    await openSearch();
    await searchFor('report');
    await fireEvent.press(await screen.findByLabelText('Files'));
    expect(await screen.findByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open file report.pdf'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://cdn.test/report.pdf');
  });

  it('lists links by site and opens one', async () => {
    await openSearch();
    await searchFor('docs');
    await fireEvent.press(await screen.findByLabelText('Links'));
    expect(await screen.findByText('docs.test')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open link https://docs.test/start'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://docs.test/start');
  });

  it('says when a tab has nothing', async () => {
    mockApi.searchMessages.mockResolvedValueOnce({ total_results: 0, messages: [] });
    await openSearch();
    await searchFor('zzz');
    expect(await screen.findByText('Nothing found.')).toBeTruthy();
  });

  it('names an unknown member and retries a failed search', async () => {
    await openSearch();
    await searchFor('from:ghost');
    expect(await screen.findByText(/No member named "ghost"/)).toBeTruthy();
    mockApi.searchMessages.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 }));
    await searchFor('hello');
    await fireEvent.press(await screen.findByText(/searching too fast/));
    expect(await screen.findByText('2 results in Home Base')).toBeTruthy();
  });

  it('clears the box', async () => {
    await openSearch();
    await searchFor('deploy');
    await screen.findByText('2 results in Home Base');
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Search messages').props.value).toBe('');
    expect(screen.getByText(/Type words to find/)).toBeTruthy();
  });
});
