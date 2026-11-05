import * as WebBrowser from 'expo-web-browser';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Invite } from '@discordy/core/contracts/rest';
import { clearInviteLookups, InviteCards } from '../../src/invites/InviteCards';
import { openInviteLink, useInviteLinkStore } from '../../src/invites/inviteLinkStore';
import { openLink } from '../../src/messages/markdown/links';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const invite = (extra: Partial<Invite> = {}): Invite => ({ code: 'abc123', guild: { id: 'g9', name: 'Chess Club', icon: null }, approximate_member_count: 12, approximate_presence_count: 3, ...extra }) as Invite;
const mockApi = {
  invite: jest.fn(async (_code: string): Promise<Invite> => invite()),
  acceptInvite: jest.fn(async (_code: string) => ({ guild: { id: 'g9' } })),
};
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: mockApi, apiUrl: 'https://discordy-api.voics.nl' }) }));

const LINK = 'https://discordy.voics.nl/invite/abc123';

beforeEach(() => {
  jest.clearAllMocks();
  clearInviteLookups();
  useGuildStore.getState().reset();
  useInviteLinkStore.getState().close();
});

describe('invite cards', () => {
  it('shows the server and who is in it for an invite link to this instance, and joins from it', async () => {
    await render(<InviteCards content={`come over ${LINK}`} />);
    expect(await screen.findByText('Chess Club')).toBeTruthy();
    expect(screen.getByText('12 members, 3 online')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Join'));
    await waitFor(() => expect(mockApi.acceptInvite).toHaveBeenCalledWith('abc123'));
  });

  it('opens the joined server after the gateway has had a moment to deliver it', async () => {
    jest.useFakeTimers();
    await render(<InviteCards content={LINK} />);
    await act(async () => {
      await Promise.resolve();
    });
    await fireEvent.press(await screen.findByLabelText('Join'));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(useUiStore.getState().view).toMatchObject({ kind: 'guild', guildId: 'g9' });
    jest.useRealTimers();
  });

  it('says Joined, with no button, for a server you are in', async () => {
    useGuildStore.getState().hydrate([{ id: 'g9', name: 'Chess Club', icon: null, owner_id: 'x', roles: [], emojis: [], members: [], channels: [] } as never], []);
    await render(<InviteCards content={LINK} />);
    expect(await screen.findByLabelText('Joined')).toBeTruthy();
    expect(screen.queryByLabelText('Join')).toBeNull();
  });

  it('shows a dead invite as invalid, and asks the server once per code', async () => {
    mockApi.invite.mockRejectedValueOnce(new Error('404'));
    await render(<InviteCards content={`${LINK} ${LINK}`} />);
    expect(await screen.findByText('Invite is invalid or has expired')).toBeTruthy();
    expect(mockApi.invite).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for links to other sites or text without links', async () => {
    await render(<InviteCards content="see https://example.com/invite/abc123 and nothing else" />);
    expect(screen.toJSON()).toBeNull();
    expect(mockApi.invite).not.toHaveBeenCalled();
  });
});

describe('opening invite links inside the app', () => {
  it('recognises the web invite page and the deep link, and nothing else', () => {
    expect(openInviteLink(LINK, 'https://discordy-api.voics.nl')).toBe(true);
    expect(useInviteLinkStore.getState().code).toBe('abc123');
    expect(openInviteLink('voics://invite/zzz99', 'https://discordy-api.voics.nl')).toBe(true);
    expect(useInviteLinkStore.getState().code).toBe('zzz99');
    expect(openInviteLink('https://example.com/invite/abc123', 'https://discordy-api.voics.nl')).toBe(false);
    expect(openInviteLink('https://discordy.voics.nl/about', 'https://discordy-api.voics.nl')).toBe(false);
  });

  it('sends a tapped invite link to the join sheet instead of the browser', () => {
    openLink(LINK);
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(useInviteLinkStore.getState().code).toBe('abc123');
    useInviteLinkStore.getState().close();
    openLink('https://example.com/page');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com/page');
    expect(useInviteLinkStore.getState().code).toBeNull();
  });
});
