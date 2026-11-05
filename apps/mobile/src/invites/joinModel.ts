import type { Invite } from '@discordy/core/contracts/rest';
import { isInviteCode, parseInviteCode } from '@discordy/core/domain/inviteLinks';

const LINK_OR_CODE = /^[\w.:/?#=&%~+@-]+$/;

/** The invite code in what the user typed or pasted (a bare code, a web invite link or a deep link), or null when it cannot be a code. */
export function inviteCodeOf(input: string): string | null {
  const text = input.trim();
  // Core reads the tail of the text, so "two words" would pass as "words"; only a single link or code is accepted.
  if (!LINK_OR_CODE.test(text)) return null;
  const code = parseInviteCode(text);
  return isInviteCode(code) ? code : null;
}

export interface InvitePreview {
  name: string;
  /** "12 members, 3 online"; a count the server did not send shows as "?". */
  people: string;
  guildId: string | null;
}

export function invitePreview(invite: Invite): InvitePreview {
  const count = (n: number | undefined) => (n === undefined ? '?' : String(n));
  return {
    name: invite.guild?.name ?? 'this server',
    people: `${count(invite.approximate_member_count)} members, ${count(invite.approximate_presence_count)} online`,
    guildId: invite.guild?.id ?? null,
  };
}
