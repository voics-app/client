import { ChannelType, type Channel, type User } from '@discordy/core/contracts/rest';
import { dmListItems, dmRows } from '../../src/dms/dmModel';
import { confirmLabel, filterCandidates, MAX_RECIPIENTS, toggleRecipient } from '../../src/dms/newDmModel';

const user = (id: string): User => ({ id, username: `user${id}`, global_name: null, avatar: null });
const dm = (id: string): Channel => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients: [user(id)] }) as unknown as Channel;
const rows = dmRows({ channels: { a: dm('1000000000000000'), b: dm('2000000000000000'), c: dm('3000000000000000') }, closed: {}, relationships: {} });

describe('dmListItems', () => {
  it('lists everything under no heading when nothing is pinned', () => {
    expect(dmListItems(rows, []).map((i) => i.kind)).toEqual(['dm', 'dm', 'dm']);
  });

  it('puts pins first in pin order under Pinned, the rest under Direct messages', () => {
    const items = dmListItems(rows, ['1000000000000000', '3000000000000000']);
    expect(items.map((i) => (i.kind === 'header' ? i.title : `${i.row.id}${i.pinned ? '*' : ''}`))).toEqual(['Pinned', '1000000000000000*', '3000000000000000*', 'Direct messages', '2000000000000000']);
  });

  it('ignores pins of closed or unknown conversations and shows no second heading when all are pinned', () => {
    expect(dmListItems(rows, ['9']).some((i) => i.kind === 'header')).toBe(false);
    const all = dmListItems(rows, rows.map((r) => r.id));
    expect(all.filter((i) => i.kind === 'header').map((i) => (i.kind === 'header' ? i.title : ''))).toEqual(['Pinned']);
  });
});

describe('new message picker', () => {
  const people = [
    { id: '1', name: 'Zoe', avatar: null },
    { id: '2', name: 'Pat', avatar: null },
    { id: '3', name: 'patricia', avatar: null },
  ];

  it('filters by name ignoring case and sorts alphabetically', () => {
    expect(filterCandidates(people, '').map((c) => c.name)).toEqual(['Pat', 'patricia', 'Zoe']);
    expect(filterCandidates(people, ' PAT ').map((c) => c.name)).toEqual(['Pat', 'patricia']);
    expect(filterCandidates(people, 'nobody')).toEqual([]);
  });

  it('toggles people and stops adding at the group limit', () => {
    expect(toggleRecipient(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleRecipient(['a', 'b'], 'a')).toEqual(['b']);
    const full = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `u${i}`);
    expect(toggleRecipient(full, 'extra')).toEqual(full);
    expect(toggleRecipient(full, 'u0')).toHaveLength(MAX_RECIPIENTS - 1);
  });

  it('names the confirm button by how many are picked', () => {
    expect([0, 1, 2].map(confirmLabel)).toEqual([null, 'Message', 'Create group']);
    expect(MAX_RECIPIENTS).toBe(24);
  });
});
