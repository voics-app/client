import { closeDm as closeDmCommand, leaveGroupDm as leaveGroupDmCommand, openDm, setDmPinned } from '@discordy/core/application/dmCommands';
import { muteScope } from '@discordy/core/application/notificationActions';
import { MAX_PINNED_DMS } from '@discordy/core/domain/pins';
import { Alert } from 'react-native';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';

/** The 1:1 or group conversation with these people, created or reopened; resolves to its id, or undefined after telling the user why not. */
export async function openConversation(userIds: string[]): Promise<string | undefined> {
  const channel = await attempt(() => openDm(getRuntime().api, userIds), 'Could not open conversation');
  return channel?.id;
}

export async function pinConversation(channelId: string, pinned: boolean): Promise<void> {
  const changed = await attempt(() => setDmPinned(getRuntime().api, channelId, pinned), 'Could not save pins');
  if (changed === false) Alert.alert('Pinned conversations', `You can pin up to ${MAX_PINNED_DMS} conversations. Unpin one first.`);
}

export const closeConversation = (channelId: string) => attempt(() => closeDmCommand(getRuntime().api, channelId), 'Could not close the conversation');

export const leaveGroup = (channelId: string) => attempt(() => leaveGroupDmCommand(getRuntime().api, channelId), 'Could not leave the group');

/** Mutes a conversation for `seconds` (null until turned off) or unmutes it (undefined). */
export const muteConversation = (channelId: string, seconds: number | null | undefined) => attempt(() => muteScope(getRuntime().api, null, channelId, seconds), 'Could not change mute');
