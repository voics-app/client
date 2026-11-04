import type { PresenceStatus, User } from '@discordy/core/contracts/rest';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { assetCandidates } from '@discordy/core/domain/assets';
import { useConnectionStore } from '../../app/connectionStore';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';

const FULL_SIZE = 1024;

/** A profile's avatar; one with a picture opens full size in the viewer on click. */
export function ProfileAvatar({ user, size, status }: { user: User; size: number; status?: PresenceStatus | null }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const name = displayName(user);
  const avatar = <Avatar id={user.id} name={name} avatar={user.avatar} size={size} status={status} bot={user.bot} />;
  if (!user.avatar) return avatar;
  const [src = '', ...fallbacks] = assetCandidates(cdn, 'avatars', user.id, user.avatar, FULL_SIZE);
  const open = () => useLightboxStore.getState().open([{ kind: 'image', src, fallbacks, original: src, filename: `${name} avatar` }]);
  return (
    <button type="button" className="profile-avatar-button" aria-label={`View ${name}'s avatar`} onClick={open}>
      {avatar}
    </button>
  );
}
