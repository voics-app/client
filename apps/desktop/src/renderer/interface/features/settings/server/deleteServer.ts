import { getI18n } from '../../../shared/i18n';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { deleteGuild } from '../../../app/actions';

/** One owner-only confirmation, shared by the server menu and settings navigation. */
export function confirmDeleteServer(guildId: string): void {
  const { t } = getI18n();
  const guild = useGuildStore.getState().guilds[guildId];
  if (!guild || guild.owner_id !== useSessionStore.getState().user?.id) return;
  useUiStore.getState().openDialog({
    kind: 'confirm',
    title: t("common.deleteConfirm", { name: guild.name }),
    body: t("settings.deleteServerBody"),
    confirmLabel: t("settings.deleteServer"),
    confirmText: guild.name,
    danger: true,
    onConfirm: async () => {
      await deleteGuild(guildId);
      useUiStore.getState().openSettings(null);
    },
  });
}
