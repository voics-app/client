import { useI18n } from '../../../shared/i18n';
import type { GuildMember, User } from '@discordy/core/contracts/rest';
import { profileImageCandidates } from '@discordy/core/domain/profile';
import { useConnectionStore } from '../../../app/connectionStore';
import { displayName } from '../../../shared/hooks/useNames';
import { Avatar } from '../../../shared/ui/Avatar';
import { ProfileBanner } from '../../members/ProfileBanner';

export function ProfilePreview({ user, member, guildId, avatarUpload, bannerUpload }: { user: User; member?: GuildMember; guildId?: string; avatarUpload?: string; bannerUpload?: string }) {
  const { t: msg } = useI18n();
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const name = displayName(user, member?.nick);
  const bio = member?.bio || user.bio;
  const avatar = avatarUpload ? [avatarUpload] : profileImageCandidates(cdn, user, 'avatars', member, guildId);
  return <section className="profile-preview" aria-label={msg("settings.profilepreview.live.profile.preview")}>
    <h2 className="profile-preview-title">{msg("settings.usertabs.preview")}</h2>
    <div className="profile profile-preview-card">
      <ProfileBanner user={user} member={member} guildId={guildId} preview={bannerUpload} />
      <div className="profile-head">
        <Avatar id={user.id} name={name} size={72} sources={avatar} />
        <div className="profile-names"><h2>{name}</h2><p>{user.username}</p>{user.pronouns && <p>{user.pronouns}</p>}</div>
      </div>
      <div className="profile-body"><section className="profile-section"><h4>{msg("settings.profileeditor.about.me")}</h4><p className="selectable">{bio || msg("settings.profilepreview.your.about.me.will.appear.here")}</p></section></div>
    </div>
    {guildId && <p className="field-hint">{msg("settings.profilepreview.pronouns.and.theme.colours.come.from.your.global.profile")}</p>}
  </section>;
}
