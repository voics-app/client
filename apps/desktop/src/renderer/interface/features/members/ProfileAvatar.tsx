import type { GuildMember, PresenceStatus, User } from '@discordy/core/contracts/rest';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { profileImageCandidates } from '@discordy/core/domain/profile';
import { useConnectionStore } from '../../app/connectionStore';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';

const FULL_SIZE = 1024;

/** A profile's avatar; one with a picture opens full size in the viewer on click. */
export function ProfileAvatar({ user, size, status, member, guildId }: { user: User; size: number; status?: PresenceStatus | null; member?: GuildMember; guildId?: string | null }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const name = displayName(user);
  const candidates = profileImageCandidates(cdn, user, 'avatars', member, guildId, FULL_SIZE);
  const avatar = <Avatar id={user.id} name={name} sources={candidates} size={size} status={status} bot={user.bot} />;
  if (!candidates.length) return avatar;
  const [src = '', ...fallbacks] = candidates;
  const open = () => useLightboxStore.getState().open([{ kind: 'image', src, fallbacks, original: src, filename: `${name} avatar` }]);
  return (
    <button type="button" className="profile-avatar-button" aria-label={`View ${name}'s avatar`} onClick={open}>
      {avatar}
    </button>
  );
}
