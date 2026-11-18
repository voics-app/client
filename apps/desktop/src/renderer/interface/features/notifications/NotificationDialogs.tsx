import { useI18n } from '../../shared/i18n';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore, type Dialog } from '@discordy/core/application/stores/uiStore';
import {
  activeOverrides,
  channelOverride,
  emptySettings,
  isChannelMuted,
  isGuildMuted,
  isMuteActive,
  MUTE_DURATIONS,
  NOTIFICATION_LEVELS,
  scopeKey,
  serverDefaultLevel,
} from '@discordy/core/domain/notificationSettings';
import type { NotificationLevel } from '@discordy/core/contracts/rest';
import { muteChannel, muteGuild, setChannelLevel, setGuildLevel, setGuildToggles } from '../../app/notificationActions';
import { Button } from '../../shared/ui/Button';
import { Field, Segmented, Select, SettingRow, Switch } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

type LevelChoice = 'inherit' | '0' | '1' | '2';
const toChoice = (l: NotificationLevel | null | undefined): LevelChoice => (l == null ? 'inherit' : (String(l) as LevelChoice));
const fromChoice = (c: LevelChoice): NotificationLevel | null => (c === 'inherit' ? null : (Number(c) as NotificationLevel));
function useLevelOptions() {
  const { t } = useI18n();
  return NOTIFICATION_LEVELS.map((l) => ({ value: String(l.value) as LevelChoice, label: t(`notifications.${l.value}`) }));
}

function useClose() {
  const openDialog = useUiStore((s) => s.openDialog);
  return () => openDialog(null);
}

/** Pick a mute duration; shows an Unmute action while muted. */
function MuteControl({ muted, noun, onMute }: { muted: boolean; noun: string; onMute: (seconds: number | null | undefined) => void }) {
  const { t } = useI18n();
  return muted ? (
    <Button variant="ghost" onClick={() => onMute(undefined)}>{t('notifications.unmute', { target: noun })}</Button>
  ) : (
    <Select aria-label={t('notifications.mute', { target: noun })} value="" onChange={(e) => e.target.value && onMute(MUTE_DURATIONS.find((d) => d.id === e.target.value)?.seconds ?? null)}>
      <option value="">{t('notifications.mute', { target: noun })}…</option>
      {MUTE_DURATIONS.map((d) => <option key={d.id} value={d.id}>{t(`notifications.${d.id}`)}</option>)}
    </Select>
  );
}

/** Per-server notification settings (Discord "Notification Settings"), synced to the account. */
export function GuildNotificationDialog({ guildId }: { guildId: string }) {
  const { t, date } = useI18n();
  const close = useClose();
  const levelOptions = useLevelOptions();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]) ?? emptySettings(guildId);
  const now = Date.now();
  const level = settings.message_notifications ?? serverDefaultLevel(guild?.default_message_notifications);
  const overrides = activeOverrides(settings, now);
  const muted = isGuildMuted(settings, now);
  return (
    <Modal open onClose={close} title={t('notifications.for', { name: guild?.name ?? t('common.server') })} width={520}>
      <div className="stack">
        <SettingRow title={t('notifications.mute', { target: t('common.server') })} description={t('notifications.muteHelp')}>
          <MuteControl muted={muted} noun={t('common.server')} onMute={(s) => void muteGuild(guildId, s)} />
        </SettingRow>
        {muted && settings.mute_config?.end_time && <p className="confirm-body">{t('notifications.mutedUntil', { time: date(new Date(settings.mute_config.end_time), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
        <Field label={t('notifications.serverSettings')}>
          {() => <Segmented label={t('notifications.serverLevel')} value={String(level) as LevelChoice} options={levelOptions} onChange={(v) => void setGuildLevel(guildId, fromChoice(v))} />}
        </Field>
        <SettingRow title={t('notifications.suppressEveryone')}>
          <Switch label={t('notifications.suppressEveryone')} checked={settings.suppress_everyone} onChange={(v) => void setGuildToggles(guildId, { suppress_everyone: v })} />
        </SettingRow>
        <SettingRow title={t('notifications.suppressRoles')}>
          <Switch label={t('notifications.suppressRoles')} checked={settings.suppress_roles} onChange={(v) => void setGuildToggles(guildId, { suppress_roles: v })} />
        </SettingRow>
        <SettingRow title={t('notifications.hideMuted')}>
          <Switch label={t('notifications.hideMuted')} checked={settings.hide_muted_channels} onChange={(v) => void setGuildToggles(guildId, { hide_muted_channels: v })} />
        </SettingRow>
        <h4>{t('notifications.overrides')}</h4>
        {overrides.length === 0 && <p className="confirm-body">{t('notifications.noOverrides')}</p>}
        <ul className="override-list">
          {overrides.map((o) => {
            const channel = channels[o.channel_id];
            return (
              <li key={o.channel_id} className="override-row">
                <span className="override-name">{channel ? `${channel.type === 4 ? '' : '#'}${channel.name}` : t('notifications.deleted')}</span>
                <Select aria-label={t('notifications.levelFor', { name: channel?.name ?? t('common.channel') })} value={toChoice(o.message_notifications)} onChange={(e) => void setChannelLevel(guildId, o.channel_id, fromChoice(e.target.value as LevelChoice))}>
                  <option value="inherit">{t('notifications.serverDefault')}</option>
                  {levelOptions.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
                {isMuteActive(o.muted, o.mute_config, now) && <Button variant="ghost" onClick={() => void muteChannel(guildId, o.channel_id, undefined)}>{t('notifications.unmuteAction')}</Button>}
              </li>
            );
          })}
        </ul>
        <div className="row-end">
          <Button variant="primary" onClick={close} data-autofocus>{t('common.done')}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Per channel or category notification level and mute. */
export function ChannelNotificationDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'notifications' }> }) {
  const { t } = useI18n();
  const close = useClose();
  const levelOptions = useLevelOptions();
  const channel = useGuildStore((s) => s.channels[dialog.targetId]);
  const guildId = channel?.guild_id ?? null;
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const override = channelOverride(settings, dialog.targetId);
  const muted = isChannelMuted(settings && { ...settings, muted: false }, dialog.targetId, Date.now());
  const noun = t(dialog.category ? 'common.category' : 'common.channel');
  return (
    <Modal open onClose={close} title={t('notifications.for', { name: `${dialog.category ? '' : '#'}${dialog.name}` })} width={440}>
      <div className="stack">
        <Field label={t('notifications.notifyFor')}>
          {() => (
            <Segmented
              label={t('notifications.level')}
              value={toChoice(override?.message_notifications)}
              options={[{ value: 'inherit' as LevelChoice, label: t('common.default') }, ...levelOptions]}
              onChange={(v) => void setChannelLevel(guildId, dialog.targetId, fromChoice(v))}
            />
          )}
        </Field>
        <SettingRow title={t('notifications.mute', { target: noun })}>
          <MuteControl muted={muted} noun={noun} onMute={(s) => void muteChannel(guildId, dialog.targetId, s)} />
        </SettingRow>
        <p className="confirm-body">{t('notifications.synced')}</p>
        <div className="row-end">
          <Button variant="primary" onClick={close} data-autofocus>{t('common.done')}</Button>
        </div>
      </div>
    </Modal>
  );
}
