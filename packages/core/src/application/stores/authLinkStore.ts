/** A reset-password or verify-email link that arrived while nobody is signed in, waiting for the sign-in screen to take it. */
import { create } from 'zustand';
import type { AuthLink } from '../../domain/authLinks';

export interface AuthLinkState {
  link: AuthLink | null;
  set(link: AuthLink): void;
  /** Returns the waiting link and forgets it. */
  take(): AuthLink | null;
}

export const useAuthLinkStore = create<AuthLinkState>((set, get) => ({
  link: null,
  set: (link) => set({ link }),
  take: () => {
    const link = get().link;
    if (link) set({ link: null });
    return link;
  },
}));
