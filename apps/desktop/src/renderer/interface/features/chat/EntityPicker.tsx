import { useMemo } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { entityChoices } from '@discordy/core/domain/entityChoices';
import { CommandOptionType as OptionType, type ApplicationCommandOption, type Channel } from '@discordy/core/contracts/rest';
import { displayName } from '../../shared/hooks/useNames';
import { Select } from '../../shared/ui/Form';

export interface EntityPickerProps {
  option: Pick<ApplicationCommandOption, 'type' | 'name' | 'required' | 'channel_types'>;
  value: string;
  channel: Channel;
  onChange: (value: string) => void;
}

export function EntityPicker({ option, value, channel, onChange }: EntityPickerProps) {
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
      <option value="">{option.required ? 'Choose…' : 'None'}</option>
      {option.type === OptionType.MENTIONABLE ? (
        <>
          <optgroup label="Members">{memberChoices.map(optionOf)}</optgroup>
          {roleChoices.length > 0 && <optgroup label="Roles">{roleChoices.map(optionOf)}</optgroup>}
        </>
      ) : (
        choices.map(optionOf)
      )}
    </Select>
  );
}

