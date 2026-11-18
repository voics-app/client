import { ShieldWarning } from '@phosphor-icons/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { confirmAgeRestrictedChannel } from '@discordy/core/application/ageRestrictedAccess';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { attempt, leaveGuild } from '../../app/actions';
import { useChannelContentAccess } from '../../shared/hooks/useChannelContentAccess';
import { useI18n } from '../../shared/i18n';
import { Button } from '../../shared/ui/Button';
import './ageRestricted.css';

/** Reusable acknowledgement controls; the owning boundary decides what may mount. */
export function AgeRestrictedNotice({ channelId, children, onExit, onScheduled, inline = false }: { channelId: string; children?: ReactNode; onExit?: () => void; onScheduled?: () => void; inline?: boolean }) {
  const { t } = useI18n();
  const { kind } = useChannelContentAccess().access(channelId);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const guild = useGuildStore((s) => channel?.guild_id ? s.guilds[channel.guild_id] : undefined);
  const me = useSessionStore((s) => s.user?.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const labelId = useId();
  useEffect(() => { if (kind !== 'open') heading.current?.focus(); }, [channelId, kind]);
  if (kind === 'open') return children;
  const exit = () => { useUiStore.getState().openDialog(null); useUiStore.getState().navigate({ kind: 'home', channelId: null }); onExit?.(); };
  const leave = () => useUiStore.getState().openDialog({ kind: 'confirm', title: t('age.leaveTitle'), body: t('age.leaveBody'), confirmLabel: t('age.leave'), danger: true, onConfirm: async () => { await attempt(() => leaveGuild(guild!.id), t('age.leaveError')); } });
  return (
    <section className="age-gate" aria-labelledby={labelId}>
      <ShieldWarning size={40} weight="light" aria-hidden="true" />
      <h2 id={labelId} tabIndex={-1} ref={heading}>{t(kind === 'unavailable' ? 'age.unavailable' : kind === 'hidden' ? 'age.hidden' : 'age.title')}</h2>
      {kind === 'confirm' && <p className="age-gate-channel" dir="auto">#{channel?.name}</p>}
      <p>{t(kind === 'unavailable' ? 'age.unavailableBody' : kind === 'hidden' ? 'age.hiddenBody' : 'age.body')}</p>
      <div className="age-gate-actions">
        {!inline && <Button onClick={exit}>{t('age.back')}</Button>}
        {kind === 'confirm' && <Button variant="primary" onClick={() => confirmAgeRestrictedChannel(channelId)}>{t('age.continue')}</Button>}
      </div>
      {!inline && <div className="age-gate-actions">
        {onScheduled && <Button variant="ghost" onClick={onScheduled}>{t('age.scheduled')}</Button>}
        <Button variant="ghost" onClick={() => useUiStore.getState().openSettings({ kind: 'user', tab: 'privacy' })}>{t('age.settings')}</Button>
        {channel?.guild_id && <Button variant="ghost" onClick={() => useUiStore.getState().openDialog({ kind: 'report', target: { kind: 'channel', channelId, channelName: channel.name ?? channelId } })}>{t('age.report')}</Button>}
        {guild && guild.owner_id !== me && <Button variant="ghost" onClick={leave}>{t('age.leave')}</Button>}
      </div>}
    </section>
  );
}
