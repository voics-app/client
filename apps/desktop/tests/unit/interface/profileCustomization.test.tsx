// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import type { GuildMember, User } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { ProfileTab } from '@renderer/interface/features/settings/user/ProfileTab';
import { ProfileDialog } from '@renderer/interface/features/members/ProfileDialog';

const f = vi.hoisted(() => ({ permissions: 0n, api: { updateMe: vi.fn(), updateMember: vi.fn(), member: vi.fn(), user: vi.fn() } }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: f.api }) }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({ useGuildPermissions: () => f.permissions, can: (permissions: bigint, flag: bigint) => (permissions & flag) === flag }));
const user: User = { id: '7', username: 'sam', global_name: 'Sam', avatar: 'global-avatar', banner: 'global-banner', bio: 'Global bio', pronouns: 'they/them', theme_colors: [0, 0xffffff], accent_color: 0 };
const member: GuildMember = { user, nick: null, avatar: 'server-avatar', banner: 'server-banner', bio: 'Server bio', roles: [], joined_at: '2026-11-01T00:00:00Z', mute: false, deaf: false };

function mount(ui: React.ReactNode = <ProfileTab />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.resetAllMocks(); f.permissions = 0n;
  useSessionStore.getState().setUser(user);
  useConnectionStore.setState({ apiUrl: 'https://instance', cdnUrl: 'https://cdn' });
  useSessionStore.setState({ sessionId: null });
  useUnsavedStore.setState({ sources: {}, shake: 0, escBlocked: false });
  useGuildStore.setState({ guilds: { '9': { id: '9', name: 'Study club', owner_id: '8', icon: null, roles: [], emojis: [], features: [] } } as never, members: { '9': { '7': member } } });
  f.api.member.mockResolvedValue(member);
  f.api.updateMe.mockImplementation(async (patch) => ({ ...user, ...patch }));
  f.api.updateMember.mockImplementation(async (_guild, _id, patch) => ({ ...member, ...patch, bio: patch.bio || null }));
  f.api.user.mockResolvedValue(user);
});
afterEach(cleanup);

