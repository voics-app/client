import type { GuildMember, User } from '@discordy/core/contracts/rest';
import { profileBackground, profileImageCandidates } from '@discordy/core/domain/profile';
import { useConnectionStore } from '../../app/connectionStore';
import { AssetImage } from '../../shared/ui/AssetImage';

export function ProfileBanner({ user, member, guildId, preview }: { user: User; member?: GuildMember; guildId?: string | null; preview?: string }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const sources = preview ? [preview] : profileImageCandidates(cdn, user, 'banners', member, guildId, 1024);
  return <div className="profile-banner" style={{ background: profileBackground(user) }}>
    {sources.length > 0 && <AssetImage candidates={sources} />}
    {user.theme_colors && <span className="profile-theme-strip" style={{ background: profileBackground(user) }} />}
  </div>;
}
