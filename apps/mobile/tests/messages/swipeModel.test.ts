import { pastThreshold, SWIPE_MAX, SWIPE_THRESHOLD, swipeOffset, swipeProgress } from '../../src/messages/swipeModel';

describe('swipe to reply', () => {
  it('follows the finger leftwards only', () => {
    expect(swipeOffset(20)).toBe(0);
    expect(swipeOffset(-30)).toBe(-30);
  });

  it('eases past the threshold and stops at the maximum', () => {
    expect(swipeOffset(-SWIPE_THRESHOLD)).toBe(-SWIPE_THRESHOLD);
    expect(swipeOffset(-SWIPE_THRESHOLD - 40)).toBe(-(SWIPE_THRESHOLD + 12));
    expect(swipeOffset(-1000)).toBe(-SWIPE_MAX);
  });

  it('replies only from a drag of 64 pt or more', () => {
    expect(pastThreshold(-63)).toBe(false);
    expect(pastThreshold(-64)).toBe(true);
    expect(pastThreshold(80)).toBe(false);
  });

  it('fades the icon in as the threshold nears', () => {
    expect(swipeProgress(0)).toBe(0);
    expect(swipeProgress(-32)).toBe(0.5);
    expect(swipeProgress(-200)).toBe(1);
  });
});
