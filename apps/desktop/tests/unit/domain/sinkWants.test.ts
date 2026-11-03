import { describe, expect, it } from 'vitest';
import { screenSinkWants } from '@renderer/domain/sinkWants';

describe('screenSinkWants', () => {
  const screens = { 'u1:screen': 111, 'u2:screen': 222 };

  it('opts into watched screens only', () => {
    expect(screenSinkWants(screens, ['u2:screen'])).toEqual({ '111': 0, '222': 100 });
  });

  it('wants nothing from unwatched screens', () => {
    expect(screenSinkWants(screens, [])).toEqual({ '111': 0, '222': 0 });
  });

  it('ignores watched keys without a known ssrc and empty maps', () => {
    expect(screenSinkWants({}, ['u1:screen'])).toEqual({});
    expect(screenSinkWants({ 'u1:screen': 0 }, ['u1:screen'])).toEqual({});
  });
});
