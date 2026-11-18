import { useI18n } from '../../shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { FriendsSince } from '../members/FriendsSince';
import { ProfileAvatar } from '../members/ProfileAvatar';
import { ProfileBanner } from '../members/ProfileBanner';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Skeleton } from '../../shared/ui/Misc';

/** Side panel with the profile of the person in a 1:1 DM: bio, mutual servers and friends. */
export function DmProfilePanel({ channelId }: { channelId: string }) {
  const { t: msg } = useI18n();
  const peer = useGuildStore((s) => s.channels[channelId]?.recipients?.[0]);
  const status = usePresenceStore((s) => (peer ? s.byUser[peer.id]?.status : undefined) ?? 'offline');
  const guilds = useGuildStore((s) => s.guilds);
  const profile = useQuery({ queryKey: ['user-profile', peer?.id], queryFn: () => getRuntime().api.userProfile(peer!.id), enabled: Boolean(peer), staleTime: 60_000 });
  const user = useQuery({ queryKey: ['user', peer?.id], queryFn: () => getRuntime().api.user(peer!.id), initialData: peer as User | undefined, enabled: Boolean(peer), staleTime: 60_000 });
  if (!peer) return <p className="panel-note">{msg("settings.dmprofilepanel.no.profile.to.show")}</p>;
  const u = user.data ?? peer;
  return (
    <div className="panel-body dm-profile">
      <ProfileBanner user={u} />
      <div className="dm-profile-head">
        <ProfileAvatar user={u} size={72} status={status} />
        <h3>{displayName(u)}</h3>
        <p className="mono">{u.username}</p>
        {u.pronouns && <p>{u.pronouns}</p>}
      </div>
      {u.bio && <section className="profile-section"><h4>{msg("settings.profileeditor.about.me")}</h4><p className="selectable">{u.bio}</p></section>}
      <FriendsSince userId={u.id} />
      {profile.isLoading && <Skeleton height={48} />}
      {profile.data && (
        <>
          <section className="profile-section" aria-label={msg("settings.profiledialog.mutual.servers")}>
            <h4>{msg('panels.mutualServers', { count: profile.data.mutual_guilds.length })}</h4>
            {profile.data.mutual_guilds.length === 0 ? <p className="setting-desc">{msg("settings.profiledialog.no.servers.in.common")}</p> : <ul className="mutual-list">{profile.data.mutual_guilds.map((g) => <li key={g.id}>{guilds[g.id]?.name ?? msg("settings.profiledialog.server")}</li>)}</ul>}
          </section>
          <section className="profile-section" aria-label={msg("settings.profiledialog.mutual.friends")}>
            <h4>{msg('panels.mutualFriends', { count: profile.data.mutual_friends.length })}</h4>
            {profile.data.mutual_friends.length === 0 ? <p className="setting-desc">{msg("settings.profiledialog.no.friends.in.common")}</p> : <ul className="mutual-list">{profile.data.mutual_friends.map((f) => <li key={f.id}><Avatar id={f.id} name={displayName(f)} avatar={f.avatar} size={20} /> {displayName(f)}</li>)}</ul>}
          </section>
        </>
      )}
      <Button block onClick={() => useUiStore.getState().openDialog({ kind: 'profile', userId: u.id, guildId: null })}>{msg("settings.dmprofilepanel.view.full.profile")}</Button>
    </div>
  );
}
