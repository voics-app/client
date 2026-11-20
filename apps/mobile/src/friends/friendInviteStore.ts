import { create } from 'zustand';

export const useFriendInviteStore = create<{ token: string | null; set(token: string | null): void }>((set) => ({
  token: null,
  set: (token) => set({ token }),
}));

export function isFriendInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}
