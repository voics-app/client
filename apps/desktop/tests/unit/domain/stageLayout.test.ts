import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_LAYOUT, arrangeStage, gridColumns, normalizeLayout, type StageTile } from '@renderer/domain/stageLayout';

const tile = (key: string, kind: StageTile['kind'] = 'avatar', isSelf = false): StageTile => ({ key, kind, hasVideo: kind !== 'avatar', isSelf });
const tiles = [tile('a:main', 'camera', true), tile('b:main'), tile('c:main', 'camera'), tile('c:screen', 'screen')];

describe('arrangeStage', () => {
  it('grid mode lists everyone without a main tile', () => {
    const a = arrangeStage(tiles, DEFAULT_STAGE_LAYOUT, null);
    expect(a.main).toBeNull();
    expect(a.rest).toHaveLength(4);
    expect(a.mode).toBe('grid');
  });
  it('a transient focus promotes that tile and keeps the filmstrip', () => {
    const a = arrangeStage(tiles, DEFAULT_STAGE_LAYOUT, 'c:main');
    expect(a.main?.key).toBe('c:main');
    expect(a.rest.map((t) => t.key)).toEqual(['a:main', 'b:main', 'c:screen']);
    expect(a.mode).toBe('focus');
  });
  it('a pinned tile beats the focus', () => {
    const a = arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, pinned: 'b:main' }, 'c:main');
    expect(a.main?.key).toBe('b:main');
  });
  it('focus layout without a target prefers a screen share', () => {
    expect(arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, mode: 'focus' }, null).main?.key).toBe('c:screen');
  });
  it('spotlight hides the filmstrip', () => {
    const a = arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, mode: 'spotlight', pinned: 'c:main' }, null);
    expect(a.mode).toBe('spotlight');
    expect(a.rest).toEqual([]);
  });
  it('hide non-video drops avatars but never the main tile', () => {
    const a = arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, hideNonVideo: true, pinned: 'b:main' }, null);
    expect(a.main?.key).toBe('b:main');
    expect(a.rest.every((t) => t.hasVideo)).toBe(true);
    expect(a.hidden).toBe(0);
    expect(arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, hideNonVideo: true }, null).hidden).toBe(1);
  });
  it('a stale pin falls back to grid', () => {
    expect(arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, pinned: 'gone' }, null).mode).toBe('grid');
  });
  it('an empty call does not crash focus layouts', () => {
    expect(arrangeStage([], { ...DEFAULT_STAGE_LAYOUT, mode: 'focus' }, null).main).toBeNull();
  });
});

describe('normalizeLayout / gridColumns', () => {
  it('sanitizes persisted junk', () => {
    expect(normalizeLayout({ mode: 'bogus' as never, pinned: 5 as never, hideNonVideo: 'yes' as never })).toEqual(DEFAULT_STAGE_LAYOUT);
    expect(normalizeLayout({ mode: 'spotlight', pinned: 'x', hideNonVideo: true })).toEqual({ mode: 'spotlight', pinned: 'x', hideNonVideo: true });
  });
  it('caps columns at four', () => {
    expect([0, 1, 2, 5, 30].map(gridColumns)).toEqual([1, 1, 2, 3, 4]);
  });
});
