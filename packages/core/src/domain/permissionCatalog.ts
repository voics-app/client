/** Human labels and grouping for the role editor's permission matrix. */
import { Permission, type PermissionName } from '../contracts/permissions';

export type PermissionGroup = 'General' | 'Membership' | 'Text' | 'Voice' | 'Advanced';

export interface PermissionEntry {
  name: PermissionName;
  bit: bigint;
  label: string;
  description: string;
  group: PermissionGroup;
  /** Meaningful on a channel overwrite (as opposed to guild-wide only). */
  channelScoped: boolean;
}

const e = (name: PermissionName, label: string, description: string, group: PermissionGroup, channelScoped = true): PermissionEntry => ({
  name,
  bit: Permission[name],
  label,
  description,
  group,
  channelScoped,
});

export const PERMISSION_CATALOG: readonly PermissionEntry[] = [
  e('VIEW_CHANNEL', 'View channels', 'See channels and read their messages.', 'General'),
  e('MANAGE_CHANNELS', 'Manage channels', 'Create, edit and delete channels.', 'General'),
  e('MANAGE_ROLES', 'Manage roles', 'Create and edit roles below their own.', 'General'),
  e('MANAGE_GUILD_EXPRESSIONS', 'Manage expressions', 'Add, edit and remove custom emoji.', 'General', false),
  e('VIEW_AUDIT_LOG', 'View audit log', 'See who changed what in the server.', 'General', false),
  e('MANAGE_WEBHOOKS', 'Manage webhooks', 'Create and manage webhooks.', 'General'),
  e('MANAGE_GUILD', 'Manage server', 'Change the server name, region and settings.', 'General', false),
  e('CREATE_INSTANT_INVITE', 'Create invite', 'Invite new people to the server.', 'Membership'),
  e('CHANGE_NICKNAME', 'Change nickname', 'Change their own nickname.', 'Membership', false),
  e('MANAGE_NICKNAMES', 'Manage nicknames', 'Change other members’ nicknames.', 'Membership', false),
  e('KICK_MEMBERS', 'Kick members', 'Remove members from the server.', 'Membership', false),
  e('BAN_MEMBERS', 'Ban members', 'Permanently ban members.', 'Membership', false),
  e('MODERATE_MEMBERS', 'Timeout members', 'Temporarily stop members from talking or writing.', 'Membership', false),
  e('SEND_MESSAGES', 'Send messages', 'Post in text channels.', 'Text'),
  e('SEND_MESSAGES_IN_THREADS', 'Send messages in threads', 'Post inside threads.', 'Text'),
  e('CREATE_PUBLIC_THREADS', 'Create public threads', 'Start public threads.', 'Text'),
  e('CREATE_PRIVATE_THREADS', 'Create private threads', 'Start invite-only threads.', 'Text'),
  e('EMBED_LINKS', 'Embed links', 'Links show a preview.', 'Text'),
  e('ATTACH_FILES', 'Attach files', 'Upload files and media.', 'Text'),
  e('ADD_REACTIONS', 'Add reactions', 'React to messages with emoji.', 'Text'),
  e('USE_EXTERNAL_EMOJIS', 'Use external emoji', 'Use emoji from other servers.', 'Text'),
  e('MENTION_EVERYONE', 'Mention @everyone', 'Notify everyone or all roles.', 'Text'),
  e('MANAGE_MESSAGES', 'Manage messages', 'Delete others’ messages and pin messages.', 'Text'),
  e('MANAGE_THREADS', 'Manage threads', 'Archive, lock and delete threads.', 'Text'),
  e('READ_MESSAGE_HISTORY', 'Read message history', 'See messages sent before they joined.', 'Text'),
  e('USE_APPLICATION_COMMANDS', 'Use application commands', 'Run bot commands.', 'Text'),
  e('SEND_VOICE_MESSAGES', 'Send voice messages', 'Post voice messages.', 'Text'),
  e('SEND_POLLS', 'Create polls', 'Start polls.', 'Text'),
  e('CONNECT', 'Connect', 'Join voice channels.', 'Voice'),
  e('SPEAK', 'Speak', 'Talk in voice channels.', 'Voice'),
  e('STREAM', 'Video and screen share', 'Share camera and screen.', 'Voice'),
  e('USE_VAD', 'Use voice activity', 'Talk without push-to-talk.', 'Voice'),
  e('PRIORITY_SPEAKER', 'Priority speaker', 'Lower others’ volume while speaking.', 'Voice'),
  e('MUTE_MEMBERS', 'Mute members', 'Mute others in voice.', 'Voice'),
  e('DEAFEN_MEMBERS', 'Deafen members', 'Deafen others in voice.', 'Voice'),
  e('MOVE_MEMBERS', 'Move members', 'Move people between voice channels.', 'Voice'),
  e('ADMINISTRATOR', 'Administrator', 'Grants every permission and bypasses channel overwrites. Grant with care.', 'Advanced', false),
];

export const PERMISSION_GROUPS: readonly PermissionGroup[] = ['General', 'Membership', 'Text', 'Voice', 'Advanced'];

export const permissionsByGroup = (channelOnly: boolean): { group: PermissionGroup; entries: PermissionEntry[] }[] =>
  PERMISSION_GROUPS.map((group) => ({ group, entries: PERMISSION_CATALOG.filter((p) => p.group === group && (!channelOnly || p.channelScoped)) })).filter((g) => g.entries.length > 0);
