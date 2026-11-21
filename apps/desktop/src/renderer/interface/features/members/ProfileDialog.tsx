import { useI18n } from '../../shared/i18n';
import { Chat, Copy, Flag, Phone, Fingerprint, UserMinus, UserPlus, Prohibit } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { RelationshipType, type User } from '@discordy/core/contracts/rest';
import { attempt, copyText, reportError } from '../../app/actions';
import { callUser } from '../../app/callActions';
import { openChannel } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { StatusLine } from './StatusLine';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { FriendsSince } from './FriendsSince';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileBanner } from './ProfileBanner';
import { RolePills } from './RolePills';
import { useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { saveUserNote } from '@discordy/core/application/notificationSync';
import { Modal } from '../../shared/ui/Modal';
import { Skeleton } from '../../shared/ui/Misc';

function SafetyNumber({ userId }: { userId: string }) {
  const { t: msg } = useI18n();
  const [groups, setGroups] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const rt = getRuntime();
    void rt.api
      .listUserDevices(userId)
      .then((devices) => {
        const first = devices[0];
        if (!first) throw new Error(msg("settings.profiledialog.this.person.has.no.encryption.capable.device.yet"));
        return rt.privacy.p2p.safetyNumber(userId, first.device_id);
      })
      .then((g) => alive && setGroups(g))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : msg("settings.profiledialog.unavailable")));
    return () => {
      alive = false;
    };
  }, [userId, msg]);
  return (
    <section className="profile-section">
      <h4><Fingerprint size={14} /> {msg("settings.profiledialog.safety.number")}</h4>
      {groups ? (
        <p className="safety-number mono selectable">{groups.map((g, i) => <span key={i}>{g}</span>)}</p>
      ) : (
        <p className="setting-desc">{error ?? msg("settings.profiledialog.computing")}</p>
      )}
      <p className="setting-desc">{msg("settings.profiledialog.compare.this.number.with.theirs.over.another.channel.if")}</p>
    </section>
  );
}

function Mutuals({ userId }: { userId: string }) {
  const { t: msg } = useI18n();
  const query = useQuery({ queryKey: ['user-profile', userId], queryFn: () => getRuntime().api.userProfile(userId), staleTime: 60_000 });
  const guilds = useGuildStore((s) => s.guilds);
  if (!query.data) return null;
  const { mutual_guilds: servers, mutual_friends: friends } = query.data;
  return (
    <>
      <section className="profile-section" aria-label={msg("settings.profiledialog.mutual.servers")}>
        <h4>{msg('profile.mutualServers', { count: servers.length })}</h4>
        {servers.length === 0 ? <p className="setting-desc">{msg("settings.profiledialog.no.servers.in.common")}</p> : (
          <ul className="mutual-list">{servers.map((g) => <li key={g.id}>{guilds[g.id]?.name ?? msg("settings.profiledialog.server")}{g.nick ? <span className="setting-desc"> {msg('profile.asNickname', { name: g.nick })}</span> : null}</li>)}</ul>
        )}
      </section>
      <section className="profile-section" aria-label={msg("settings.profiledialog.mutual.friends")}>
        <h4>{msg('profile.mutualFriends', { count: friends.length })}</h4>
        {friends.length === 0 ? <p className="setting-desc">{msg("settings.profiledialog.no.friends.in.common")}</p> : (
          <ul className="mutual-list">{friends.map((f) => <li key={f.id}><Avatar id={f.id} name={displayName(f)} avatar={f.avatar} size={20} /> {displayName(f)}</li>)}</ul>
        )}
      </section>
    </>
  );
}

