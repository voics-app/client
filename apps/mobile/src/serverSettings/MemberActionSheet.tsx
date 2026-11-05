import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { GuildMember } from '@discordy/core/contracts/rest';
import { assignableRoles, rankOf, TIMEOUT_PRESETS, timeoutUntil, toggleRoleId } from '@discordy/core/domain/memberModeration';
import { isTimedOut } from '@discordy/core/domain/moderationTools';
import { BAN_HISTORY_OPTIONS } from '@discordy/core/domain/userMenuModel';
import { memberName } from '../members/memberListModel';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Choices, Field } from '../ui/controls';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { moderationRights } from './memberAdminModel';

export const NICKNAME_MAX = 32;

type Step = 'menu' | 'roles' | 'timeout' | 'nickname' | 'kick' | 'ban';

const icon = (name: keyof typeof Ionicons.glyphMap, color: string = theme.text) => <Ionicons name={name} size={20} color={color} />;

function Body({ guildId, member, step, setStep, onClose }: { guildId: string; member: GuildMember; step: Step; setStep(step: Step): void; onClose(): void }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const live = useGuildStore((s) => s.members[guildId]?.[member.user.id]) ?? member;
  const me = useSessionStore((s) => s.user?.id);
  const myMember = useGuildStore((s) => (me ? s.members[guildId]?.[me] : undefined));
  const perms = useGuildPermissions(guildId);
  const [nick, setNick] = useState(live.nick ?? '');
  const [historySeconds, setHistorySeconds] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!guild || !me) return null;
  const rights = moderationRights(guild, perms, myMember, me, live);
  const self = me === live.user.id;

  const save = (patch: Partial<GuildMember>, failure: string) =>
    attempt(async () => {
      const updated = await getRuntime().api.updateMember(guildId, live.user.id, patch);
      useGuildStore.getState().upsertMember(guildId, updated);
      return true;
    }, failure);

  const toggleRole = async (roleId: string, enabled: boolean) => {
    const api = getRuntime().api;
    const done = await attempt(async () => {
      if (enabled) await api.addMemberRole(guildId, live.user.id, roleId);
      else await api.removeMemberRole(guildId, live.user.id, roleId);
      return true;
    }, enabled ? 'Could not add role' : 'Could not remove role');
    if (done) useGuildStore.getState().upsertMember(guildId, { ...live, roles: toggleRoleId(live.roles, roleId, enabled) });
  };

  const remove = async (verb: 'kick' | 'ban') => {
    setBusy(true);
    const api = getRuntime().api;
    const done = await attempt(async () => {
      if (verb === 'ban') await api.ban(guildId, live.user.id, reason.trim() || undefined, historySeconds > 0 ? { delete_message_seconds: historySeconds } : {});
      else await api.kickMember(guildId, live.user.id);
      return true;
    }, `Could not ${verb}`);
    setBusy(false);
    if (done) {
      useGuildStore.getState().removeMember(guildId, live.user.id);
      onClose();
    }
  };

  if (step === 'kick') return <SheetConfirm body="They can rejoin with a new invite." confirmLabel="Kick" onConfirm={() => void remove('kick')} onCancel={() => setStep('menu')} />;
  if (step === 'ban') {
    return (
      <View style={styles.form}>
        <Text style={styles.body}>They are removed and cannot rejoin until unbanned.</Text>
        <Choices<number> label="Delete message history" options={BAN_HISTORY_OPTIONS.map((o) => ({ value: o.seconds, label: o.label }))} value={historySeconds} onChange={setHistorySeconds} />
        <Field label="Reason (optional)" value={reason} maxLength={256} autoCapitalize="sentences" onChangeText={setReason} />
        <Button label="Ban" tone="danger" busy={busy} onPress={() => void remove('ban')} />
        <Button label="Cancel" onPress={() => setStep('menu')} />
      </View>
    );
  }
  if (step === 'nickname') {
    return (
      <View style={styles.form}>
        <Field label="Server nickname" value={nick} maxLength={NICKNAME_MAX} placeholder={live.user.global_name ?? live.user.username} autoCapitalize="sentences" onChangeText={setNick} />
        <Text style={styles.body}>Only shown in this server. Leave empty to use the account name.</Text>
        <Button
          label="Save"
          tone="primary"
          busy={busy}
          onPress={() => {
            setBusy(true);
            void save({ nick: nick.trim() || null }, 'Could not change nickname').then((done) => {
              setBusy(false);
              if (done) onClose();
            });
          }}
        />
      </View>
    );
  }
  if (step === 'timeout') {
    const timedOut = isTimedOut(live);
    const choose = (patch: Partial<GuildMember>, failure: string) =>
      void save(patch, failure).then((done) => {
        if (done) onClose();
      });
    return (
      <>
        {TIMEOUT_PRESETS.map((p) => (
          <SheetOption key={p.label} label={p.label} onPress={() => choose({ communication_disabled_until: timeoutUntil(p.ms) }, 'Could not timeout member')} />
        ))}
        {timedOut && <SheetOption label="Remove timeout" danger onPress={() => choose({ communication_disabled_until: null }, 'Could not remove timeout')} />}
        <SheetOption label="Back" onPress={() => setStep('menu')} />
      </>
    );
  }
  if (step === 'roles') {
    const rank = rankOf({ userId: me, roleIds: myMember?.roles ?? [] }, guild.owner_id, guild.roles);
    const roles = assignableRoles(guild.roles, guildId, rank);
    return (
      <>
        {roles.length === 0 && <Text style={styles.body}>There are no roles you can give.</Text>}
        {roles.map((role) => (
          <View key={role.id} style={styles.roleRow}>
            <View style={[styles.dot, { backgroundColor: role.color ? `#${role.color.toString(16).padStart(6, '0')}` : theme.subtle }]} />
            <Text style={styles.roleName}>{role.name}</Text>
            <Switch accessibilityLabel={`Role ${role.name}`} value={live.roles.includes(role.id)} onValueChange={(on) => void toggleRole(role.id, on)} trackColor={{ true: theme.accent }} />
          </View>
        ))}
        <SheetOption label="Back" onPress={() => setStep('menu')} />
      </>
    );
  }
  return (
    <>
      {rights.roles && <SheetOption label="Roles" icon={icon('shield-outline')} onPress={() => setStep('roles')} />}
      {rights.nickname && <SheetOption label={self ? 'Edit server profile' : 'Change nickname'} icon={icon('pencil-outline')} onPress={() => setStep('nickname')} />}
      {rights.timeout && <SheetOption label={isTimedOut(live) ? 'Timeout (change or remove)' : 'Timeout'} icon={icon('time-outline')} onPress={() => setStep('timeout')} />}
      {rights.kick && <SheetOption label="Kick" danger icon={icon('exit-outline', theme.danger)} onPress={() => setStep('kick')} />}
      {rights.ban && <SheetOption label="Ban" danger icon={icon('ban-outline', theme.danger)} onPress={() => setStep('ban')} />}
      <SheetOption label="Cancel" onPress={onClose} />
    </>
  );
}

