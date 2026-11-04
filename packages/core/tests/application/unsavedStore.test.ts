import { beforeEach, describe, expect, it } from 'vitest';
import { closeSettings, useUnsavedStore } from '../../src/application/stores/unsavedStore';
import { useUiStore } from '../../src/application/stores/uiStore';

const store = () => useUnsavedStore.getState();

beforeEach(() => {
  useUnsavedStore.setState({ sources: {}, shake: 0, escBlocked: false });
  useUiStore.setState({ settings: { kind: 'user', tab: 'profile' } });
});

describe('unsaved changes store', () => {
  it('allows leaving when nothing is dirty', () => {
    expect(store().requestLeave()).toBe(true);
    expect(store().requestLeave(true)).toBe(true);
    expect(store().shake).toBe(0);
  });

  it('blocks and shakes the close button while dirty, every time', () => {
    store().setDirty('profile', true);
    expect(store().requestLeave()).toBe(false);
    expect(store().requestLeave()).toBe(false);
    expect(store().shake).toBe(2);
  });

  it('blocks Escape once, then lets a second Escape discard', () => {
    store().setDirty('profile', true);
    expect(store().requestLeave(true)).toBe(false);
    expect(store().shake).toBe(1);
    expect(store().requestLeave(true)).toBe(true);
    expect(store().sources).toEqual({});
  });

  it('forgets the blocked Escape after the edits are saved', () => {
    store().setDirty('profile', true);
    store().requestLeave(true);
    store().setDirty('profile', false);
    store().setDirty('profile', true);
    expect(store().requestLeave(true)).toBe(false);
  });

  it('stays dirty while any page is dirty', () => {
    store().setDirty('a', true);
    store().setDirty('b', true);
    store().setDirty('a', false);
    expect(store().requestLeave()).toBe(false);
    store().setDirty('b', false);
    expect(store().requestLeave()).toBe(true);
  });

  it('closeSettings only closes when leaving is allowed', () => {
    store().setDirty('profile', true);
    closeSettings();
    expect(useUiStore.getState().settings).not.toBeNull();
    closeSettings(true);
    expect(useUiStore.getState().settings).not.toBeNull();
    closeSettings(true);
    expect(useUiStore.getState().settings).toBeNull();
  });
});
