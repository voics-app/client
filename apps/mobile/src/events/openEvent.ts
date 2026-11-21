import { router } from 'expo-router';

export function openEvent(guildId: string, eventId?: string): void {
  router.push({ pathname: '/servers/[guildId]/events', params: eventId ? { guildId, eventId } : { guildId } });
}
