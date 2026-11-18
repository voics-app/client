import { useI18n } from '../../shared/i18n';
import { useRef, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { MAX_GROUP_DM_MEMBERS } from '@discordy/core/domain/dmModel';
import { RelationshipType, type User } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { leaveGroupDm } from '../../app/dmActions';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Field, Input } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { readImageUpload } from '../settings/imageUpload';

/** Group DM settings: name, icon, members (add friends, owner removes) and leave. */
export function GroupDmDialog({ channelId }: { channelId: string }) {
  const { t: msg, locale } = useI18n();
  const channel = useGuildStore((s) => s.channels[channelId]);
  const me = useSessionStore((s) => s.user);
  const relationships = useRelationshipStore((s) => s.byUser);
  const [name, setName] = useState(channel?.name ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => useUiStore.getState().openDialog(null);
  if (!channel || !me) return null;

  const recipients: User[] = channel.recipients ?? [];
  const isOwner = channel.owner_id === me.id;
  const full = recipients.length + 1 >= MAX_GROUP_DM_MEMBERS;
  const inGroup = new Set(recipients.map((u) => u.id));
  const friends = Object.values(relationships)
    .filter((r) => r.type === RelationshipType.FRIEND && !r.user.bot && !inGroup.has(r.user.id))
    .map((r) => r.user);

  const patch = async (body: Record<string, unknown>, title: string) => {
    setBusy(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channelId, body), title);
    setBusy(false);
    if (updated) useGuildStore.getState().upsertChannel(updated);
  };

  const pickIcon = async (file: File | undefined) => {
    if (!file) return;
    const data = await attempt(() => readImageUpload(file, locale), msg("settings.groupdmdialog.could.not.read.the.image"));
    if (data) await patch({ icon: data }, msg("settings.groupdmdialog.could.not.change.the.icon"));
  };

  const add = async (user: User) => {
    const ok = await attempt(async () => {
      await getRuntime().api.addGroupRecipient(channelId, user.id);
      return true;
    }, msg("settings.groupdmdialog.could.not.add.the.member"));
    if (!ok) return;
    const current = useGuildStore.getState().channels[channelId];
    if (current) useGuildStore.getState().upsertChannel({ ...current, recipients: [...(current.recipients ?? []).filter((u) => u.id !== user.id), user] });
    // Ephemeral groups: commit the MLS Add for the new member's devices right away.
    void getRuntime().privacy.ephemeral.syncMembership(channelId).catch(() => undefined);
  };

  const remove = async (user: User) => {
    const ok = await attempt(async () => {
      await getRuntime().api.removeGroupRecipient(channelId, user.id);
      return true;
    }, msg("settings.groupdmdialog.could.not.remove.the.member"));
    if (!ok) return;
    const current = useGuildStore.getState().channels[channelId];
    if (current) useGuildStore.getState().upsertChannel({ ...current, recipients: (current.recipients ?? []).filter((u) => u.id !== user.id) });
    void getRuntime().privacy.ephemeral.reconcileMembership(channelId).catch(() => undefined);
  };

  return (
    <Modal open onClose={close} title={msg("header.groupSettings")} width={460}>
      <div className="stack">
        <div className="row">
          <Avatar id={channel.id} name={channel.name || msg("menu.group")} avatar={channel.icon ?? null} size={56} kind="channel-icons" />
          <div className="stack">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickIcon(e.target.files?.[0])} />
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>{msg("settings.groupdmdialog.change.icon")}</Button>
            {channel.icon && <Button variant="ghost" onClick={() => void patch({ icon: null }, msg("settings.groupdmdialog.could.not.remove.the.icon"))}>{msg("settings.groupdmdialog.remove.icon")}</Button>}
          </div>
        </div>
        <Field label={msg("settings.groupdmdialog.group.name")}>{(id) => <Input id={id} data-autofocus value={name} maxLength={100} placeholder={msg("settings.groupdmdialog.unnamed.group")} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="row-end">
          <Button variant="primary" loading={busy} disabled={name.trim() === (channel.name ?? '') || name.trim() === ''} onClick={() => void patch({ name: name.trim() }, msg("settings.groupdmdialog.could.not.rename.the.group"))}>{msg("settings.passkeys.save.name")}</Button>
        </div>
        <h3 className="section-title">{msg('group.members', { count: recipients.length + 1, max: MAX_GROUP_DM_MEMBERS })}</h3>
        <ul className="pick-list">
          {[me, ...recipients].map((u) => (
            <li key={u.id} className="pick-row">
              <Avatar id={u.id} name={displayName(u)} avatar={u.avatar} size={28} />
              <span>{u.id === channel.owner_id ? msg('group.owner', { name: displayName(u) }) : displayName(u)}</span>
              {isOwner && u.id !== me.id && <Button variant="ghost" onClick={() => void remove(u)}>{msg("common.remove")}</Button>}
            </li>
          ))}
        </ul>
        <h3 className="section-title">{msg("settings.groupdmdialog.add.friends")}</h3>
        <ul className="pick-list">
          {friends.map((u) => (
            <li key={u.id} className="pick-row">
              <Avatar id={u.id} name={displayName(u)} avatar={u.avatar} size={28} />
              <span>{displayName(u)}</span>
              <Button variant="ghost" disabled={full} onClick={() => void add(u)}>{msg("settings.roleseditor.add")}</Button>
            </li>
          ))}
          {friends.length === 0 && <li className="pick-empty">{msg("settings.groupdmdialog.no.friends.left.to.add")}</li>}
        </ul>
        {full && <p className="confirm-body">{msg('group.limit', { count: MAX_GROUP_DM_MEMBERS })}</p>}
        <div className="row-end">
          <Button variant="danger" onClick={() => void leaveGroupDm(channelId)}>{msg("settings.groupdmdialog.leave.group")}</Button>
          <Button variant="primary" onClick={close}>{msg("common.done")}</Button>
        </div>
      </div>
    </Modal>
  );
}
