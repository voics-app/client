import { stackScreenOptions } from '../../src/navigation/stackOptions';

describe('stack screen options', () => {
  it('shows only the back chevron, never the previous route name', () => {
    expect(stackScreenOptions.headerBackButtonDisplayMode).toBe('minimal');
  });
});
