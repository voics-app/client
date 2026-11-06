import { beforeEach, describe, expect, it } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { GuildFolder, GuildFull } from '@discordy/core/contracts/rest';

const full = (id: string) => ({ id, name: id, channels: [], members: [] }) as unknown as GuildFull;
const single = (id: string): GuildFolder => ({ id: null, name: null, color: null, guild_ids: [id] });
const saved = [single('30'), single('10'), single('20')];
const order = () => useGuildStore.getState().order;

describe('server rail order across a session start', () => {
  beforeEach(() => useGuildStore.getState().reset());

  it('keeps the saved order when READY hydrates only some servers and the rest arrive by GUILD_CREATE', () => {
    useGuildStore.getState().hydrate([full('20')], [], undefined, saved);
    useGuildStore.getState().upsertGuild(full('10'));
    useGuildStore.getState().upsertGuild(full('30'));
    expect(order()).toEqual(['30', '10', '20']);
  });

  it('keeps the saved order when READY has no full servers at all', () => {
    useGuildStore.getState().hydrate([], [], undefined, saved);
    for (const id of ['20', '30', '10']) useGuildStore.getState().upsertGuild(full(id));
    expect(order()).toEqual(['30', '10', '20']);
  });

  it('keeps the saved legacy positions the same way', () => {
    useGuildStore.getState().hydrate([], [], ['30', '10', '20']);
    for (const id of ['20', '10', '30']) useGuildStore.getState().upsertGuild(full(id));
    expect(order()).toEqual(['30', '10', '20']);
  });

  it('sorts servers without a saved place stably after the saved ones, whatever the arrival order', () => {
    for (const arrival of [['9', '200', '10', '20', '30'], ['30', '200', '20', '9', '10']]) {
      useGuildStore.getState().reset();
      useGuildStore.getState().hydrate([], [], undefined, saved);
      for (const id of arrival) useGuildStore.getState().upsertGuild(full(id));
      expect(order()).toEqual(['30', '10', '20', '9', '200']);
    }
  });

  it('keeps a saved folder through a partial READY', () => {
    const folder: GuildFolder = { id: 1, name: 'f', color: null, guild_ids: ['10', '20'] };
    useGuildStore.getState().hydrate([full('20')], [], undefined, [folder, single('30')]);
    useGuildStore.getState().upsertGuild(full('10'));
    useGuildStore.getState().upsertGuild(full('30'));
    expect(useGuildStore.getState().rail).toEqual([folder, single('30')]);
  });

  it('keeps the saved order through a settings update that arrives before all servers did', () => {
    useGuildStore.getState().hydrate([full('20')], [], undefined, []);
    useGuildStore.getState().setRail(saved);
    useGuildStore.getState().upsertGuild(full('10'));
    useGuildStore.getState().upsertGuild(full('30'));
    expect(order()).toEqual(['30', '10', '20']);
  });
});
