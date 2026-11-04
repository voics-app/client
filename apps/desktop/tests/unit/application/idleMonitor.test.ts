import { describe, expect, it } from 'vitest';
import { IdleMonitor } from '@renderer/application/idleMonitor';
import type { ManualStatus } from '@discordy/core/domain/selfPresence';

function setup(manual: ManualStatus | undefined = undefined, timeoutMinutes = 5) {
  const state = { idle: 0, flag: false, manual, changes: [] as boolean[], timeoutMinutes };
  const monitor = new IdleMonitor({
    idleSeconds: async () => state.idle,
    timeoutMinutes: async () => state.timeoutMinutes,
    manual: () => state.manual,
    current: () => state.flag,
    onChange: (v) => {
      state.flag = v;
      state.changes.push(v);
    },
  });
  return { state, monitor };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('IdleMonitor', () => {
  it('flips to idle after the timeout and back on activity, once each', async () => {
    const { state, monitor } = setup();
    state.idle = 299;
    await monitor.tick();
    expect(state.changes).toEqual([]);
    state.idle = 300;
    await monitor.tick();
    await monitor.tick();
    expect(state.changes).toEqual([true]);
    state.idle = 1;
    await monitor.tick();
    expect(state.changes).toEqual([true, false]);
  });
  it('goes idle on lock and online on unlock', async () => {
    const { state, monitor } = setup();
    monitor.setLocked(true);
    await flush();
    expect(state.changes).toEqual([true]);
    monitor.setLocked(false);
    await flush();
    expect(state.changes).toEqual([true, false]);
  });
  it('leaves DND and Invisible alone', async () => {
    for (const manual of ['dnd', 'invisible'] as const) {
      const { state, monitor } = setup(manual);
      state.idle = 99999;
      await monitor.tick();
      expect(state.changes).toEqual([]);
    }
  });
  it('clears idle when the user switches to DND while idle', async () => {
    const { state, monitor } = setup();
    state.idle = 999;
    await monitor.tick();
    state.manual = 'dnd';
    await monitor.tick();
    expect(state.changes).toEqual([true, false]);
  });
  it('survives a failing idle read', async () => {
    const monitor = new IdleMonitor({
      idleSeconds: async () => {
        throw new Error('x');
      },
      timeoutMinutes: async () => 5,
      manual: () => undefined,
      current: () => false,
      onChange: () => undefined,
    });
    await expect(monitor.tick()).resolves.toBeUndefined();
  });
});
