import { useQuery } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { User } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Skeleton } from '../../shared/ui/Misc';

/** Side panel with the profile of the person in a 1:1 DM: bio, mutual servers and friends. */
export function DmProfilePanel({ channelId }: { channelId: string }) {
  const peer = useGuildStore((s) => s.channels[channelId]?.recipients?.[0]);
  const status = usePresenceStore((s) => (peer ? s.byUser[peer.id]?.status : undefined) ?? 'offline');
  const guilds = useGuildStore((s) => s.guilds);
  const profile = useQuery({ queryKey: ['user-profile', peer?.id], queryFn: () => getRuntime().api.userProfile(peer!.id), enabled: Boolean(peer), staleTime: 60_000 });
  const user = useQuery({ queryKey: ['user', peer?.id], queryFn: () => getRuntime().api.user(peer!.id), initialData: peer as User | undefined, enabled: Boolean(peer), staleTime: 60_000 });
  if (!peer) return <p className="panel-note">No profile to show.</p>;
  const u = user.data ?? peer;
  return (
    <div className="panel-body dm-profile">
      <div className="dm-profile-head">
        <Avatar id={u.id} name={displayName(u)} avatar={u.avatar} size={72} status={status} bot={u.bot} />
        <h3>{displayName(u)}</h3>
        <p className="mono">{u.username}</p>
      </div>
      {u.bio && <section className="profile-section"><h4>About me</h4><p className="selectable">{u.bio}</p></section>}
      {profile.isLoading && <Skeleton height={48} />}
      {profile.data && (
        <>
          <section className="profile-section" aria-label="Mutual servers">
            <h4>Mutual servers - {profile.data.mutual_guilds.length}</h4>
            {profile.data.mutual_guilds.length === 0 ? <p className="setting-desc">No servers in common.</p> : <ul className="mutual-list">{profile.data.mutual_guilds.map((g) => <li key={g.id}>{guilds[g.id]?.name ?? 'Server'}</li>)}</ul>}
          </section>
          <section className="profile-section" aria-label="Mutual friends">
            <h4>Mutual friends - {profile.data.mutual_friends.length}</h4>
            {profile.data.mutual_friends.length === 0 ? <p className="setting-desc">No friends in common.</p> : <ul className="mutual-list">{profile.data.mutual_friends.map((f) => <li key={f.id}><Avatar id={f.id} name={displayName(f)} avatar={f.avatar} size={20} /> {displayName(f)}</li>)}</ul>}
          </section>
        </>
      )}
      <Button block onClick={() => useUiStore.getState().openDialog({ kind: 'profile', userId: u.id, guildId: null })}>View full profile</Button>
    </div>
  );
}
