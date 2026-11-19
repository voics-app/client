import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';

export function openIntegrationAudit(guildId: string, id: string, name: string) {
  if (useUnsavedStore.getState().requestLeave()) useUiStore.getState().openSettings({ kind: 'server', guildId, tab: 'audit', auditTarget: { id, name } });
}
