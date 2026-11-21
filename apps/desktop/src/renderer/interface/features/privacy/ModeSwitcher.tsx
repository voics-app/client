import { BRAND } from '@shared/brand';
import { useI18n } from '../../shared/i18n';
import { Check, Globe, LockKey, Plugs } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { DELIVERY_MODES, MODE_COPY, validateModeForChannel, validateModeForDevice } from '@discordy/core/domain/deliveryMode';
import { usePrivacyStore } from '@discordy/core/application/stores/privacyStore';
import { DISAPPEAR_NOTE, DISAPPEAR_OPTIONS } from '@discordy/core/domain/disappearing';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel, DeliveryMode } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { ModeBadge } from './ModeBadge';

const ICON = { standard: Globe, ephemeral: LockKey, p2p: Plugs } as const;

export function memberCountOf(channel: Channel): number {
  if (channel.guild_id) {
    const members = useGuildStore.getState().members[channel.guild_id];
    return channel.member_count ?? Object.keys(members ?? {}).length;
  }
  return (channel.recipients?.length ?? 0) + 1;
}

/** Composer/header control: shows the active mode and lets the user change it per chat or as an account default. */
export function ModeSwitcher({ channel, mode }: { channel: Channel; mode: DeliveryMode }) {
  const { t: msg, locale, catalogText } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DeliveryMode | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const defaultMode = useSessionStore((s) => s.settings.default_delivery_mode);
  const deviceRegistered = useSessionStore((s) => Boolean(s.deviceId));
  const perms = useGuildPermissions(channel.guild_id);
  const canChange = !channel.guild_id || can(perms, Permission.MANAGE_CHANNELS);
  const timer = usePrivacyStore((s) => s.timers[channel.id] ?? null);
  const scope = { isGuild: Boolean(channel.guild_id), memberCount: memberCountOf(channel) };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.mode-popover') && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const choose = async (target: DeliveryMode) => {
    setBusy(target);
    const sender = getRuntime().privacy.sender;
    await attempt(() => sender.setChannelMode(channel, target === 'standard' && !channel.guild_id ? null : target), msg("settings.modeswitcher.could.not.change.delivery.mode"));
    setBusy(null);
    setOpen(false);
  };

  const changeTimer = (value: string) =>
    void attempt(() => getRuntime().privacy.sender.setDisappearTimer(channel, value === '' ? null : Number(value)), msg("settings.modeswitcher.could.not.change.the.timer"));

  return (
    <span ref={triggerRef} className="mode-switcher">
      <ModeBadge
        mode={mode}
        onClick={() => {
          const r = triggerRef.current?.getBoundingClientRect();
          if (r) setPos({ x: r.left, y: r.top - 10 });
          setOpen((o) => !o);
        }}
      />
      {open &&
        createPortal(
          <div className="mode-popover glass" style={{ left: Math.max(12, Math.min(pos.x, window.innerWidth - 392)), top: pos.y }} role="dialog" aria-label={msg("settings.channelsettings.delivery.mode")}>
            <h3>{msg("settings.channelsettings.delivery.mode")}</h3>
            <p className="mode-popover-sub">{channel.guild_id ? msg("settings.modeswitcher.applies.to.everyone.in.this.channel") : msg("settings.modeswitcher.applies.to.this.conversation.the.strictest.setting.among.participants")}</p>
            <ul>
              {DELIVERY_MODES.map((m) => {
                const Icon = ICON[m];
                const invalid = validateModeForChannel(m, scope, locale) ?? validateModeForDevice(m, deviceRegistered, locale);
                const disabled = Boolean(invalid) || !canChange || busy !== null;
                return (
                  <li key={m}>
                    <button type="button" disabled={disabled} className={`mode-option mode-${m}${m === mode ? ' is-current' : ''}`} onClick={() => void choose(m)} aria-pressed={m === mode}>
                      <span className="mode-option-icon">
                        <Icon size={20} weight={m === 'standard' ? 'regular' : 'fill'} />
                      </span>
                      <span className="mode-option-copy">
                        <span className="mode-option-title">{MODE_COPY[m].label}</span>
                        <span className="mode-option-desc">{invalid ?? (!canChange ? msg("settings.modeswitcher.you.need.manage.channels.to.change.this") : msg(`mode.${m}Description`, { brand: BRAND.displayName }))}</span>
                      </span>
                      {m === mode && <Check size={16} weight="bold" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {mode !== 'standard' && (
              <div className="mode-timer">
                <label htmlFor={`disappear-${channel.id}`}>{msg("settings.modeswitcher.disappearing.messages")}</label>
                <select id={`disappear-${channel.id}`} value={timer ?? ''} onChange={(e) => changeTimer(e.target.value)}>
                  {DISAPPEAR_OPTIONS.map((o) => (
                    <option key={o.label} value={o.ttlMs ?? ''}>
                      {catalogText(o.label)}
                    </option>
                  ))}
                </select>
                <p className="mode-popover-foot">{catalogText(DISAPPEAR_NOTE)}</p>
              </div>
            )}
            {!channel.guild_id && (
              <p className="mode-popover-foot">
                {msg("mode.accountDefault", { mode: MODE_COPY[defaultMode].label })}
              </p>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
