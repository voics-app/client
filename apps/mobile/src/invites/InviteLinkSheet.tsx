import { JoinServerSheet } from './JoinServerSheet';
import { useInviteLinkStore } from './inviteLinkStore';

/** The join sheet for a tapped invite link, mounted once in the root layout so any link in any chat can open it. */
export function InviteLinkSheet() {
  const code = useInviteLinkStore((s) => s.code);
  const guildId = useInviteLinkStore((s) => s.guildId);
  const close = useInviteLinkStore((s) => s.close);
  return <JoinServerSheet visible={code !== null || guildId !== null} {...(code ? { initialCode: code } : {})} {...(guildId ? { initialGuildId: guildId } : {})} onClose={close} />;
}
