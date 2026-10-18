import { CaretDown } from '@phosphor-icons/react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { useGuildMenuEntries } from './GuildMenu';

export function GuildHeader({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const entries = useGuildMenuEntries(guildId);
  const menu = useMenu();
  if (!guild) return null;
  return (
    <>
      <button type="button" className="guild-header" onClick={menu.openBelow} aria-haspopup="menu" aria-expanded={menu.open}>
        <span className="guild-header-name">{guild.name}</span>
        <CaretDown size={14} weight="bold" className={menu.open ? 'is-open' : ''} />
      </button>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} minWidth={236} />
    </>
  );
}
