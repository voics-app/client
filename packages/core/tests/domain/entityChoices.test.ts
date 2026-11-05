import { describe, expect, it } from 'vitest';
import { entityChoices, isEntityType } from '@discordy/core/domain/entityChoices';
import type { Channel, Role } from '@discordy/core/contracts/rest';

const T = { USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, STRING: 3 };
const role = (id: string, name: string, position: number) => ({ id, name, position, color: 0, hoist: false, permissions: '0', managed: false, mentionable: true }) as Role;
const ch = (id: string, name: string, type: number, position: number, guild = 'g1') => ({ id, name, type, position, guild_id: guild }) as Channel;
const input = {
  guildId: 'g1',
  users: [{ id: 'u2', name: 'Zed' }, { id: 'u1', name: 'Ann' }],
  roles: [role('g1', '@everyone', 0), role('r1', 'Mods', 2), role('r2', 'Staff', 5)],
  channels: [ch('c2', 'random', 0, 2), ch('c1', 'general', 0, 1), ch('cat', 'Talk', 4, 0), ch('v', 'lounge', 2, 3), ch('x', 'other', 0, 1, 'g2')],
};

describe('entityChoices', () => {
  it('lists users by name', () => {
    expect(entityChoices(T.USER, input)).toEqual([{ id: 'u1', label: 'Ann' }, { id: 'u2', label: 'Zed' }]);
  });
  it('lists roles highest first without @everyone', () => {
    expect(entityChoices(T.ROLE, input).map((c) => c.label)).toEqual(['Staff', 'Mods']);
  });
  it('lists the channels of the server by position, without categories, as #name', () => {
    expect(entityChoices(T.CHANNEL, input).map((c) => c.label)).toEqual(['#general', '#random', '#lounge']);
  });
  it('restricts channels to the asked types', () => {
    expect(entityChoices(T.CHANNEL, { ...input, channelTypes: [2] }).map((c) => c.id)).toEqual(['v']);
  });
  it('lists members then roles, grouped, for a mentionable', () => {
    expect(entityChoices(T.MENTIONABLE, input).map((c) => `${c.group}:${c.label}`)).toEqual(['Members:Ann', 'Members:Zed', 'Roles:Staff', 'Roles:Mods']);
  });
  it('offers nothing for a type that is not an entity', () => {
    expect(entityChoices(T.STRING, input)).toEqual([]);
    expect(isEntityType(T.STRING)).toBe(false);
    expect(isEntityType(T.ROLE)).toBe(true);
  });
  it('in a direct message offers no channels', () => {
    expect(entityChoices(T.CHANNEL, { ...input, guildId: null })).toEqual([]);
  });
});
