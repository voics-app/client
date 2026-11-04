import { beforeEach, describe, expect, it } from 'vitest';
import { fractionOf, useTransferStore } from '../../src/application/stores/transferStore';

describe('transferStore', () => {
  beforeEach(() => useTransferStore.getState().reset());

  it('merges patches per transfer', () => {
    const s = useTransferStore.getState();
    s.update('a', { state: 'sending', loaded: 0, total: 100 });
    s.update('a', { loaded: 40 });
    expect(useTransferStore.getState().transfers.a).toEqual({ state: 'sending', loaded: 40, total: 100 });
  });

  it('computes a clamped fraction', () => {
    expect(fractionOf({ state: 'sending', loaded: 50, total: 200 })).toBe(0.25);
    expect(fractionOf({ state: 'sending', loaded: 5, total: 0 })).toBe(0);
    expect(fractionOf({ state: 'sending', loaded: 500, total: 100 })).toBe(1);
    expect(fractionOf(undefined)).toBe(0);
  });
});
