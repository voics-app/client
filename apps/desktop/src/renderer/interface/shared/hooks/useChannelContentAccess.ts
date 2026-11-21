import { getAgeRestrictedAccess, isAgeRestrictedChannelVisible } from '@discordy/core/application/ageRestrictedAccess';
import { useAgeRestrictedStore } from '@discordy/core/application/stores/ageRestrictedStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

export function useChannelContentAccess() {
  useAgeRestrictedStore();
  useGuildStore((s) => s.channels);
  useSessionStore();
  return {
    access: (id: string) => getAgeRestrictedAccess(id),
    canShow: (id: string) => getAgeRestrictedAccess(id).kind === 'open',
    visible: (id: string) => isAgeRestrictedChannelVisible(id),
  };
}
