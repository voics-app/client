import { BRAND } from '../brand';
import { getRuntime } from '../runtime';
import { attempt, confirmDestructive } from '../ui/attempt';

/** Asks first, then signs out: shared by My account and the settings list, with desktop's wording. */
export function confirmLogout(): void {
  confirmDestructive('Log out?', `You will need to sign in again to use ${BRAND.displayName} on this device.`, 'Log out', () => void attempt(() => getRuntime().session.logout(), 'Could not log out'));
}
