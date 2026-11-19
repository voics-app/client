import { Check, ChatCircle, MagnifyingGlass, Phone, Star, UserPlus, UsersThree, VideoCamera, X } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { useFavouriteFriendsStore, usePresenceStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { activeNow, buildFriendsView, friendRequestError, type FriendsTab as Tab } from '@discordy/core/domain/friendsModel';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { RelationshipType, type Relationship } from '@discordy/core/contracts/rest';
import { attempt, copyText, errorMessage } from '../../app/actions';
import { callUser } from '../../app/callActions';
import { openChannel } from '../../app/navigation';
import { openVoiceChannel } from '../../app/voiceActions';
import { useChannelPermissions, can } from '../../shared/hooks/usePermissions';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Form';
import { IconButton } from '../../shared/ui/IconButton';
import { Count, EmptyState } from '../../shared/ui/Misc';
import { UserMenuTarget } from '../members/UserContextMenu';
import { BRAND } from '@shared/brand';

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
  const isFriend = rel.type === RelationshipType.FRIEND;
  const favourite = useFavouriteFriendsStore((s) => s.ids.includes(rel.id));
  const toggleFavourite = async () => {
    const ok = await attempt(() => api.setFavouriteFriend(rel.id, !favourite).then(() => true), 'Could not update favourite');
    if (ok) {
      const store = useFavouriteFriendsStore.getState();
      store.set(favourite ? store.ids.filter((id) => id !== rel.id) : [...store.ids, rel.id]);
    }
  };
  return (
    <li className="friend-row">
      <UserMenuTarget userId={rel.id} name={name} guildId={null} user={rel.user}>
      <button type="button" className="friend-id" onClick={() => openDialog({ kind: 'profile', userId: rel.id, guildId: null })}>
        <Avatar id={rel.id} name={name} avatar={rel.user.avatar} size={38} status={tab === 'blocked' ? null : status} />
        <span className="friend-copy">
          <span className="friend-name">{name}</span>
          <span className="friend-sub">{rel.type === RelationshipType.INCOMING ? 'Incoming friend request' : rel.type === RelationshipType.OUTGOING ? 'Outgoing friend request' : rel.type === RelationshipType.BLOCKED ? 'Blocked' : status === 'offline' ? 'Offline' : status[0]!.toUpperCase() + status.slice(1)}</span>
        </span>
      </button>
      </UserMenuTarget>
      <span className="friend-actions">
        {isFriend && <IconButton label={favourite ? 'Remove favourite' : 'Add favourite'} onClick={() => void toggleFavourite()}><Star size={20} weight={favourite ? 'fill' : 'regular'} /></IconButton>}
        {isFriend && <IconButton label="Message" onClick={() => void message()}><ChatCircle size={20} weight="fill" /></IconButton>}
        {isFriend && <IconButton label="Voice call" onClick={() => void callUser(rel.id)}><Phone size={20} weight="fill" /></IconButton>}
        {isFriend && <IconButton label="Video call" onClick={() => void callUser(rel.id, true)}><VideoCamera size={20} weight="fill" /></IconButton>}
        {rel.type === RelationshipType.INCOMING && <IconButton label="Accept" tone="accent" onClick={() => void attempt(() => api.putRelationship(rel.id), 'Could not accept')}><Check size={20} weight="bold" /></IconButton>}
        <IconButton label={rel.type === RelationshipType.BLOCKED ? 'Unblock' : isFriend ? 'Remove friend' : rel.type === RelationshipType.OUTGOING ? 'Cancel request' : 'Ignore'} tone="danger" onClick={() => void attempt(() => api.deleteRelationship(rel.id), 'Could not update')}><X size={20} weight="bold" /></IconButton>
      </span>
    </li>
  );
}