const TITLES: Record<Step, (name: string) => string> = {
  menu: (name) => name,
  roles: (name) => `Roles of ${name}`,
  timeout: (name) => `Timeout ${name}`,
  nickname: (name) => `Nickname of ${name}`,
  kick: (name) => `Kick ${name}?`,
  ban: (name) => `Ban ${name}?`,
};

/** What a moderator may do to one member, by the same permission and hierarchy rules as desktop's member menu: roles, nickname, timeout, kick and ban (each destructive one asks first). */
export function MemberActionSheet({ guildId, member: shown, onClose }: { guildId: string; member: GuildMember | null; onClose(): void }) {
  const member = useLastValue(shown);
  const [step, setStep] = useState<Step>('menu');
  const close = () => {
    setStep('menu');
    onClose();
  };
  return (
    <Sheet visible={shown !== null} title={member ? TITLES[step](memberName(member)) : ''} closeLabel="Close member actions" onClose={close}>
      {shown && <Body key={shown.user.id} guildId={guildId} member={shown} step={step} setStep={setStep} onClose={close} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 20, paddingBottom: 8 },
  body: { color: theme.muted, fontSize: 14, paddingHorizontal: 20, paddingBottom: 12 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  roleName: { flex: 1, color: theme.text, fontSize: 16 },
});
