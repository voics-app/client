import { deviceStorage } from '@discordy/core/application/ports/deviceStorage';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { PresenceUpdatePayload } from '@discordy/core/contracts/gateway';
import { selfPresencePayload, type ManualStatus } from '@discordy/core/domain/selfPresence';

let background = false;

export function setMobileBackground(value: boolean): void {
  background = value;
}

/** The server's default Online is indistinguishable from a choice, so this device remembers the picker intent per account. */
export function rememberMobileStatus(status: ManualStatus): void {
  const id = useSessionStore.getState().user?.id;
  if (!id) return;
  if (status === 'online') deviceStorage.setItem(choiceKey(id), 'online');
  else deviceStorage.removeItem(choiceKey(id));
}

export function currentMobilePresence(nowMs = Date.now()): PresenceUpdatePayload {
  const { user, settings } = useSessionStore.getState();
  const manual = settings.status && settings.status !== 'offline' ? settings.status : 'online';
  const explicitOnline = user && deviceStorage.getItem(choiceKey(user.id)) === 'online';
  const automaticIdle = background && manual === 'online' && !explicitOnline;
  return { ...selfPresencePayload(manual, settings.custom_status, automaticIdle, nowMs), background };
}

function choiceKey(userId: string): string {
  return `discordy.mobile-presence.online.${userId}`;
}
