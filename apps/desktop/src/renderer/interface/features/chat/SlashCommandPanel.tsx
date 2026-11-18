import { useI18n } from '../../shared/i18n';
import { Command, X } from '@phosphor-icons/react';
import { useMemo, type KeyboardEvent } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { entityChoices } from '@discordy/core/domain/entityChoices';
import { validateValues, type OptionValues, type SlashEntry } from '@discordy/core/domain/slashCommand';
import { CommandOptionType as OptionType, type ApplicationCommandOption, type Channel } from '@discordy/core/contracts/rest';
import { displayName } from '../../shared/hooks/useNames';
import { Button } from '../../shared/ui/Button';
import { Input, Select, Switch } from '../../shared/ui/Form';
import { IconButton } from '../../shared/ui/IconButton';

interface EntityPickerProps {
  option: Pick<ApplicationCommandOption, 'type' | 'name' | 'required' | 'channel_types'>;
  value: string;
  channel: Channel;
  onChange: (value: string) => void;
}

export function EntityPicker({ option, value, channel, onChange }: EntityPickerProps) {
  const { t: msg } = useI18n();
  const guildId = channel.guild_id;
  const members = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const channels = useGuildStore((s) => s.channels);
  const roles = useGuildStore((s) => (guildId ? s.guilds[guildId]?.roles : undefined));

  const choices = useMemo(() => {
    const users = guildId ? Object.values(members ?? {}).map((m) => ({ id: m.user.id, name: displayName(m.user, m.nick) })) : (channel.recipients ?? []).map((u) => ({ id: u.id, name: displayName(u) }));
    return entityChoices(option.type, { guildId, users, channels: Object.values(channels), roles: roles ?? [], channelTypes: option.channel_types });
  }, [option.type, option.channel_types, guildId, members, channel.recipients, channels, roles]);
  const optionOf = (c: { id: string; label: string }) => <option key={c.id} value={c.id}>{c.label}</option>;
  const memberChoices = choices.filter((c) => c.group === 'Members');
  const roleChoices = choices.filter((c) => c.group === 'Roles');

  return (
    <Select value={value} aria-label={option.name} onChange={(e) => onChange(e.target.value)}>
      <option value="">{option.required ? msg("settings.slashcommandpanel.choose") : msg("settings.slashcommandpanel.none")}</option>
      {option.type === OptionType.MENTIONABLE ? (
        <>
          <optgroup label={msg("settings.servertabs.members")}>{memberChoices.map(optionOf)}</optgroup>
          {roleChoices.length > 0 && <optgroup label={msg("settings.profiledialog.roles")}>{roleChoices.map(optionOf)}</optgroup>}
        </>
      ) : (
        choices.map(optionOf)
      )}
    </Select>
  );
}

function OptionControl({ option, value, channel, onChange }: EntityPickerProps & { option: ApplicationCommandOption }) {
  const { t: msg } = useI18n();
  if (option.choices && option.choices.length > 0) {
    return (
      <Select value={value} aria-label={option.name} onChange={(e) => onChange(e.target.value)}>
        <option value="">{option.required ? msg("settings.slashcommandpanel.choose") : msg("settings.slashcommandpanel.none")}</option>
        {option.choices.map((c) => <option key={String(c.value)} value={String(c.value)}>{c.name}</option>)}
      </Select>
    );
  }
  switch (option.type) {
    case OptionType.BOOLEAN:
      return <Switch checked={value === 'true'} label={option.name} onChange={(v) => onChange(String(v))} />;
    case OptionType.USER:
    case OptionType.ROLE:
    case OptionType.CHANNEL:
    case OptionType.MENTIONABLE:
      return <EntityPicker option={option} value={value} channel={channel} onChange={onChange} />;
    case OptionType.INTEGER:
    case OptionType.NUMBER:
      return <Input value={value} inputMode="decimal" aria-label={option.name} placeholder={option.description} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input value={value} aria-label={option.name} placeholder={option.description} maxLength={option.max_length} onChange={(e) => onChange(e.target.value)} />;
  }
}

interface Props {
  entry: SlashEntry;
  values: OptionValues;
  channel: Channel;
  busy: boolean;
  onChange: (values: OptionValues) => void;
  onRun: () => void;
  onCancel: () => void;
}

/** Option form for the command being composed: one picker per option, required ones first. */
export function SlashCommandPanel({ entry, values, channel, busy, onChange, onRun, onCancel }: Props) {
  const { t: msg, locale } = useI18n();
  const appName = useInteractionStore((s) => s.appNames[entry.command.application_id]);
  const errors = validateValues(entry.options, values, locale);
  const ordered = [...entry.options].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
  const ready = Object.keys(errors).length === 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.target as HTMLElement).tagName !== 'SELECT') {
      e.preventDefault();
      if (ready) onRun();
    }
  };

  return (
    <div className="slash-panel" role="group" aria-label={msg("command.named", { name: entry.label })} onKeyDown={onKeyDown}>
      <header className="slash-head">
        <Command size={16} weight="bold" />
        <strong>/{entry.label}</strong>
        {appName && <span className="slash-app">{appName}</span>}
        <span className="slash-desc">{entry.description}</span>
        <IconButton label={msg("settings.slashcommandpanel.cancel.command")} size="sm" onClick={onCancel}><X size={14} /></IconButton>
      </header>
      {ordered.length > 0 && (
        <div className="slash-fields">
          {ordered.map((o, i) => {
            const touched = (values[o.name] ?? '') !== '';
            const error = touched || o.required ? errors[o.name] : undefined;
            return (
              <div key={o.name} className="slash-field">
                <label className="slash-label">
                  {o.name}
                  {o.required ? <span className="slash-required" aria-label={msg("settings.slashcommandpanel.required")}>*</span> : <span className="slash-optional">{msg("settings.slashcommandpanel.optional")}</span>}
                </label>
                <div data-autofocus={i === 0 ? '' : undefined}>
                  <OptionControl option={o} value={values[o.name] ?? ''} channel={channel} onChange={(v) => onChange({ ...values, [o.name]: v })} />
                </div>
                {error && touched && <p className="field-error" role="alert">{error}</p>}
              </div>
            );
          })}
        </div>
      )}
      <footer className="slash-foot">
        <span className="slash-hint">{msg("settings.slashcommandpanel.enter.to.run.esc.to.cancel")}</span>
        <Button variant="primary" size="sm" loading={busy} disabled={!ready} onClick={onRun}>{msg("settings.slashcommandpanel.run.command")}</Button>
      </footer>
    </div>
  );
}
