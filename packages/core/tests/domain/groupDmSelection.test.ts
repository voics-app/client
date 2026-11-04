import { describe, expect, it } from 'vitest';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { bulkLeaveConfirmation, bulkLeaveOutcomeMessage, leaveSequentially, pruneSelection, selectableGroupIds, toggleSelected } from '@discordy/core/domain/groupDmSelection';

const ch = (id: string, type: number): Channel => ({ id, type }) as unknown as Channel;

describe('selectableGroupIds', () => {
  it('only offers group DMs, never 1:1 DMs', () => {
    expect(selectableGroupIds([ch('a', ChannelType.DM), ch('b', ChannelType.GROUP_DM), ch('c', ChannelType.GROUP_DM)])).toEqual(['b', 'c']);
  });
});

describe('toggleSelected', () => {
  it('adds and removes without mutating', () => {
    const first: string[] = [];
    const one = toggleSelected(first, 'a');
    expect(one).toEqual(['a']);
    expect(first).toEqual([]);
    expect(toggleSelected(toggleSelected(one, 'b'), 'a')).toEqual(['b']);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer selectable', () => {
    expect(pruneSelection(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });
  it('keeps the same array when nothing changes', () => {
    const sel = ['a'];
    expect(pruneSelection(sel, ['a'])).toBe(sel);
  });
});

describe('bulkLeaveConfirmation', () => {
  it('states how many group DMs will be left', () => {
    expect(bulkLeaveConfirmation(1)).toMatchObject({ title: 'Leave 1 group DM?', confirmLabel: 'Leave group DM' });
    expect(bulkLeaveConfirmation(3)).toMatchObject({ title: 'Leave 3 group DMs?', confirmLabel: 'Leave 3 group DMs' });
  });
});

describe('leaveSequentially', () => {
  it('leaves one at a time, in order, and continues after a failure', async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const result = await leaveSequentially(['a', 'b', 'c'], async (id) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      order.push(id);
      running--;
      return id !== 'b';
    });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(result).toEqual({ left: ['a', 'c'], failed: ['b'] });
  });
  it('treats a thrown error as a failure', async () => {
    const result = await leaveSequentially(['a', 'b'], async (id) => {
      if (id === 'a') throw new Error('boom');
      return true;
    });
    expect(result).toEqual({ left: ['b'], failed: ['a'] });
  });
});

describe('bulkLeaveOutcomeMessage', () => {
  const names = { a: 'Alpha', b: 'Beta', c: 'Gamma' };
  it('reports full success', () => {
    expect(bulkLeaveOutcomeMessage({ left: ['a', 'b'], failed: [] }, names)).toEqual({ tone: 'success', title: 'Left 2 group DMs', body: undefined });
  });
  it('names the groups that could not be left', () => {
    expect(bulkLeaveOutcomeMessage({ left: ['a'], failed: ['b', 'c'] }, names)).toEqual({ tone: 'danger', title: 'Left 1 group DM, 2 failed', body: 'Could not leave: Beta, Gamma' });
  });
  it('falls back to the id for an unknown name', () => {
    expect(bulkLeaveOutcomeMessage({ left: [], failed: ['z'] }, names).body).toBe('Could not leave: z');
  });
});