describe('profile customization', () => {
  it('does not overwrite a new account with a delayed global profile save', async () => {
    let resolve!: (value: User) => void;
    f.api.updateMe.mockReturnValue(new Promise<User>((done) => { resolve = done; }));
    mount();
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const nextUser = { ...user, id: '8', username: 'other', pronouns: 'new' };
    act(() => { useSessionStore.getState().setUser(nextUser); });
    await act(async () => { resolve({ ...user, pronouns: 'pending' }); });
    expect(useSessionStore.getState().user).toEqual(nextUser);
  });

  it('does not write a delayed server profile save into a different instance', async () => {
    let resolve!: (value: GuildMember) => void;
    f.api.updateMember.mockReturnValue(new Promise<GuildMember>((done) => { resolve = done; }));
    mount(<ProfileTab initialGuildId="9" />);
    fireEvent.change(await screen.findByLabelText('About me'), { target: { value: 'old instance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const nextMember = { ...member, bio: 'new instance' };
    act(() => { useConnectionStore.setState({ apiUrl: 'https://new-instance' }); useGuildStore.setState({ members: { '9': { '7': nextMember } } }); });
    await act(async () => { resolve({ ...member, bio: 'old instance' }); });
    expect(useGuildStore.getState().members['9']?.['7']?.bio).toBe('new instance');
  });

  it('keeps an old instance member lookup out of the new instance profile', async () => {
    let resolve!: (value: GuildMember) => void;
    useGuildStore.setState({ members: {} });
    f.api.member.mockReturnValueOnce(new Promise<GuildMember>((done) => { resolve = done; })).mockResolvedValue({ ...member, bio: 'new instance' });
    mount(<ProfileTab initialGuildId="9" />);
    await waitFor(() => expect(f.api.member).toHaveBeenCalledTimes(1));
    act(() => { useConnectionStore.setState({ apiUrl: 'https://new-instance' }); });
    await waitFor(() => expect(f.api.member).toHaveBeenCalledTimes(2));
    await act(async () => { resolve({ ...member, bio: 'old instance' }); });
    await waitFor(() => expect((screen.getByLabelText('About me') as HTMLTextAreaElement).value).toBe('new instance'));
  });

  it('discards a member lookup after switching away and back to an instance', async () => {
    let resolve!: (value: GuildMember) => void;
    useGuildStore.setState({ members: {} });
    f.api.member.mockReturnValueOnce(new Promise<GuildMember>((done) => { resolve = done; }))
      .mockResolvedValueOnce({ ...member, bio: 'instance B' })
      .mockResolvedValueOnce({ ...member, bio: 'fresh instance A' });
    mount(<ProfileTab initialGuildId="9" />);
    await waitFor(() => expect(f.api.member).toHaveBeenCalledTimes(1));
    act(() => { useConnectionStore.setState({ apiUrl: 'https://instance-b' }); });
    await waitFor(() => expect((screen.getByLabelText('About me') as HTMLTextAreaElement).value).toBe('instance B'));
    act(() => { useConnectionStore.setState({ apiUrl: 'https://instance' }); });
    await waitFor(() => expect(f.api.member).toHaveBeenCalledTimes(3));
    await act(async () => { resolve({ ...member, bio: 'stale instance A' }); });
    await waitFor(() => expect((screen.getByLabelText('About me') as HTMLTextAreaElement).value).toBe('fresh instance A'));
  });

  it('counts Unicode characters consistently with the API limits', async () => {
    mount();
    const pronouns = screen.getByLabelText('Pronouns') as HTMLInputElement;
    const bio = screen.getByLabelText('About me') as HTMLTextAreaElement;
    const symbol = String.fromCodePoint(0x1f331);
    fireEvent.change(pronouns, { target: { value: symbol.repeat(41) } });
    fireEvent.change(bio, { target: { value: symbol.repeat(301) } });
    expect(pronouns.value).toBe(symbol.repeat(40));
    expect(bio.value).toBe(symbol.repeat(300));
    expect(pronouns.maxLength).toBe(80);
    expect(bio.maxLength).toBe(600);
    expect(screen.getByText('300/300 characters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Profile saved.');
    expect(f.api.updateMe).toHaveBeenCalledWith({ pronouns: symbol.repeat(40), bio: symbol.repeat(300) });
  });

  it('previews global text and colours, saves only edited fields, and supports resetting appearance', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: 'she/her' } });
    fireEvent.change(screen.getByLabelText('Primary theme colour'), { target: { value: '#123456' } });
    const preview = screen.getByRole('region', { name: 'Live profile preview' });
    expect(within(preview).getByText('she/her')).toBeTruthy();
    expect(preview.querySelector('.profile-banner')?.getAttribute('style')).toContain('rgb(18, 52, 86)');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Profile saved.');
    expect(f.api.updateMe).toHaveBeenCalledWith({ pronouns: 'she/her', theme_colors: [0x123456, 0xffffff] });
    expect(useSessionStore.getState().user?.pronouns).toBe('she/her');
    fireEvent.click(screen.getByRole('button', { name: 'Reset theme colours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset fallback colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove banner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(f.api.updateMe).toHaveBeenLastCalledWith({ theme_colors: null, accent_color: null, banner: null }));
  });

  it('keeps failed saves and blocks scope changes until the draft is saved or reset', async () => {
    f.api.updateMe.mockRejectedValueOnce(new Error('Connection lost.'));
    mount();
    const bio = screen.getByLabelText('About me');
    fireEvent.change(bio, { target: { value: 'Unsaved bio' } });
    fireEvent.change(screen.getByLabelText('Profile to edit'), { target: { value: '9' } });
    expect((screen.getByLabelText('Profile to edit') as HTMLSelectElement).value).toBe('');
    expect(useUnsavedStore.getState().shake).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const failure = await screen.findByRole('alert');
    expect(failure.textContent).toContain('Connection lost');
    expect(failure.closest('.save-bar')).toBeTruthy();
    expect((bio as HTMLTextAreaElement).value).toBe('Unsaved bio');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Profile saved.');
    fireEvent.change(screen.getByLabelText('Profile to edit'), { target: { value: '9' } });
    expect(await screen.findByLabelText('Server nickname')).toBeTruthy();
  });

  it('allows server image and bio editing without nickname permission and previews global fallback', async () => {
    mount(<ProfileTab initialGuildId="9" />);
    expect((await screen.findByLabelText('Server nickname') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Use global avatar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use global banner' }));
    fireEvent.change(screen.getByLabelText('About me'), { target: { value: '' } });
    const preview = screen.getByRole('region', { name: 'Live profile preview' });
    expect(within(preview).getByText('Global bio')).toBeTruthy();
    expect(preview.querySelector('img')?.src).toContain('/banners/7/global-banner.png');
    expect(preview.querySelector('.avatar img')?.getAttribute('src')).toContain('/avatars/7/global-avatar.png');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Profile saved.');
    expect(f.api.updateMember).toHaveBeenCalledWith('9', '7', { avatar: null, banner: null, bio: '' });
    expect(f.api.updateMe).not.toHaveBeenCalled();
    expect(useGuildStore.getState().members['9']?.['7']?.avatar).toBeNull();
  });

  it('previews uploaded images and reports unsupported or oversized files without losing edits', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Banner image'), { target: { files: [new File(['image'], 'banner.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Live profile preview' }).querySelector('img')?.src).toMatch(/^data:image\/png;base64,/));
    fireEvent.change(screen.getByLabelText('Avatar image'), { target: { files: [new File(['svg'], 'avatar.svg', { type: 'image/svg+xml' })] } });
    const imageFailure = await screen.findByRole('alert');
    expect(imageFailure.textContent).toContain('Choose a PNG');
    expect(imageFailure.textContent).toContain('Choose another image');
    expect(imageFailure.closest('.field')?.querySelector('input')).toBe(screen.getByLabelText('Avatar image'));
    const oversized = new File(['image'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('Avatar image'), { target: { files: [oversized] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('10 MB'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Profile saved.');
    expect(f.api.updateMe).toHaveBeenCalledWith({ banner: expect.stringMatching(/^data:image\/png;base64,/) });
  });

  it('loads a missing server member and offers a retry after a failed request', async () => {
    useGuildStore.setState({ members: {} });
    f.api.member.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(member);
    mount(<ProfileTab initialGuildId="9" />);
    expect(screen.getByText('Loading server profile…')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading profile' }));
    expect(await screen.findByLabelText('Server nickname')).toBeTruthy();
    expect(f.api.member).toHaveBeenCalledWith('9', '7');
  });

  it('renders the server banner, avatar, bio, pronouns and theme in the profile dialog', async () => {
    mount(<ProfileDialog userId="7" guildId="9" />);
    expect(await screen.findByText('Server bio')).toBeTruthy();
    expect(screen.getByText('they/them')).toBeTruthy();
    expect(document.querySelector('.profile-banner img')?.getAttribute('src')).toContain('/guilds/9/users/7/banners/server-banner.png');
    expect(document.querySelector('.profile-head .avatar img')?.getAttribute('src')).toContain('/guilds/9/users/7/avatars/server-avatar.png');
    expect(document.querySelector('.profile-theme-strip')?.getAttribute('style')).toContain('rgb(0, 0, 0)');
    expect(screen.queryByText('Global bio')).toBeNull();
  });
});
