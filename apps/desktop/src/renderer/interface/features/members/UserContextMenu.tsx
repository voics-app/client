import { useI18n } from '../../shared/i18n';
import { callUser } from '../../app/callActions';
import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useLocalPeopleStore } from '@discordy/core/application/stores/localPeopleStore';
import { useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { saveUserNote } from '@discordy/core/application/notificationSync';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useMentionStore } from '@discordy/core/application/stores/mentionStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import {
  assignableRoles,
  memberCapabilities,
  moveTargets,
  rankOf,
  timeoutUntil,
  TIMEOUT_PRESETS,
  type MemberCapabilities,
} from '@discordy/core/domain/memberModeration';
import {
  friendAction,
  userMenuGroups,
  type UserMenuItemId,
} from '@discordy/core/domain/userMenuModel';
import { RelationshipType, type GuildMember, type User } from '@discordy/core/contracts/rest';
import { attempt, copyText, reportError } from '../../app/actions';
import { confirmPurgeRecentMessages } from '../../app/moderationActions';
import { openChannel } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { setUserVolume } from '../../app/voiceActions';
import { useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Button } from '../../shared/ui/Button';
import { Checkbox, Slider } from '../../shared/ui/Form';
import { runContextCommand, useContextCommands } from '../apps/useContextCommands';
import { appsSubmenu } from '@discordy/core/domain/contextCommands';
import type { MenuItemModel } from '@discordy/core/domain/menuModel';
import { toMenuEntries } from '../../shared/ui/menuAdapter';
import { RolePills, setMemberRole } from './RolePills';
import { Menu, useMenu, type MenuEntry } from '../../shared/ui/Menu';

export type MenuState = ReturnType<typeof useMenu>;

type Panel = 'roles' | 'volume' | 'timeout' | 'move' | 'note';
type MemberPatch = Partial<
  Pick<GuildMember, 'nick' | 'mute' | 'deaf' | 'communication_disabled_until'>
> & { channel_id?: string | null };

const NO_CAPABILITIES: MemberCapabilities = {
  isSelf: false,
  isOwner: false,
  canEditNickname: false,
  canManageRoles: false,
  canServerMute: false,
  canServerDeafen: false,
  canMoveMembers: false,
  canTimeout: false,
  canManageMessages: false,
  canKick: false,
  canBan: false,
};

/** Writes a member change to the API and mirrors the server's copy into the store. */
async function patchMember(
  guildId: string,
  userId: string,
  patch: MemberPatch,
  title: string,
): Promise<void> {
  const updated = await attempt(
    () => getRuntime().api.updateMember(guildId, userId, patch),
    title,
  );
  if (updated) useGuildStore.getState().upsertMember(guildId, updated);
}

/** Server-side voice move/disconnect; the gateway then announces the new voice state. */
export async function moveMember(
  guildId: string,
  userId: string,
  channelId: string | null,
): Promise<void> {
  await patchMember(
    guildId,
    userId,
    { channel_id: channelId },
    channelId ? 'Could not move member' : 'Could not disconnect member',
  );
}

/**
 * Right-click menu for a member or voice participant. Mounted beside the trigger element;
 * the trigger opens it through the `menu` handle from `useMenu()`.
 */
