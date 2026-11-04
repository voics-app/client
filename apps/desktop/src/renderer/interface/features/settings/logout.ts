import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { BRAND } from '@shared/brand';
import { getRuntime } from '../../app/runtime';

/** Asks for confirmation, then closes settings and signs out. Shared by My account and the nav's Log out. */
export function confirmLogout(): void {
  useUiStore.getState().openDialog({
    kind: 'confirm',
    title: 'Log out?',
    body: `You will need to sign in again to use ${BRAND.displayName} on this device.`,
    confirmLabel: 'Log out',
    danger: true,
    onConfirm: async () => {
      useUiStore.getState().openSettings(null);
      await getRuntime().session.logout();
    },
  });
}
