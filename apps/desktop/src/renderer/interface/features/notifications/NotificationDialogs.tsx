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
const LEVEL_OPTIONS = NOTIFICATION_LEVELS.map((l) => ({ value: String(l.value) as LevelChoice, label: l.label }));

function useClose() {
  const openDialog = useUiStore((s) => s.openDialog);
  return () => openDialog(null);
}

/** Pick a mute duration; shows an Unmute action while muted. */
function MuteControl({ muted, noun, onMute }: { muted: boolean; noun: string; onMute: (seconds: number | null | undefined) => void }) {
  return muted ? (
    <Button variant="ghost" onClick={() => onMute(undefined)}>Unmute {noun}</Button>
  ) : (
    <Select aria-label={`Mute ${noun}`} value="" onChange={(e) => e.target.value && onMute(MUTE_DURATIONS.find((d) => d.id === e.target.value)?.seconds ?? null)}>
      <option value="">Mute {noun}...</option>
      {MUTE_DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
    </Select>
  );
}

/** Per-server notification settings (Discord "Notification Settings"), synced to the account. */
export function GuildNotificationDialog({ guildId }: { guildId: string }) {
  const close = useClose();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]) ?? emptySettings(guildId);
  const now = Date.now();
  const level = settings.message_notifications ?? serverDefaultLevel(guild?.default_message_notifications);
  const overrides = activeOverrides(settings, now);
  const muted = isGuildMuted(settings, now);
  return (
    <Modal open onClose={close} title={`Notification settings: ${guild?.name ?? 'server'}`} width={520}>
      <div className="stack">
        <SettingRow title="Mute server" description="Muted servers show no badges and send no notifications.">
          <MuteControl muted={muted} noun="server" onMute={(s) => void muteGuild(guildId, s)} />
        </SettingRow>
        {muted && settings.mute_config?.end_time && <p className="confirm-body">Muted until {new Date(settings.mute_config.end_time).toLocaleString()}.</p>}
        <Field label="Server notification settings">
          {() => <Segmented label="Server notification level" value={String(level) as LevelChoice} options={LEVEL_OPTIONS} onChange={(v) => void setGuildLevel(guildId, fromChoice(v))} />}
        </Field>
        <SettingRow title="Suppress @everyone and @here">
          <Switch label="Suppress @everyone and @here" checked={settings.suppress_everyone} onChange={(v) => void setGuildToggles(guildId, { suppress_everyone: v })} />
        </SettingRow>
        <SettingRow title="Suppress all role @mentions">
          <Switch label="Suppress all role mentions" checked={settings.suppress_roles} onChange={(v) => void setGuildToggles(guildId, { suppress_roles: v })} />
        </SettingRow>
        <SettingRow title="Hide muted channels">
          <Switch label="Hide muted channels" checked={settings.hide_muted_channels} onChange={(v) => void setGuildToggles(guildId, { hide_muted_channels: v })} />
        </SettingRow>
        <h4>Channel overrides</h4>
        {overrides.length === 0 && <p className="confirm-body">No channels differ from the server settings. Right-click a channel to add one.</p>}
        <ul className="override-list">
          {overrides.map((o) => {
            const channel = channels[o.channel_id];
            return (
              <li key={o.channel_id} className="override-row">
                <span className="override-name">{channel ? `${channel.type === 4 ? '' : '#'}${channel.name}` : 'Deleted channel'}</span>
                <Select aria-label={`Level for ${channel?.name ?? 'channel'}`} value={toChoice(o.message_notifications)} onChange={(e) => void setChannelLevel(guildId, o.channel_id, fromChoice(e.target.value as LevelChoice))}>
                  <option value="inherit">Server default</option>
                  {LEVEL_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
                {isMuteActive(o.muted, o.mute_config, now) && <Button variant="ghost" onClick={() => void muteChannel(guildId, o.channel_id, undefined)}>Unmute</Button>}
              </li>
            );
          })}
        </ul>
        <div className="row-end">
          <Button variant="primary" onClick={close} data-autofocus>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Per channel or category notification level and mute. */
export function ChannelNotificationDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'notifications' }> }) {
  const close = useClose();
  const channel = useGuildStore((s) => s.channels[dialog.targetId]);
  const guildId = channel?.guild_id ?? null;
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const override = channelOverride(settings, dialog.targetId);
  const muted = isChannelMuted(settings && { ...settings, muted: false }, dialog.targetId, Date.now());
  const noun = dialog.category ? 'category' : 'channel';
  return (
    <Modal open onClose={close} title={`Notification settings: ${dialog.category ? '' : '#'}${dialog.name}`} width={440}>
      <div className="stack">
        <Field label="Notify me for">
          {() => (
            <Segmented
              label="Notification level"
              value={toChoice(override?.message_notifications)}
              options={[{ value: 'inherit' as LevelChoice, label: 'Default' }, ...LEVEL_OPTIONS]}
              onChange={(v) => void setChannelLevel(guildId, dialog.targetId, fromChoice(v))}
            />
          )}
        </Field>
        <SettingRow title={`Mute ${noun}`}>
          <MuteControl muted={muted} noun={noun} onMute={(s) => void muteChannel(guildId, dialog.targetId, s)} />
        </SettingRow>
        <p className="confirm-body">Synced to your account, so it applies on all your devices.</p>
        <div className="row-end">
          <Button variant="primary" onClick={close} data-autofocus>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
