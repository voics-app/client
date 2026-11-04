import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMemberGroupStore } from '@discordy/core/application/stores/memberGroupStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type GuildFull, type GuildMember, type User, type VoiceState } from '@discordy/core/contracts/rest';

export const ME: User = { id: 'u1', username: 'me', global_name: 'Me Myself', avatar: null };
export const PAT: User = { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null };
export const SAM: User = { id: 'u3', username: 'sam', global_name: 'Sam', avatar: null };

const role = (id: string, name: string, position: number, extra: object = {}) => ({ id, name, color: 0, hoist: false, position, permissions: '0', managed: false, mentionable: false, ...extra });
const channel = (id: string, type: number, extra: object = {}) => ({ id, type, guild_id: 'g1', name: id, position: 0, delivery_mode: 'standard', ...extra });
const member = (user: User, roles: string[]): GuildMember => ({ user, roles, joined_at: '2024-01-02T00:00:00Z' }) as GuildMember;

/** Seeds a signed-in user (`u1`, owner `owner`) in server `g1`. `mine` are the permissions of @everyone, which is how the test user gets them. */
export function seedServer(mine: bigint, options: { ownerIsMe?: boolean } = {}) {
  const everyone = role('g1', '@everyone', 0, { permissions: String(mine | Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.READ_MESSAGE_HISTORY) });
  const guild = {
    id: 'g1',
    name: 'Home Base',
    icon: null,
    owner_id: options.ownerIsMe ? ME.id : 'owner',
    roles: [everyone, role('staff', 'Staff', 3), role('mods', 'Mods', 2, { hoist: true, color: 0xe5484d }), role('regular', 'Regulars', 1)],
    emojis: [],
    members: [member(ME, ['staff']), member(PAT, ['regular']), member(SAM, ['mods'])],
    channels: [
      channel('cat', ChannelType.GUILD_CATEGORY, { name: 'Talk', position: 0 }),
      channel('general', ChannelType.GUILD_TEXT, { parent_id: 'cat', position: 1 }),
      channel('secret', ChannelType.GUILD_TEXT, { parent_id: 'cat', position: 2, delivery_mode: 'ephemeral' }),
      channel('lobby', ChannelType.GUILD_VOICE, { parent_id: 'cat', position: 3, user_limit: 4 }),
      channel('ideas', ChannelType.GUILD_FORUM, { parent_id: 'cat', position: 4 }),
    ],
  } as unknown as GuildFull;
  useSessionStore.setState({ status: 'ready', user: ME as never });
  useGuildStore.getState().hydrate([guild], []);
  usePresenceStore.getState().setMany({ u2: { status: 'online', activities: [{ name: 'Chess', type: 0 }] }, u3: { status: 'idle', activities: [] } });
  return guild;
}

export function seedVoice(...states: Partial<VoiceState>[]) {
  useVoiceStore.getState().hydrate(
    'g1',
    states.map((s) => ({ guild_id: 'g1', channel_id: 'lobby', session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false, user_id: 'u2', ...s })),
  );
}

export function resetStores() {
  useSessionStore.getState().reset();
  useGuildStore.getState().reset();
  useVoiceStore.setState({ states: {} });
  usePresenceStore.getState().reset();
  useMemberGroupStore.setState({ collapsed: {} });
  useUiStore.getState().navigate({ kind: 'home', channelId: null });
}
