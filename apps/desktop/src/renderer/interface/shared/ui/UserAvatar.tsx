import type { ComponentProps } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { GuildMember } from '@discordy/core/contracts/rest';
import { profileImageCandidates } from '@discordy/core/domain/profile';
import { useConnectionStore } from '../../app/connectionStore';
import { Avatar } from './Avatar';

type Props = Omit<ComponentProps<typeof Avatar>, 'sources' | 'kind'> & {
  guildId?: string | null;
  member?: GuildMember;
};

/** User pictures follow explicit server context; DMs and account controls stay global. */
export function UserAvatar({ guildId, member, ...props }: Props) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const stored = useGuildStore((s) => guildId && props.id ? s.members[guildId]?.[props.id] : undefined);
  const sources = guildId && props.id
    ? profileImageCandidates(cdn, { id: props.id, avatar: props.avatar ?? null }, 'avatars', stored ?? member, guildId, 128)
    : undefined;
  return <Avatar {...props} sources={sources} />;
}
