import { passesEdgeSwipe } from '../../src/messages/edgeSwipeModel';

describe('member list edge swipe', () => {
  it('opens after 60 pt to the left or a fast flick', () => {
    expect(passesEdgeSwipe(-59, 0)).toBe(false);
    expect(passesEdgeSwipe(-60, 0)).toBe(true);
    expect(passesEdgeSwipe(-20, -700)).toBe(true);
  });

  it('never opens on a rightward drag', () => {
    expect(passesEdgeSwipe(80, 900)).toBe(false);
  });
});
