import { getI18n } from '../../shared/i18n';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { BRAND } from '@shared/brand';
import { getRuntime } from '../../app/runtime';

/** Asks for confirmation, then closes settings and signs out. Shared by My account and the nav's Log out. */
export function confirmLogout(): void {
  const { t } = getI18n();
  useUiStore.getState().openDialog({
    kind: 'confirm',
    title: t("settings.logoutConfirm"),
    body: t("settings.logoutBody", { brand: BRAND.displayName }),
    confirmLabel: t("settings.logout"),
    danger: true,
    onConfirm: async () => {
      useUiStore.getState().openSettings(null);
      await getRuntime().session.logout();
    },
  });
}
