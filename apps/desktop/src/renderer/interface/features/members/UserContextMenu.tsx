import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMentionStore } from '@renderer/application/stores/mentionStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import {
  assignableRoles,
  memberCapabilities,
  rankOf,
  timeoutUntil,
  toggleRoleId,
  TIMEOUT_PRESETS,
  type MemberCapabilities,
} from '@renderer/domain/memberModeration';
import type { GuildMember } from '@shared/contracts/rest';
import { attempt, copyText } from '../../app/actions';
import { openChannel } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { setUserVolume } from '../../app/voiceActions';
import { useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Button } from '../../shared/ui/Button';
import { Checkbox, Slider } from '../../shared/ui/Form';
import { Menu, type MenuEntry, type useMenu } from '../../shared/ui/Menu';

export type MenuState = ReturnType<typeof useMenu>;

type Panel = 'roles' | 'volume' | 'timeout';
type MemberPatch = Partial<
  Pick<GuildMember, 'nick' | 'mute' | 'deaf' | 'communication_disabled_until'>
>;

const NO_CAPABILITIES: MemberCapabilities = {
  isSelf: false,
  isOwner: false,
  canEditNickname: false,
  canManageRoles: false,
  canServerMute: false,
  canServerDeafen: false,
  canTimeout: false,
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

/**
 * Right-click menu for a member or voice participant. Mounted beside the trigger element;
 * the trigger opens it through the `menu` handle from `useMenu()`.
 */
export function UserContextMenu({
  userId,
  name,
  guildId,
  menu,
}: {
  userId: string;
  name: string;
  guildId: string | null;
  menu: MenuState;
}) {
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
  const voice = useVoiceStore((s) =>
    guildId ? s.states[guildId]?.[userId] : undefined,
  );
  const volume = useVoiceStore((s) => s.userVolumes[userId] ?? 1);
  const perms = useGuildPermissions(guildId);
  const self = me === userId;

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
      'Could not open conversation',
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
          title: 'Open a text channel to mention someone',
        });
      return;
    }
    useMentionStore.getState().requestMention(channelId, name, userId);
  };

  const setRole = (roleId: string, enabled: boolean) => {
    const current = useGuildStore.getState().members[guildId ?? '']?.[userId];
    if (!guildId || !current) return;
    const roles = toggleRoleId(current.roles, roleId, enabled);
    void attempt(async () => {
      if (enabled)
        await getRuntime().api.addMemberRole(guildId, userId, roleId);
      else await getRuntime().api.removeMemberRole(guildId, userId, roleId);
      return true;
    }, 'Could not update roles').then((ok) => {
      if (ok)
        useGuildStore.getState().upsertMember(guildId, { ...current, roles });
    });
  };

  const kick = () =>
    useUiStore.getState().openDialog({
      kind: 'confirm',
      title: `Kick ${name}?`,
      body: 'They can rejoin with a new invite.',
      confirmLabel: 'Kick',
      danger: true,
      onConfirm: async () =>
        void (await attempt(
          () => getRuntime().api.kickMember(guildId ?? '', userId),
          'Could not kick',
        )),
    });

  const ban = () =>
    useUiStore.getState().openDialog({
      kind: 'confirm',
      title: `Ban ${name}?`,
      body: 'They will be removed and cannot rejoin until unbanned.',
      confirmLabel: 'Ban',
      danger: true,
      onConfirm: async () =>
        void (await attempt(
          () => getRuntime().api.ban(guildId ?? '', userId),
          'Could not ban',
        )),
    });

  const item = (
    label: string,
    onSelect: () => void,
    danger = false,
  ): MenuEntry => ({ kind: 'item', label, onSelect, danger });
  const groups: MenuEntry[][] = [
    [
      item('Profile', () =>
        useUiStore.getState().openDialog({ kind: 'profile', userId, guildId }),
      ),
      ...(self
        ? []
        : [item('Mention', mention), item('Message', () => void message())]),
      item('Copy user ID', () => void copyText(userId, 'User ID copied')),
    ],
    [
      ...(caps.canEditNickname
        ? [
            item(
              self ? 'Edit Server Profile' : 'Change nickname',
              () =>
                guildId &&
                useUiStore
                  .getState()
                  .openDialog({ kind: 'editNickname', guildId, userId }),
            ),
          ]
        : []),
      ...(caps.canManageRoles ? [item('Roles', () => openPanel('roles'))] : []),
      ...(self ? [] : [item('User volume', () => openPanel('volume'))]),
    ],
    [
      ...(caps.canServerMute && guildId
        ? [
            item(
              member?.mute ? 'Remove server mute' : 'Server mute',
              () =>
                void patchMember(
                  guildId,
                  userId,
                  { mute: !member?.mute },
                  'Could not update mute',
                ),
            ),
          ]
        : []),
      ...(caps.canServerDeafen && guildId
        ? [
            item(
              member?.deaf ? 'Remove server deafen' : 'Server deafen',
              () =>
                void patchMember(
                  guildId,
                  userId,
                  { deaf: !member?.deaf },
                  'Could not update deafen',
                ),
            ),
          ]
        : []),
      ...(caps.canTimeout ? [item('Timeout', () => openPanel('timeout'))] : []),
    ],
    [
      ...(caps.canKick ? [item(`Kick ${name}`, kick, true)] : []),
      ...(caps.canBan ? [item(`Ban ${name}`, ban, true)] : []),
    ],
  ];
  const entries: MenuEntry[] = groups
    .filter((g) => g.length > 0)
    .flatMap((g, i) =>
      i === 0 ? g : [{ kind: 'separator' } satisfies MenuEntry, ...g],
    );

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
            <p className='member-panel-empty'>No roles you can assign.</p>
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
      {panel === 'timeout' && guildId && (
        <Panel x={panelAt.x} y={panelAt.y} label={`Timeout ${name}`}>
          <div className='member-panel-actions'>
            {TIMEOUT_PRESETS.map((p) => (
              <Button
                key={p.label}
                size='sm'
                variant='ghost'
                onClick={() =>
                  void patchMember(
                    guildId,
                    userId,
                    { communication_disabled_until: timeoutUntil(p.ms) },
                    'Could not timeout member',
                  )
                }
              >
                {p.label}
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
                    'Could not remove timeout',
                  )
                }
              >
                Remove timeout
              </Button>
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
