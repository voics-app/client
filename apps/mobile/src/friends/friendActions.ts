import { Alert } from 'react-native';
import { RelationshipType } from '@discordy/core/contracts/rest';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { friendRequestError } from '@discordy/core/domain/friendsModel';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';

/** The relationship updates arrive through the gateway (RELATIONSHIP_ADD and RELATIONSHIP_REMOVE), so these only call the API. */
export const acceptRequest = (userId: string) => attempt(() => getRuntime().api.putRelationship(userId), 'Could not accept the request');
/** Declines an incoming request, cancels an outgoing one, removes a friend or unblocks: all delete the relationship. */
export const removeRelationship = (userId: string, title: string) => attempt(() => getRuntime().api.deleteRelationship(userId), title);
export const blockUser = (userId: string) => attempt(() => getRuntime().api.putRelationship(userId, { type: RelationshipType.BLOCKED }), 'Could not block this person');

export interface FriendRequestResult {
  ok: boolean;
  text: string;
}

/** Sends a friend request by username; the result is the line to show under the form. */
export async function sendFriendRequest(username: string): Promise<FriendRequestResult> {
  const name = username.trim();
  try {
    await getRuntime().api.sendFriendRequest(name);
    return { ok: true, text: `Friend request sent to ${name}.` };
  } catch (error) {
    return { ok: false, text: error instanceof ApiError ? friendRequestError(error.status, error.message, name) : errorMessage(error) };
  }
}

/** Sends a request from a profile, where there is no form to show the result in: a failure is alerted, success arrives as the relationship update. */
export async function addFriend(username: string): Promise<void> {
  const result = await sendFriendRequest(username);
  if (!result.ok) Alert.alert('Could not send the request', result.text);
}
