import { useI18n } from '../../shared/i18n';
import { useState, type FormEvent } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

const MAX_NICKNAME = 32;

/** Sets a server-only nickname: your own (CHANGE_NICKNAME) or someone else's (MANAGE_NICKNAMES). */
export function EditNicknameDialog({
  guildId,
  userId,
}: {
  guildId: string;
  userId: string;
}) {
  const { t: msg } = useI18n();
  const me = useSessionStore((s) => s.user?.id);
  const member = useGuildStore((s) => s.members[guildId]?.[userId]);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const [value, setValue] = useState(member?.nick ?? '');
  const [busy, setBusy] = useState(false);
  const self = me === userId;
  const close = () => useUiStore.getState().openDialog(null);
  const title = self
    ? msg("settings.usercontextmenu.edit.server.profile")
    : msg('members.nickname', { name: member?.user.username ?? msg('members.memberFallback') });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    setBusy(true);
    const updated = await attempt(
      () =>
        getRuntime().api.updateMember(guildId, userId, {
          nick: trimmed || null,
        }),
      msg("settings.editnicknamedialog.could.not.change.nickname"),
    );
    setBusy(false);
    if (updated) {
      useGuildStore.getState().upsertMember(guildId, updated);
      close();
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={title}
      description={guild ? msg('members.nicknameHere', { name: guild.name }) : undefined}
      width={400}
    >
      <form onSubmit={(e) => void submit(e)}>
        <Field
          label={msg("settings.profileeditor.server.nickname")}
          hint={msg("settings.editnicknamedialog.leave.empty.to.use.the.account.name")}
        >
          {(id) => (
            <Input
              id={id}
              value={value}
              maxLength={MAX_NICKNAME}
              placeholder={
                member?.user.global_name ?? member?.user.username ?? ''
              }
              onChange={(e) => setValue(e.target.value)}
              data-autofocus
            />
          )}
        </Field>
        <div className='row-end'>
          <Button variant='ghost' type='button' onClick={close}>
            {msg("common.cancel")} </Button>
          <Button variant='primary' type='submit' loading={busy}>
            {msg("common.save")} </Button>
        </div>
      </form>
    </Modal>
  );
}
