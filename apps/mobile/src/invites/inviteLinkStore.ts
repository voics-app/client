import Constants from 'expo-constants';
import { create } from 'zustand';
import { instanceInviteCodes } from '@discordy/core/domain/inviteLinks';
import { BRAND } from '../brand';

interface InviteLinkState {
  /** The invite code of a link that was tapped, shown in the join sheet; null while nothing is open. */
  code: string | null;
  open(code: string): void;
  close(): void;
}

export const useInviteLinkStore = create<InviteLinkState>((set) => ({
  code: null,
  open: (code) => set({ code }),
  close: () => set({ code: null }),
}));

export const configuredApiUrl = (): string => {
  const value: unknown = Constants.expoConfig?.extra?.apiUrl;
  return typeof value === 'string' && value !== '' ? value : BRAND.apiUrl;
};

/**
 * Opens `url` in the join sheet when it is an invite link to this instance (its web invite page or a `voics://invite/` link); returns false for any other link.
 * `apiUrl` is the connection's origin, which decides which host counts as this instance; it defaults to the app's configured one.
 */
export function openInviteLink(url: string, apiUrl: string = configuredApiUrl()): boolean {
  const deep = new RegExp(`^${BRAND.protocolScheme}://invite/([A-Za-z0-9-]{2,32})/?$`, 'i').exec(url.trim());
  const code = deep?.[1] ?? instanceInviteCodes(url, apiUrl)[0];
  if (!code) return false;
  useInviteLinkStore.getState().open(code);
  return true;
}
