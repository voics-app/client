import { Chat, Copy, Fingerprint, UserMinus, UserPlus, Prohibit } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePresenceStore, useRelationshipStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { RelationshipType, type User } from '@shared/contracts/rest';
import { attempt, copyText } from '../../app/actions';
import { openChannel } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { RolePills } from './RolePills';
import { useLocalPeopleStore } from '@renderer/application/stores/localPeopleStore';
import { Modal } from '../../shared/ui/Modal';
import { Skeleton } from '../../shared/ui/Misc';

function SafetyNumber({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const rt = getRuntime();
    void rt.api
      .listUserDevices(userId)
      .then((devices) => {
        const first = devices[0];
        if (!first) throw new Error('This person has no encryption-capable device yet.');
        return rt.privacy.p2p.safetyNumber(userId, first.device_id);
      })
      .then((g) => alive && setGroups(g))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Unavailable'));
    return () => {
      alive = false;
    };
  }, [userId]);
  return (
    <section className="profile-section">
      <h4><Fingerprint size={14} /> Safety number</h4>
      {groups ? (
        <p className="safety-number mono selectable">{groups.map((g, i) => <span key={i}>{g}</span>)}</p>
      ) : (
        <p className="setting-desc">{error ?? 'Computing'}</p>
      )}
      <p className="setting-desc">Compare this number with theirs over another channel. If it matches, no one is intercepting your encrypted chats.</p>
    </section>
  );
}

export function ProfileDialog({ userId, guildId }: { userId: string; guildId: string | null }) {
  const close = () => useUiStore.getState().openDialog(null);
  const me = useSessionStore((s) => s.user);
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[userId] : undefined));
  const status = usePresenceStore((s) => s.byUser[userId]?.status ?? 'offline');
  const relationship = useRelationshipStore((s) => s.byUser[userId]);
  const query = useQuery({ queryKey: ['user', userId], queryFn: () => getRuntime().api.user(userId), initialData: member?.user as User | undefined, staleTime: 60_000 });
  const user = query.data;
  const isMe = me?.id === userId;
  const note = useLocalPeopleStore((s) => s.notes[userId] ?? '');

  const message = async () => {
    const channel = await attempt(() => getRuntime().api.openPrivateChannel([userId]), 'Could not open conversation');
    if (channel) {
      useGuildStore.getState().upsertChannel(channel);
      close();
      openChannel(channel.id);
    }
  };
  const addFriend = () => user && void attempt(() => getRuntime().api.putRelationship(userId, user.username ? { username: user.username } : undefined), 'Could not send request');
  const block = () => void attempt(() => getRuntime().api.putRelationship(userId, { type: RelationshipType.BLOCKED }), 'Could not block');
  const removeFriend = () => void attempt(() => getRuntime().api.deleteRelationship(userId), 'Could not update');

  return (
    <Modal open onClose={close} bare width={480}>
      {!user ? (
        <div className="profile-skeleton"><Skeleton height={96} radius={0} /><Skeleton width={160} height={20} /></div>
      ) : (
        <div className="profile">
          <div className="profile-banner" style={user.accent_color ? { background: `#${user.accent_color.toString(16).padStart(6, '0')}` } : undefined} />
          <div className="profile-head">
            <Avatar id={user.id} name={displayName(user)} avatar={user.avatar} size={84} status={status} bot={user.bot} />
            <div className="profile-names">
              <h2>{displayName(user, member?.nick)}</h2>
              <p className="mono">{user.username}</p>
            </div>
          </div>
          <div className="profile-body">
            {!isMe && (
              <div className="profile-actions">
                <Button variant="primary" icon={<Chat size={16} weight="fill" />} onClick={() => void message()}>Message</Button>
                {relationship?.type === RelationshipType.FRIEND ? (
                  <Button icon={<UserMinus size={16} />} onClick={removeFriend}>Remove friend</Button>
                ) : relationship?.type === RelationshipType.OUTGOING ? (
                  <Button disabled>Request sent</Button>
                ) : (
                  <Button icon={<UserPlus size={16} />} onClick={addFriend}>Add friend</Button>
                )}
                <Button variant="ghost" icon={<Prohibit size={16} />} onClick={relationship?.type === RelationshipType.BLOCKED ? removeFriend : block}>{relationship?.type === RelationshipType.BLOCKED ? 'Unblock' : 'Block'}</Button>
              </div>
            )}
            {user.bio && (
              <section className="profile-section"><h4>About me</h4><p className="selectable">{user.bio}</p></section>
            )}
            {guildId && member && (
              <section className="profile-section">
                <h4>Roles</h4>
                <RolePills guildId={guildId} userId={userId} editable />
              </section>
            )}
            {!isMe && (
              <section className="profile-section">
                <h4>Note</h4>
                <textarea className="input" aria-label="Note" rows={2} maxLength={256} defaultValue={note} placeholder="Click to add a note (only visible to you)" onChange={(e) => useLocalPeopleStore.getState().setNote(userId, e.target.value)} />
              </section>
            )}
            {member?.joined_at && <section className="profile-section"><h4>Member since</h4><p>{new Date(member.joined_at).toLocaleDateString([], { dateStyle: 'long' })}</p></section>}
            {!isMe && <SafetyNumber userId={userId} />}
            <button type="button" className="link-btn" onClick={() => void copyText(user.id, 'User ID copied')}><Copy size={13} /> Copy user ID</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
