import { WIDE_COLUMN_WIDTH, WIDE_MIN_SIDE, isWideWindow } from '../../src/shell/layoutModel';

describe('isWideWindow', () => {
  it('is a phone in portrait and in landscape, even the largest iPhone', () => {
    expect(isWideWindow({ width: 390, height: 844 })).toBe(false);
    expect(isWideWindow({ width: 932, height: 430 })).toBe(false);
  });
  it('is a tablet on every iPad size, in either orientation', () => {
    expect(isWideWindow({ width: 744, height: 1133 })).toBe(true);
    expect(isWideWindow({ width: 820, height: 1180 })).toBe(true);
    expect(isWideWindow({ width: 1366, height: 1024 })).toBe(true);
  });
  it('switches at the Android tablet breakpoint', () => {
    expect(isWideWindow({ width: WIDE_MIN_SIDE - 1, height: 1000 })).toBe(false);
    expect(isWideWindow({ width: WIDE_MIN_SIDE, height: 1000 })).toBe(true);
  });
  it('leaves the chat pane room beside the rail and the column on the narrowest tablet', () => {
    expect(744 - 72 - WIDE_COLUMN_WIDTH).toBeGreaterThanOrEqual(360);
  });
});