function AddFriend() {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const createLink = async () => {
    const invite = await attempt(() => getRuntime().api.createFriendInvite(), 'Could not create friend invite');
    if (invite) setLink(`${BRAND.protocolScheme}://friend-invite/${invite.token}`);
  };
  const revokeLink = async () => {
    const ok = await attempt(() => getRuntime().api.revokeFriendInvites().then(() => true), 'Could not revoke friend invite');
    if (ok) setLink(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await getRuntime().api.sendFriendRequest(username.trim());
      setResult({ ok: true, text: `Friend request sent to ${username.trim()}.` });
      setUsername('');
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? friendRequestError(err.status, err.message, username.trim()) : errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="add-friend" onSubmit={submit}>
      <h2>Add friend</h2>
      <p>You can add people with their {BRAND.displayName} username.</p>
      <div className="add-friend-row">
        <Input aria-label="Username" data-autofocus placeholder="Enter a username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Button type="submit" variant="primary" loading={busy} disabled={username.trim().length < 2}>Send request</Button>
      </div>
      <h3>Friend invite link</h3>
      <p>Anyone with this link can send you a friend request. It expires after 24 hours; creating another link replaces it.</p>
      <div className="add-friend-row">
        <Button type="button" onClick={() => void createLink()}>Create link</Button>
        {link && <Button type="button" onClick={() => void copyText(link, 'Friend invite copied')}>Copy link</Button>}
        <Button type="button" onClick={() => void revokeLink()}>Revoke link</Button>
      </div>
      {link && <Input aria-label="Friend invite link" readOnly value={link} />}
      {result && <p className={`add-friend-result${result.ok ? ' is-ok' : ' is-bad'}`} role="status">{result.text}</p>}
    </form>
  );
}

function JoinActivityVoice({ channelId, guildId }: { channelId: string; guildId: string | null }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const permissions = useChannelPermissions(channelId);
  const connected = useVoiceStore((s) => s.call.channelId === channelId && s.call.status !== 'idle');
  // A presence alone does not grant access to another person's DM or server voice channel.
  if (!channel || !guildId || channel.guild_id !== guildId ||
    (channel.type !== ChannelType.GUILD_VOICE && channel.type !== ChannelType.GUILD_STAGE_VOICE) ||
    !can(permissions, Permission.VIEW_CHANNEL) || !can(permissions, Permission.CONNECT)) return null;
  return <Button size="sm" variant="ghost" disabled={connected} onClick={() => void openVoiceChannel(guildId, channelId)}>{connected ? 'Joined' : 'Join voice'}</Button>;
}

function ActiveNow({ friends }: { friends: Relationship[] }) {
  const voice = useVoiceStore((s) => s.states);
  const presence = usePresenceStore((s) => s.byUser);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const entries = activeNow(friends, voice, presence);
  return (
    <aside className="active-now" aria-label="Active Now">
      <h2>Active Now</h2>
      {entries.length === 0 ? (
        <p className="setting-desc">Friends' voice channels, activities and custom statuses appear here.</p>
      ) : (
        <ul>
          {entries.map((e) => {
            const name = e.rel.nickname || displayName(e.rel.user);
            const channel = e.channelId ? channels[e.channelId] : undefined;
            const guild = e.guildId ? guilds[e.guildId] : undefined;
            const where = e.kind === 'voice' ? `In voice${channel?.name ? ` · ${channel.name}` : ''}${guild ? ` · ${guild.name}` : ''}` : e.kind === 'playing' ? `Playing ${e.detail}` : e.detail;
            return (
              <li key={e.rel.id} className="active-now-card">
                <Avatar id={e.rel.id} name={name} avatar={e.rel.user.avatar} size={36} status={presence[e.rel.id]?.status ?? 'offline'} />
                <span className="friend-copy"><span className="friend-name">{name}</span><span className="friend-sub">{where}</span></span>
                {e.kind === 'voice' && e.channelId && <JoinActivityVoice channelId={e.channelId} guildId={e.guildId} />}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export function FriendsView() {
  const [tab, setTab] = useState<Tab>('online');
  const [query, setQuery] = useState('');
  const byUser = useRelationshipStore((s) => s.byUser);
  const favouriteIds = useFavouriteFriendsStore((s) => s.ids);
  const presence = usePresenceStore((s) => s.byUser);
  const all = Object.values(byUser);
  const view = buildFriendsView(all, presence, query);
  const total = buildFriendsView(all, presence);
  const { friends, online, incoming, outgoing, blocked } = view;
  const list = tab === 'online' ? online : tab === 'all' ? friends : tab === 'pending' ? [...incoming, ...outgoing] : blocked;
  const tabs: { id: Tab; label: string; count: number; tone: 'accent' | 'danger' }[] = [
    { id: 'online', label: 'Online', count: total.online.length, tone: 'accent' },
    { id: 'all', label: 'All', count: total.friends.length, tone: 'accent' },
    { id: 'pending', label: 'Pending', count: total.incoming.length + total.outgoing.length, tone: 'danger' },
    { id: 'blocked', label: 'Blocked', count: total.blocked.length, tone: 'accent' },
  ];
  const emptyTitle = tab === 'online' ? 'No friends online' : tab === 'pending' ? 'No pending requests' : tab === 'blocked' ? 'Nobody is blocked' : 'No friends yet';
  return (
    <section className="friends" aria-label="Friends">
      <header className="channel-header">
        <div className="channel-header-title"><UsersThree size={22} className="channel-header-icon" /><h1>Friends</h1></div>
        <nav className="friends-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label} <Count value={t.count} tone={t.tone} />
            </button>
          ))}
          <button type="button" role="tab" aria-selected={tab === 'add'} className={`add-tab${tab === 'add' ? ' is-on' : ''}`} onClick={() => setTab('add')}><UserPlus size={15} /> Add friend</button>
        </nav>
      </header>
      <div className="friends-body">
        <div className="friends-main">
          {tab === 'add' ? (
            <AddFriend />
          ) : (
            <>
              <div className="friends-search">
                <MagnifyingGlass size={16} />
                <Input aria-label="Search friends" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {list.length === 0 ? (
                query ? (
                  <EmptyState icon={<MagnifyingGlass size={36} weight="light" />} title="No matches" body={`Nobody in this list matches "${query}".`} />
                ) : (
                  <EmptyState icon={<UsersThree size={36} weight="light" />} title={emptyTitle} body="Add friends by username to chat, call and share screens." action={<Button variant="primary" onClick={() => setTab('add')}>Add a friend</Button>} />
                )
              ) : tab === 'pending' ? (
                <ul className="friend-list">
                  {incoming.length > 0 && <li className="friend-heading">Incoming — {incoming.length}</li>}
                  {incoming.map((r) => <FriendRow key={r.id} rel={r} tab={tab} />)}
                  {outgoing.length > 0 && <li className="friend-heading">Outgoing — {outgoing.length}</li>}
                  {outgoing.map((r) => <FriendRow key={r.id} rel={r} tab={tab} />)}
                </ul>
              ) : (
                <ul className="friend-list">
                  {(tab === 'online' || tab === 'all') && list.some((r) => favouriteIds.includes(r.id)) && <>
                    <li className="friend-heading">Favourites</li>
                    {list.filter((r) => favouriteIds.includes(r.id)).map((r) => <FriendRow key={r.id} rel={r} tab={tab} />)}
                  </>}
                  <li className="friend-heading">{tab === 'online' ? 'Online' : tab === 'all' ? 'All friends' : 'Blocked'} — {list.length}</li>
                  {list.filter((r) => (tab !== 'online' && tab !== 'all') || !favouriteIds.includes(r.id)).map((r) => <FriendRow key={r.id} rel={r} tab={tab} />)}
                </ul>
              )}
            </>
          )}
        </div>
        <ActiveNow friends={total.friends} />
      </div>
    </section>
  );
}
