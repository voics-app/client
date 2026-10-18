import { Check, ChatCircle, UserPlus, UsersThree, X } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { usePresenceStore, useRelationshipStore } from '@renderer/application/stores/peopleStores';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { RelationshipType, type Relationship } from '@shared/contracts/rest';
import { attempt, errorMessage } from '../../app/actions';
import { openChannel } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Form';
import { IconButton } from '../../shared/ui/IconButton';
import { Count, EmptyState } from '../../shared/ui/Misc';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

function FriendRow({ rel, tab }: { rel: Relationship; tab: Tab }) {
  const status = usePresenceStore((s) => s.byUser[rel.id]?.status ?? 'offline');
  const openDialog = useUiStore((s) => s.openDialog);
  const api = getRuntime().api;
  const name = rel.nickname || displayName(rel.user);
  const message = async () => {
    const channel = await attempt(() => api.openPrivateChannel([rel.id]), 'Could not open conversation');
    if (channel) {
      useGuildStore.getState().upsertChannel(channel);
      openChannel(channel.id);
    }
  };
  return (
    <li className="friend-row">
      <button type="button" className="friend-id" onClick={() => openDialog({ kind: 'profile', userId: rel.id, guildId: null })}>
        <Avatar id={rel.id} name={name} avatar={rel.user.avatar} size={38} status={tab === 'blocked' ? null : status} />
        <span className="friend-copy">
          <span className="friend-name">{name}</span>
          <span className="friend-sub">{rel.type === RelationshipType.INCOMING ? 'Incoming friend request' : rel.type === RelationshipType.OUTGOING ? 'Outgoing friend request' : rel.type === RelationshipType.BLOCKED ? 'Blocked' : status === 'offline' ? 'Offline' : status[0]!.toUpperCase() + status.slice(1)}</span>
        </span>
      </button>
      <span className="friend-actions">
        {rel.type === RelationshipType.FRIEND && <IconButton label="Message" onClick={() => void message()}><ChatCircle size={20} weight="fill" /></IconButton>}
        {rel.type === RelationshipType.INCOMING && <IconButton label="Accept" tone="accent" onClick={() => void attempt(() => api.putRelationship(rel.id), 'Could not accept')}><Check size={20} weight="bold" /></IconButton>}
        <IconButton label={rel.type === RelationshipType.BLOCKED ? 'Unblock' : rel.type === RelationshipType.FRIEND ? 'Remove friend' : 'Decline'} tone="danger" onClick={() => void attempt(() => api.deleteRelationship(rel.id), 'Could not update')}><X size={20} weight="bold" /></IconButton>
      </span>
    </li>
  );
}

function AddFriend() {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await getRuntime().api.putRelationship('@me', { username: username.trim() });
      setResult({ ok: true, text: `Friend request sent to ${username.trim()}.` });
      setUsername('');
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="add-friend" onSubmit={submit}>
      <h2>Add friend</h2>
      <p>You can add people with their Discordy username.</p>
      <div className="add-friend-row">
        <Input aria-label="Username" data-autofocus placeholder="Enter a username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Button type="submit" variant="primary" loading={busy} disabled={username.trim().length < 2}>Send request</Button>
      </div>
      {result && <p className={`add-friend-result${result.ok ? ' is-ok' : ' is-bad'}`} role="status">{result.text}</p>}
    </form>
  );
}

export function FriendsView() {
  const [tab, setTab] = useState<Tab>('online');
  const byUser = useRelationshipStore((s) => s.byUser);
  const presence = usePresenceStore((s) => s.byUser);
  const all = Object.values(byUser);
  const friends = all.filter((r) => r.type === RelationshipType.FRIEND);
  const pending = all.filter((r) => r.type === RelationshipType.INCOMING || r.type === RelationshipType.OUTGOING);
  const blocked = all.filter((r) => r.type === RelationshipType.BLOCKED);
  const online = friends.filter((r) => (presence[r.id]?.status ?? 'offline') !== 'offline');
  const list = tab === 'online' ? online : tab === 'all' ? friends : tab === 'pending' ? pending : blocked;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'online', label: 'Online' },
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending', count: pending.filter((r) => r.type === RelationshipType.INCOMING).length },
    { id: 'blocked', label: 'Blocked' },
  ];
  return (
    <section className="friends" aria-label="Friends">
      <header className="channel-header">
        <div className="channel-header-title"><UsersThree size={22} className="channel-header-icon" /><h1>Friends</h1></div>
        <nav className="friends-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label} <Count value={t.count ?? 0} tone="danger" />
            </button>
          ))}
          <button type="button" role="tab" aria-selected={tab === 'add'} className={`add-tab${tab === 'add' ? ' is-on' : ''}`} onClick={() => setTab('add')}><UserPlus size={15} /> Add friend</button>
        </nav>
      </header>
      {tab === 'add' ? (
        <AddFriend />
      ) : list.length === 0 ? (
        <EmptyState icon={<UsersThree size={36} weight="light" />} title={tab === 'online' ? 'No friends online' : tab === 'pending' ? 'No pending requests' : tab === 'blocked' ? 'Nobody is blocked' : 'No friends yet'} body="Add friends by username to chat, call and share screens." action={<Button variant="primary" onClick={() => setTab('add')}>Add a friend</Button>} />
      ) : (
        <ul className="friend-list">
          <li className="friend-heading">{list.length} {tab}</li>
          {list.map((r) => <FriendRow key={r.id} rel={r} tab={tab} />)}
        </ul>
      )}
    </section>
  );
}