export function ProfileDialog({ userId, guildId }: { userId: string; guildId: string | null }) {
  const { t: msg } = useI18n();
  const { locale } = useI18n();
  const close = () => useUiStore.getState().openDialog(null);
  const me = useSessionStore((s) => s.user);
  const developerMode = usePrefsStore((s) => s.developerMode);
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[userId] : undefined));
  const status = usePresenceStore((s) => s.byUser[userId]?.status ?? 'offline');
  const activities = usePresenceStore((s) => s.byUser[userId]?.activities);
  const relationship = useRelationshipStore((s) => s.byUser[userId]);
  const query = useQuery({ queryKey: ['user', userId], queryFn: () => getRuntime().api.user(userId), initialData: member?.user as User | undefined, staleTime: 60_000 });
  const user = query.data;
  const isMe = me?.id === userId;
  const note = useUserNotesStore((s) => s.byUser[userId] ?? '');

  const message = async () => {
    const channel = await attempt(() => getRuntime().api.openPrivateChannel([userId]), msg("friends.openFailed"));
    if (channel) {
      useGuildStore.getState().upsertChannel(channel);
      close();
      openChannel(channel.id);
    }
  };
  const addFriend = () => user && void attempt(() => getRuntime().api.putRelationship(userId, user.username ? { username: user.username } : undefined), msg("settings.profiledialog.could.not.send.request"));
  const block = () => void attempt(() => getRuntime().api.putRelationship(userId, { type: RelationshipType.BLOCKED }), msg("settings.profiledialog.could.not.block"));
  const report = () => useUiStore.getState().openDialog({ kind: 'report', target: { kind: 'user', userId, userName: user ? displayName(user, member?.nick) : msg("settings.profiledialog.this.user") } });
  const removeFriend = () => void attempt(() => getRuntime().api.deleteRelationship(userId), msg("friends.updateFailed"));

  return (
    <Modal open onClose={close} bare width={480}>
      {!user ? (
        <div className="profile-skeleton"><Skeleton height={96} radius={0} /><Skeleton width={160} height={20} /></div>
      ) : (
        <div className="profile">
          <ProfileBanner user={user} member={member} guildId={guildId} />
          <div className="profile-head">
            <ProfileAvatar user={user} member={member} guildId={guildId} size={84} status={status} />
            <div className="profile-names">
              <h2 dir="auto">{displayName(user, member?.nick)}</h2>
              <p className="mono" dir="auto">{user.username}</p>
              {user.pronouns && <p dir="auto">{user.pronouns}</p>}
              <StatusLine className="profile-status" activities={activities} />
            </div>
          </div>
          <div className="profile-body">
            {!isMe && (
              <div className="profile-actions">
                <Button variant="primary" icon={<Chat size={16} weight="fill" />} onClick={() => void message()}>{msg("common.message")}</Button>
                <Button icon={<Phone size={16} weight="fill" />} onClick={() => { close(); void callUser(userId); }}>{msg("settings.profiledialog.call")}</Button>
                {relationship?.type === RelationshipType.FRIEND ? (
                  <Button icon={<UserMinus size={16} />} onClick={removeFriend}>{msg("friends.remove")}</Button>
                ) : relationship?.type === RelationshipType.OUTGOING ? (
                  <Button disabled>{msg("settings.profiledialog.request.sent")}</Button>
                ) : (
                  <Button icon={<UserPlus size={16} />} onClick={addFriend}>{msg("friends.add")}</Button>
                )}
                <Button variant="ghost" icon={<Prohibit size={16} />} onClick={relationship?.type === RelationshipType.BLOCKED ? removeFriend : block}>{relationship?.type === RelationshipType.BLOCKED ? msg("friends.unblock") : msg("settings.profiledialog.block")}</Button>
                <Button variant="ghost" icon={<Flag size={16} />} onClick={report}>{msg("settings.profiledialog.report")}</Button>
              </div>
            )}
            {(member?.bio || user.bio) && (
              <section className="profile-section"><h4>{msg("settings.profileeditor.about.me")}</h4><p className="selectable" dir="auto">{member?.bio || user.bio}</p></section>
            )}
            {guildId && member && (
              <section className="profile-section">
                <h4>{msg("settings.profiledialog.roles")}</h4>
                <RolePills guildId={guildId} userId={userId} editable />
              </section>
            )}
            {!isMe && (
              <section className="profile-section">
                <h4>{msg("settings.profiledialog.note")}</h4>
                <textarea className="input" aria-label={msg("settings.profiledialog.note")} rows={2} maxLength={256} defaultValue={note} placeholder={msg("settings.profiledialog.click.to.add.a.note.only.visible.to.you")} onBlur={(e) => e.target.value.trim() !== note && void saveUserNote(getRuntime().api, userId, e.target.value.trim()).catch((err) => reportError(err, msg("settings.profiledialog.could.not.save.note")))} />
              </section>
            )}
            {!isMe && !user.bot && <Mutuals userId={userId} />}
            {!isMe && <FriendsSince userId={userId} />}
            {member?.joined_at && <section className="profile-section"><h4>{msg("settings.profiledialog.member.since")}</h4><p>{new Date(member.joined_at).toLocaleDateString(locale, { dateStyle: 'long' })}</p></section>}
            {!isMe && <SafetyNumber userId={userId} />}
            {developerMode && <button type="button" className="link-btn" onClick={() => void copyText(user.id, msg("settings.profiledialog.user.id.copied"))}><Copy size={13} /> {msg("settings.profiledialog.copy.user.id")}</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
