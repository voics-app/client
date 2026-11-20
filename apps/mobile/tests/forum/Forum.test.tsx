import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { canPost, forumPosts, newPostBody } from '../../src/forum/forumModel';
import { resetStores, seedServer } from '../support/server';

const post = (id: string, extra: Partial<Channel> = {}) => ({ id, type: ChannelType.PUBLIC_THREAD, guild_id: 'g1', parent_id: 'ideas', name: `post ${id}`, message_count: 2, delivery_mode: 'standard', ...extra }) as Channel;

describe('forumPosts', () => {
  it('lists the public threads of the forum, newest first, archived after the active ones', () => {
    const channels = Object.fromEntries([post('ideas', { type: ChannelType.GUILD_FORUM, parent_id: null }), post('100'), post('300'), post('200', { thread_metadata: { archived: true } as never }), post('999', { parent_id: 'other' }), post('400', { type: ChannelType.GUILD_TEXT }), post('500', { delivery_mode: 'ephemeral' })].map((c) => [c.id, c]));
    expect(forumPosts(channels, 'ideas').map((c) => c.id)).toEqual(['300', '100', '200']);
  });

  it('sends a post as a public thread with the body as its first message', () => {
    expect(newPostBody(' Title ', ' Body ', 'request-1')).toEqual({ name: 'Title', type: ChannelType.PUBLIC_THREAD, request_id: 'request-1', applied_tags: [], message: { content: 'Body' } });
    expect(canPost('t', ' ')).toBe(false);
    expect(canPost(' ', 'b')).toBe(false);
    expect(canPost('t', 'b')).toBe(true);
  });
});

const mockApi = {
  messages: jest.fn(async () => []),
  listForumPosts: jest.fn(async () => []),
  createThread: jest.fn(async (_c: string, body: { name: string }) => post('555', { name: body.name, forum_post_status: 'published' })),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

async function openForum(perms: bigint) {
  seedServer(perms);
  useGuildStore.getState().upsertChannel(post('700', { name: 'Best openings' }));
  await renderRouter('./app', { initialUrl: '/servers/g1/ideas' });
}

describe('forum channel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
  });

  it('lists the posts with their message count and opens one as a chat', async () => {
    await openForum(0n);
    await fireEvent.press(await screen.findByLabelText('Open post Best openings'));
    expect(screen).toHavePathname('/servers/g1/700');
  });

  it('offers New post only with Create Public Threads', async () => {
    await openForum(0n);
    await screen.findByLabelText('Open post Best openings');
    expect(screen.queryByLabelText('New post')).toBeNull();
  });

  it('creates a post from a title and a message, then opens it', async () => {
    await openForum(Permission.CREATE_PUBLIC_THREADS);
    await fireEvent.press(await screen.findByLabelText('New post'));
    expect(screen.getByLabelText('Create post').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Gambits');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Which ones?');
    await fireEvent.press(screen.getByLabelText('Create post'));
    await waitFor(() => expect(mockApi.createThread).toHaveBeenCalledWith('ideas', { name: 'Gambits', type: ChannelType.PUBLIC_THREAD, request_id: expect.any(String), applied_tags: [], message: { content: 'Which ones?' } }));
    await waitFor(() => expect(screen).toHavePathname('/servers/g1/555'));
    expect(useGuildStore.getState().channels['555']).toBeTruthy();
  });
});