export function UserContextMenu({
  userId,
  name,
  guildId,
  menu,
  user,
}: {
  userId: string;
  name: string;
  guildId: string | null;
  menu: MenuState;
  /** Known account data when the surface has it (DM recipient, friend, message author). */
  user?: User;
}) {
  const { t: msg, catalogText } = useI18n();
  const developerMode = usePrefsStore((s) => s.developerMode);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelAt, setPanelAt] = useState({ x: 0, y: 0 });
  const me = useSessionStore((s) => s.user?.id) ?? null;
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const member = useGuildStore((s) =>
    guildId ? s.members[guildId]?.[userId] : undefined,
  );
  const actorRoles = useGuildStore((s) =>
    guildId && me ? s.members[guildId]?.[me]?.roles : undefined,
  );
  const voice = useVoiceStore((s) => {
    if (guildId) return s.states[guildId]?.[userId];
    for (const scope of Object.values(s.states)) if (scope[userId]) return scope[userId];
    return undefined;
  });
  const relationship = useRelationshipStore((s) => s.byUser[userId]);
  const note = useUserNotesStore((s) => s.byUser[userId] ?? '');
  const locallyMuted = useLocalPeopleStore((s) => userId in s.mutedUsers);
  const targetUser = user ?? member?.user ?? relationship?.user;
  const isBot = Boolean(targetUser?.bot);
  const blocked = relationship?.type === RelationshipType.BLOCKED;
  const volume = useVoiceStore((s) => s.userVolumes[userId] ?? 1);
  const channels = useGuildStore((s) => s.channels);
  const viewChannelId = useUiStore((s) => s.view.channelId);
  const perms = useGuildPermissions(guildId);
  const self = me === userId;
  // Apps run in the channel being viewed, which must belong to the same scope as the menu.
  const viewChannel = useGuildStore((s) => (viewChannelId ? s.channels[viewChannelId] : undefined));
  const appChannelId = viewChannel && (guildId ? viewChannel.guild_id === guildId : !viewChannel.guild_id) ? viewChannel.id : null;
  const appCommands = useContextCommands(appChannelId, menu.open);

  const caps: MemberCapabilities =
    guild && member && me
      ? memberCapabilities({
          perms,
          ownerId: guild.owner_id,
          roles: guild.roles,
          actor: { userId: me, roleIds: actorRoles ?? [] },
          target: { userId, roleIds: member.roles },
          inVoice: Boolean(voice?.channel_id),
        })
      : { ...NO_CAPABILITIES, isSelf: self };

  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.member-panel'))
        setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [panel]);

  const openPanel = (next: Panel) => {
    setPanelAt({ x: menu.anchor?.x ?? 0, y: menu.anchor?.y ?? 0 });
    setPanel(next);
  };

  const message = async () => {
    const channel = await attempt(
      () => getRuntime().api.openPrivateChannel([userId]),
      msg("friends.openFailed"),
    );
    if (channel) {
      useGuildStore.getState().upsertChannel(channel);
      openChannel(channel.id);
    }
  };

  const mention = () => {
    const channelId = useUiStore.getState().view.channelId;
    if (!channelId) {
      useUiStore
        .getState()
        .toast({
          tone: 'warning',
          title: msg("settings.usercontextmenu.open.a.text.channel.to.mention.someone"),
        });
      return;
    }
    useMentionStore.getState().requestMention(channelId, name, userId);
  };

  const call = () => callUser(userId);

  const relate = async (fn: () => Promise<unknown>, title: string) => {
    await attempt(fn, title);
  };

  const toggleLocalMute = () => {
    const people = useLocalPeopleStore.getState();
    const current = useVoiceStore.getState().userVolumes[userId] ?? 1;
    if (userId in people.mutedUsers) {
      setUserVolume(userId, people.mutedUsers[userId] ?? 1);
      people.unmuteLocal(userId);
    } else {
      people.muteLocal(userId, current > 0 ? current : 1);
      setUserVolume(userId, 0);
    }
  };

  const setRole = (roleId: string, enabled: boolean) => {
    if (guildId) void setMemberRole(guildId, userId, roleId, enabled);
  };

  const kick = () =>
    useUiStore.getState().openDialog({
      kind: 'confirm',
      title: msg('members.confirmKick', { name }),
      body: msg("settings.servertabs.they.can.rejoin.with.a.new.invite"),
      confirmLabel: msg("settings.servertabs.kick"),
      danger: true,
      onConfirm: async () =>
        void (await attempt(
          () => getRuntime().api.kickMember(guildId ?? '', userId),
          msg("settings.servertabs.could.not.kick"),
        )),
    });

  const ban = () =>
    guildId && useUiStore.getState().openDialog({ kind: 'ban', guildId, userId, name });

  const item = (
    label: string,
    onSelect: () => void,
    danger = false,
    checked = false,
  ): MenuEntry => ({ kind: 'item', label, onSelect, danger, checked });
  const entryFor = (id: UserMenuItemId): MenuEntry => {
    switch (id) {
      case 'profile':
        return item(msg("settings.profile"), () =>
          useUiStore.getState().openDialog({ kind: 'profile', userId, guildId }),
        );
      case 'mention':
        return item(msg("settings.usercontextmenu.mention"), mention);
      case 'message':
        return item(msg("common.message"), () => void message());
      case 'call':
        return item(msg("settings.profiledialog.call"), () => void call());
      case 'note':
        return item(note ? msg("settings.usercontextmenu.edit.note") : msg("settings.usercontextmenu.add.note"), () => openPanel('note'));
      case 'friend': {
        const action = friendAction(relationship?.type, self, isBot);
        if (action === 'remove')
          return item(msg("friends.remove"), () => void relate(() => getRuntime().api.deleteRelationship(userId), msg("settings.usercontextmenu.could.not.remove.friend")));
        if (action === 'accept')
          return item(msg("settings.usercontextmenu.accept.friend.request"), () => void relate(() => getRuntime().api.putRelationship(userId), msg("settings.usercontextmenu.could.not.accept.request")));
        if (action === 'pending')
          return { kind: 'item', label: msg("settings.usercontextmenu.friend.request.sent"), disabled: true, onSelect: () => undefined };
        return item(msg("friends.add"), () =>
          void relate(
            () => getRuntime().api.putRelationship(userId, targetUser?.username ? { username: targetUser.username } : undefined),
            msg("settings.profiledialog.could.not.send.request"),
          ),
        );
      }
      case 'block':
        return blocked
          ? item(msg("friends.unblock"), () => void relate(() => getRuntime().api.deleteRelationship(userId), msg("settings.usercontextmenu.could.not.unblock")))
          : item(msg("settings.profiledialog.block"), () => void relate(() => getRuntime().api.putRelationship(userId, { type: RelationshipType.BLOCKED }), msg("settings.profiledialog.could.not.block")), true);
      case 'report':
        return item(msg("settings.profiledialog.report"), () => useUiStore.getState().openDialog({ kind: 'report', target: { kind: 'user', userId, userName: name } }), true);
      case 'localMute':
        return item(msg("media.mute"), toggleLocalMute, false, locallyMuted);
      case 'volume':
        return item(msg("settings.usercontextmenu.user.volume"), () => openPanel('volume'));
      case 'nickname':
        return item(self ? msg("settings.usercontextmenu.edit.server.profile") : msg("domain.change.nickname"), () =>
          guildId && (self
            ? useUiStore.getState().openSettings({ kind: 'user', tab: 'profile', profileGuildId: guildId })
            : useUiStore.getState().openDialog({ kind: 'editNickname', guildId, userId })),
        );
      case 'roles':
        return item(msg("settings.profiledialog.roles"), () => openPanel('roles'));
      case 'serverMute':
        return item(member?.mute ? msg("settings.usercontextmenu.remove.server.mute") : msg("settings.usercontextmenu.server.mute"), () =>
          void patchMember(guildId ?? '', userId, { mute: !member?.mute }, msg("settings.usercontextmenu.could.not.update.mute")),
        );
      case 'serverDeafen':
        return item(member?.deaf ? msg("settings.usercontextmenu.remove.server.deafen") : msg("settings.usercontextmenu.server.deafen"), () =>
          void patchMember(guildId ?? '', userId, { deaf: !member?.deaf }, msg("settings.usercontextmenu.could.not.update.deafen")),
        );
      case 'moveTo':
        return item(msg("settings.usercontextmenu.move.to"), () => openPanel('move'));
      case 'disconnect':
        return item(msg("settings.usercontextmenu.disconnect"), () => void moveMember(guildId ?? '', userId, null));
      case 'timeout':
        return item(msg("settings.usercontextmenu.timeout"), () => openPanel('timeout'));
      case 'purgeMessages':
        return item(msg("settings.usercontextmenu.delete.recent.messages"), () => confirmPurgeRecentMessages(guildId ?? '', userId, name), true);
      case 'kick':
        return item(msg('members.kick', { name }), kick, true);
      case 'ban':
        return item(msg('members.ban', { name }), ban, true);
      case 'apps': {
        const submenu = appsSubmenu(appCommands, 'user');
        return {
          kind: 'submenu',
          label: msg("menu.apps"),
          entries: toMenuEntries(submenu?.kind === 'submenu' ? submenu.items : [], (it: MenuItemModel) => runContextCommand(viewChannel, appCommands?.find((c) => c.id === it.arg), userId)),
        };
      }
      case 'copyId':
        return item(msg("settings.profiledialog.copy.user.id"), () => void copyText(userId, msg("settings.profiledialog.user.id.copied")));
    }
  };
  const groups = userMenuGroups({
    caps,
    inGuild: Boolean(guildId && guild),
    inVoice: Boolean(voice?.channel_id),
    canMention: Boolean(viewChannelId),
    relationship: relationship?.type,
    isBot,
    hasVoiceAudio: true,
    developerMode,
    appCommands: appChannelId ? appCommands : undefined,
  });
  const showRoles = Boolean(guildId && member && member.roles.some((r) => r !== guildId));
  const entries: MenuEntry[] = groups.flatMap((g, i) => [
    ...(i === 0 ? [] : [{ kind: 'separator' } satisfies MenuEntry]),
    ...g.map(entryFor),
    ...(i === 0 && showRoles && guildId
      ? [{ kind: 'content', node: <RolePills guildId={guildId} userId={userId} /> } satisfies MenuEntry]
      : []),
  ]);

  const actorRank =
    guild && me
      ? rankOf(
          { userId: me, roleIds: actorRoles ?? [] },
          guild.owner_id,
          guild.roles,
        )
      : -1;
  const roleOptions =
    guild && guildId ? assignableRoles(guild.roles, guildId, actorRank) : [];
  const moveOptions =
    guildId && panel === 'move'
      ? moveTargets(Object.values(channels), guildId, voice?.channel_id)
      : [];
  const timedOut = member?.communication_disabled_until
    ? new Date(member.communication_disabled_until).getTime() > Date.now()
    : false;

  return (
    <>
      <Menu
        open={menu.open}
        x={menu.anchor?.x ?? 0}
        y={menu.anchor?.y ?? 0}
        entries={entries}
        onClose={menu.close}
      />
      {panel === 'roles' && guildId && member && (
        <Panel x={panelAt.x} y={panelAt.y} label={`${name} roles`}>
          {roleOptions.length === 0 && (
            <p className='member-panel-empty'>{msg("settings.usercontextmenu.no.roles.you.can.assign")}</p>
          )}
          {roleOptions.map((role) => (
            <Checkbox
              key={role.id}
              checked={member.roles.includes(role.id)}
              onChange={(v) => setRole(role.id, v)}
              label={role.name}
            />
          ))}
        </Panel>
      )}
      {panel === 'note' && (
        <Panel x={panelAt.x} y={panelAt.y} label={msg('members.note', { name })}>
          <textarea
            className='input'
            aria-label={msg('members.note', { name })}
            rows={4}
            maxLength={256}
            defaultValue={note}
            placeholder={msg("settings.profiledialog.click.to.add.a.note.only.visible.to.you")}
            onBlur={(e) => e.target.value.trim() !== note && void saveUserNote(getRuntime().api, userId, e.target.value.trim()).catch((err) => reportError(err, msg("settings.profiledialog.could.not.save.note")))}
          />
        </Panel>
      )}
      {panel === 'volume' && (
        <Panel x={panelAt.x} y={panelAt.y} label={`${name} volume`}>
          <Slider
            label={`${name} volume`}
            value={volume}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => setUserVolume(userId, v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Panel>
      )}
      {panel === 'move' && guildId && (
        <Panel x={panelAt.x} y={panelAt.y} label={msg('members.move', { name })}>
          {moveOptions.length === 0 && (
            <p className='member-panel-empty'>{msg("settings.usercontextmenu.no.other.voice.channels")}</p>
          )}
          <div className='member-panel-actions'>
            {moveOptions.map((channel) => (
              <Button
                key={channel.id}
                size='sm'
                variant='ghost'
                onClick={() => {
                  setPanel(null);
                  void moveMember(guildId, userId, channel.id);
                }}
              >
                {channel.name ?? channel.id}
              </Button>
            ))}
          </div>
        </Panel>
      )}
      {panel === 'timeout' && guildId && (
        <Panel x={panelAt.x} y={panelAt.y} label={msg('members.timeout', { name })}>
          <div className='member-panel-actions'>
            {TIMEOUT_PRESETS.map((p) => (
              <Button
                key={catalogText(p.label)}
                size='sm'
                variant='ghost'
                onClick={() =>
                  void patchMember(
                    guildId,
                    userId,
                    { communication_disabled_until: timeoutUntil(p.ms) },
                    msg("settings.usercontextmenu.could.not.timeout.member"),
                  )
                }
              >
                {catalogText(p.label)}
              </Button>
            ))}
            {timedOut && (
              <Button
                size='sm'
                variant='danger'
                onClick={() =>
                  void patchMember(
                    guildId,
                    userId,
                    { communication_disabled_until: null },
                    msg("settings.usercontextmenu.could.not.remove.timeout"),
                  )
                }
              >
                {msg("settings.usercontextmenu.remove.timeout")} </Button>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}

function Panel({
  x,
  y,
  label,
  children,
}: {
  x: number;
  y: number;
  label: string;
  children: ReactNode;
}) {
  return createPortal(
    <div
      className='volume-pop glass member-panel'
      role='dialog'
      aria-label={label}
      style={{
        left: Math.min(x, window.innerWidth - 300),
        top: Math.min(y, window.innerHeight - 120),
        maxHeight: 360,
        overflowY: 'auto',
      }}
    >
      <p>{label}</p>
      {children}
    </div>,
    document.body,
  );
}

/** Binds the shared user menu to any element: spread `bind` on the trigger, render `node` beside it. */
export function useUserMenu(args: { userId: string; name: string; guildId: string | null; user?: User }) {
  const menu = useMenu();
  return {
    bind: { onContextMenu: menu.openAt },
    open: menu.openAt,
    node: <UserContextMenu {...args} menu={menu} />,
  };
}

/**
 * Wraps any user-bearing element (name, avatar, mention, row) so right-click opens the shared menu.
 * Renders with `display: contents`, so layout is unaffected.
 */
export function UserMenuTarget({
  userId,
  name,
  guildId,
  user,
  as: Tag = 'span',
  children,
}: {
  userId: string;
  name: string;
  guildId: string | null | undefined;
  user?: User;
  as?: ElementType;
  children: ReactNode;
}) {
  const { bind, node } = useUserMenu({ userId, name, guildId: guildId ?? null, user });
  return (
    <>
      <Tag className='user-menu-target' data-user-id={userId} {...bind}>
        {children}
      </Tag>
      {node}
    </>
  );
}
